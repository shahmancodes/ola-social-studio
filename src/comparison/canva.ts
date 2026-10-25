import crypto from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import Ajv from "ajv";
import { labDb, event, saveAttempt } from "./store";
import { canvaBlockReason, ORIGIN } from "./config";
import type { Attempt } from "./types";
import { canvaQuotaRejection, CanvaQuotaError } from './canva-quota';

export const MCP_URL = "https://api.canva.com/connect/v1/mcp";
// MCP initialization needs profile access even when the workflow only uses designs.
export const CANVA_SCOPES = "profile:read design:meta:read design:content:read design:content:write asset:read asset:write";
const callback = `${ORIGIN}/api/canva/callback`;
export const toolNames = ["create-upload-url", "generate-design", "get-design-candidates", "create-design-from-candidate", "create-design", "get-create-design-async-job", "get-design", "get-design-pages", "get-design-content", "start-editing-transaction", "perform-editing-operations", "commit-editing-transaction", "cancel-editing-transaction", "get-export-formats", "export-design", "resize-design"] as const;
export type ToolSpec = { name: string; inputSchema: Record<string, unknown>; description?: string };
function key() { const value = Buffer.from(process.env.COMPARISON_CANVA_TOKEN_KEY || "", "base64url"); if (value.length !== 32) throw new Error("COMPARISON_CANVA_TOKEN_KEY must encode 32 random bytes (base64url)."); return value; }
export function putSecret(name: string, value: unknown) {
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  labDb().prepare("INSERT OR REPLACE INTO secrets VALUES(?,?)").run(name,[iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.'));
}
export function readSecret<T>(name: string): T | undefined {
  const row=labDb().prepare("SELECT value FROM secrets WHERE key=?").get(name) as { value:string } | undefined;
  if(!row)return;
  const [iv,tag,bytes]=row.value.split('.').map(s=>Buffer.from(s,'base64url'));
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(bytes),decipher.final()]).toString());
}
export function connected() { return Boolean(labDb().prepare("SELECT 1 FROM secrets WHERE key='tokens'").get()); }
export function allowedCanvaUrl(raw: string) {
  const url=new URL(raw);
  if(url.protocol!=="https:" || url.username || url.password || (url.port && url.port!=="443") || !["canva.com","canva.ai","canvausercontent.com","canva.dev","canva.link"].some(d=>url.hostname===d || url.hostname.endsWith('.'+d))) throw new Error("Unexpected Canva resource URL.");
  return url;
}
export const pause = (ms:number, signal?:AbortSignal) => new Promise<void>((resolve,reject)=>{
  signal?.throwIfAborted();
  const timer=setTimeout(done,ms);
  function done(){signal?.removeEventListener('abort',abort);resolve();}
  function abort(){clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal?.reason);}
  signal?.addEventListener('abort',abort,{once:true});
});
/** Bounded 429 retry only: never replay a request after an ambiguous transport failure. */
export async function canvaFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = allowedCanvaUrl(input instanceof Request ? input.url : String(input));
  for(let n=0;n<4;n++) {
    const response=await fetch(input instanceof Request ? input : url,{...init,redirect:"manual",signal:init?.signal ?? AbortSignal.timeout(120_000)});
    if(response.status!==429)return response;
    if(n===3)throw new Error("Canva rate limit reached. Retry this contender later.");
    const raw=response.headers.get('retry-after');
    const seconds=raw ? (Number.isFinite(Number(raw)) ? Number(raw) : (Date.parse(raw)-Date.now())/1000) : 2**n;
    if(seconds>60)throw new Error(`Canva requested a ${Math.ceil(seconds)} second cooldown. Retry later.`);
    await response.body?.cancel(); await pause(Math.max(1,seconds)*1000,init?.signal ?? undefined);
  }
  throw new Error("Canva unavailable.");
}
export async function downloadCanva(raw: string, signal?:AbortSignal) {
  let url=raw;
  for(let i=0;i<5;i++) {
    const r=await canvaFetch(url,{signal});
    if(r.status>=300&&r.status<400&&r.headers.get('location')) {url=new URL(r.headers.get('location')!,url).href;await r.body?.cancel();continue;}
    if(!r.ok)throw new Error(`Canva download failed (${r.status}).`);
    if(Number(r.headers.get('content-length'))>40*1024*1024)throw new Error("Canva export exceeds 40 MB.");
    const reader=r.body?.getReader();if(!reader)throw new Error("Empty Canva download.");
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>40*1024*1024){await reader.cancel();throw new Error('Canva export exceeds 40 MB.');}chunks.push(value);}
    return Buffer.concat(chunks);
  }
  throw new Error("Too many Canva download redirects.");
}
function provider(session?:string, redirected?:(url:string)=>void):OAuthClientProvider {
  return {
    redirectUrl:callback,
    clientMetadata:{redirect_uris:[callback],client_name:"Ola Sentinel",grant_types:["authorization_code","refresh_token"],response_types:["code"],token_endpoint_auth_method:"client_secret_basic",scope:CANVA_SCOPES},
    state:()=>session || crypto.randomBytes(32).toString('base64url'),
    clientInformation:()=>({client_id:process.env.COMPARISON_CANVA_CLIENT_ID!,client_secret:process.env.COMPARISON_CANVA_CLIENT_SECRET!}),
    tokens:()=>readSecret<OAuthTokens>('tokens'),saveTokens:tokens=>putSecret('tokens',tokens),
    redirectToAuthorization:url=>{allowedCanvaUrl(url.href);if(!redirected)throw new Error("Canva authorization expired. Reconnect Canva in the lab.");redirected(url.href);},
    saveCodeVerifier:verifier=>{if(!session)throw new Error("Reconnect Canva in the lab.");putSecret(`oauth:${session}`,{verifier,expiresAt:Date.now()+600_000});},
    codeVerifier:()=>{const state=readSecret<{verifier:string;expiresAt:number}>(`oauth:${session}`);if(!state||state.expiresAt<Date.now())throw new Error("Canva authorization expired.");return state.verifier;},
    invalidateCredentials:scope=>{if(scope==='all'||scope==='tokens')labDb().prepare("DELETE FROM secrets WHERE key='tokens'").run();},
  };
}
export async function beginOAuth() {
  const block=canvaBlockReason();if(block)throw new Error(block);key();
  const state=crypto.randomBytes(32).toString('base64url');let redirect:string|undefined;
  // Explicit reconnect starts a fresh authorization, without deleting another in-flight connection.
  const p=provider(state,url=>{redirect=url;});p.tokens=()=>undefined;
  // Override the server's advertised full tool scope list with this lab's needs.
  await auth(p,{serverUrl:MCP_URL,scope:CANVA_SCOPES,fetchFn:canvaFetch});
  if(!redirect)throw new Error("Canva did not supply an authorization URL.");return {state,url:redirect};
}
export async function completeOAuth(state:string,code:string,cookie:string|undefined) {
  const block=canvaBlockReason();if(block)throw new Error(block);
  if(!cookie||cookie!==state||!readSecret(`oauth:${state}`))throw new Error("Canva authorization state does not match this browser.");
  await auth(provider(state),{serverUrl:MCP_URL,authorizationCode:code,fetchFn:canvaFetch});
  labDb().prepare("DELETE FROM secrets WHERE key=?").run(`oauth:${state}`);
}
export function validateTool(spec:ToolSpec,args:Record<string,unknown>) {
  const ajv=new Ajv({strict:false,allErrors:true,validateFormats:false});
  const validate=ajv.compile(spec.inputSchema);
  if(!validate(args))throw new Error(`Canva ${spec.name} arguments do not match its current schema: ${ajv.errorsText(validate.errors)}`);
}
export function unpack(result:Record<string,unknown>, allowRichText=false):Record<string,unknown> {
  if(result.isError)throw new Error("Canva tool reported an error. Inspect the connection and tool compatibility, then retry.");
  if(result.structuredContent && typeof result.structuredContent==='object')return result.structuredContent as Record<string,unknown>;
  const texts=(result.content as Array<{type:string;text?:string}>|undefined)?.filter(c=>c.type==='text').map(c=>c.text||'')??[];
  for(const text of texts){try{return JSON.parse(text);}catch{}}
  // Canva's read-only rich-text tool can return Markdown instead of JSON.
  // Mutation responses still require structured identity/status for safe recovery.
  if(allowRichText&&texts.length)return {richText:texts.join('\n')};
  throw new Error("Canva returned no structured result.");
}
export interface CanvaClient { specs:ToolSpec[]; call(name:string,args:Record<string,unknown>,mutates?:boolean):Promise<Record<string,unknown>>; close():Promise<void> }
export function checkpointToolResponse(a:Attempt,name:string,raw:Record<string,unknown>){
  if(raw.isError)event(a,'tool-error',{name,result:raw});
  const quota=canvaQuotaRejection(raw);
  if(quota){a.state.inFlight=null;a.state.canvaQuota=quota;a.state.lastTool={name,result:{error:quota.code}};saveAttempt(a);throw new CanvaQuotaError(quota);}
  const result=unpack(raw,name==='get-design-content');
  a.state.lastTool={name,result};a.state.inFlight=null;saveAttempt(a);event(a,'tool-result',{name,result});return result;
}
export async function connectCanva(a:Attempt,signal:AbortSignal):Promise<CanvaClient> {
  const block=canvaBlockReason();if(block)throw new Error(block);if(!connected())throw new Error("Connect Canva in the lab first.");
  const client=new Client({name:"ola-comparison-lab",version:"0.1.0"});
  const transport=new StreamableHTTPClientTransport(new URL(MCP_URL),{authProvider:provider(),fetch:canvaFetch,reconnectionOptions:{maxRetries:0,initialReconnectionDelay:1000,maxReconnectionDelay:1000,reconnectionDelayGrowFactor:1}});
  const specs:ToolSpec[]=[];let cursor:string|undefined;
  try {
    await client.connect(transport,{signal,timeout:60_000});
    do { const page=await client.listTools(cursor?{cursor}:{},{signal,timeout:60_000});specs.push(...page.tools);cursor=page.nextCursor; }while(cursor);
  } catch (error) {
    await client.close().catch(()=>{});
    throw error;
  }
  event(a,'tool-schemas',specs.filter(t=>toolNames.includes(t.name as typeof toolNames[number])));
  return {specs,close:()=>client.close(),call:async(name,args,mutates=false)=>{
    signal.throwIfAborted();
    if(!toolNames.includes(name as typeof toolNames[number]))throw new Error("Canva tool is outside this comparison's allowlist.");
    const spec=specs.find(t=>t.name===name);if(!spec)throw new Error(`This Canva account does not expose ${name}.`);if(Object.hasOwn((spec.inputSchema.properties ?? {}) as object,'user_intent'))args={...args,user_intent:'Create and compare a design from the user-supplied brief.'};validateTool(spec,args);
    if(mutates){a.state.inFlight=name;saveAttempt(a);}
    event(a,'tool-call',{name,args});
    const raw=await client.callTool({name,arguments:args},undefined,{timeout:120_000,signal});
    // Checkpoint the response alongside the in-flight marker. Recovery must never repeat a mutation.
    return checkpointToolResponse(a,name,raw as Record<string,unknown>);
  }};
}

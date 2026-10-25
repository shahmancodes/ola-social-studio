import { generateText, aiFetch } from "../lib/ai-usage";
import fs from "node:fs";
import { createGateway, Output } from "ai";
import { event, saveAttempt } from "./store";
import type { Attempt, ModelConfig } from "./types";
export async function modelJson(a:Attempt, prompt:string, imageFiles:string[], signal:AbortSignal):Promise<Record<string,unknown>> {
  const model=a.model as ModelConfig;
  const turns=Number(a.state.modelTurns??0);
  if(turns>=12)throw new Error("AI + Canva reached its 12-turn limit.");
  a.state.modelTurns=turns+1;saveAttempt(a);event(a,'model-prompt',{model,prompt,imageFiles});
  let text:string;let usage:unknown;
  const images=imageFiles.map(file=>fs.readFileSync(file));
  if(model.provider==='vercel'){
    if(!process.env.AI_GATEWAY_API_KEY)throw new Error("Vercel AI Gateway is not configured.");
    const result=await generateText({model:createGateway({apiKey:process.env.AI_GATEWAY_API_KEY})(model.model),messages:[{role:'user',content:[{type:'text',text:prompt},...images.map(image=>({type:'image' as const,image,mediaType:'image/png'}))]}],output:Output.json(),maxOutputTokens:12000,abortSignal:signal});
    text=result.text;usage=result.usage;
  }else{
    if(!process.env.OPENROUTER_API_KEY)throw new Error("OpenRouter is not configured.");
    const response=await aiFetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:model.model,messages:[{role:'user',content:[{type:'text',text:prompt},...images.map(bytes=>({type:'image_url',image_url:{url:`data:image/png;base64,${bytes.toString('base64')}`}}))]}],response_format:{type:'json_object'},max_tokens:12000}),signal});
    if(!response.ok)throw new Error(`Selected OpenRouter model failed (${response.status}); no fallback was used.`);
    const result=await response.json();text=result.choices?.[0]?.message?.content;usage=result.usage;
  }
  if(typeof text!=='string')throw new Error("The selected model returned no text.");
  event(a,'model-result',{model,usage,text});
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,''));
}

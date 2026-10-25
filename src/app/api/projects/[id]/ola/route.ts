import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/platform-auth';
import { olaHistory, requestOlaEdit, decideOlaProposal, PromptRequestSchema, DecisionRequestSchema } from '@/lib/ola-edit';

export const runtime='nodejs';
export const maxDuration=300;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'cache-control':'private, no-store'}});
type Context={params:Promise<{id:string}>};
async function body(request:Request){
  const text=await request.text();if(text.length>4_000_000)throw new Error('Ola edit request is too large.');return JSON.parse(text);
}
export async function GET(_:Request,context:Context){
  try{const {id}=await context.params;const {user}=await requireProjectAccess(id);return json(olaHistory(id,user.id));}
  catch{return json({error:'Project access required.'},403);}
}
export async function POST(request:Request,context:Context){
  try{const {id}=await context.params;const {user}=await requireProjectAccess(id);const input=PromptRequestSchema.parse(await body(request));return json(await requestOlaEdit(id,user.id,input));}
  catch(error){return json({error:error instanceof Error?error.message:'Ola could not edit this project.'},400);}
}
export async function PATCH(request:Request,context:Context){
  try{const {id}=await context.params;const {user}=await requireProjectAccess(id);return json(decideOlaProposal(id,user.id,DecisionRequestSchema.parse(await body(request))));}
  catch(error){return json({error:error instanceof Error?error.message:'Ola could not update the proposal.'},400);}
}

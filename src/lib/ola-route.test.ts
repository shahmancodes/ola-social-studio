import { describe,it,expect,vi,beforeEach } from 'vitest';
const calls=vi.hoisted(()=>({access:vi.fn(),history:vi.fn(),edit:vi.fn(),decide:vi.fn()}));
vi.mock('./platform-auth',()=>({requireProjectAccess:calls.access}));
vi.mock('./ola-edit',async original=>({...await original<typeof import('./ola-edit')>(),olaHistory:calls.history,requestOlaEdit:calls.edit,decideOlaProposal:calls.decide}));
import { GET,POST,PATCH } from '../app/api/projects/[id]/ola/route';
const context={params:Promise.resolve({id:'fixture-project'})};
beforeEach(()=>{vi.clearAllMocks();calls.access.mockResolvedValue({user:{id:'fixture-user'}});});
describe('Ola editor HTTP integration',()=>{
  it('returns scoped history as private JSON',async()=>{calls.history.mockReturnValue({messages:[],pending:null});const r=await GET(new Request('http://localhost/api/projects/fixture-project/ola'),context);expect(await r.json()).toEqual({messages:[],pending:null});expect(r.headers.get('cache-control')).toBe('private, no-store');expect(calls.history).toHaveBeenCalledWith('fixture-project','fixture-user');});
  it('denies history and mutations before touching another project',async()=>{calls.access.mockRejectedValue(new Error('Access denied.'));expect((await GET(new Request('http://localhost'),context)).status).toBe(403);expect((await POST(new Request('http://localhost',{method:'POST',body:'{}'}),context)).status).toBe(400);expect(calls.history).not.toHaveBeenCalled();expect(calls.edit).not.toHaveBeenCalled();});
  it('validates edit requests before invoking the editor harness',async()=>{const invalid=await POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({stage:'unknown'})}),context);expect(invalid.status).toBe(400);expect(calls.edit).not.toHaveBeenCalled();const input={prompt:'Make the headline larger',stage:'simple',draft:{},baseVersion:1,requestId:'4f9a84ab-cd38-4651-9ac8-cc861e7c039d'};calls.edit.mockResolvedValue({messages:[],pending:null});expect((await POST(new Request('http://localhost',{method:'POST',body:JSON.stringify(input)}),context)).status).toBe(200);expect(calls.edit).toHaveBeenCalledWith('fixture-project','fixture-user',expect.objectContaining(input));});
  it('routes proposal decisions through ownership validation',async()=>{const input={proposalId:'4f9a84ab-cd38-4651-9ac8-cc861e7c039d',decision:'discarded',currentDraft:{}};calls.decide.mockReturnValue({messages:[]});expect((await PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify(input)}),context)).status).toBe(200);expect(calls.decide).toHaveBeenCalledWith('fixture-project','fixture-user',input);});
  it('accepts generated document payloads larger than the old transport limit',async()=>{
    const input={prompt:'Shorten the title',stage:'simple',draft:{renderEvidence:'x'.repeat(200_000)},baseVersion:1,requestId:'4f9a84ab-cd38-4651-9ac8-cc861e7c039d'};
    calls.edit.mockResolvedValue({messages:[],pending:null});
    expect((await POST(new Request('http://localhost',{method:'POST',body:JSON.stringify(input)}),context)).status).toBe(200);
    expect(calls.edit).toHaveBeenCalledTimes(1);
  });

});

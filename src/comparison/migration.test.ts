import { afterAll, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ola-lab-migration-'));
let store:typeof import('./store');
afterAll(()=>{store?.labDb().close();vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});});
it('migrates historical attempt uniqueness without changing frozen records or preferences',async()=>{
  vi.stubEnv('COMPARISON_DATA_DIR',root);vi.stubEnv('OLA_DATA_DIR',path.join(root,'ola'));vi.stubEnv('OLA_DISABLE_MESSAGING','1');
  const old=new DatabaseSync(path.join(root,'comparisons.sqlite'));
  old.exec(`CREATE TABLE cases(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,input_json TEXT NOT NULL,input_hash TEXT NOT NULL);
    CREATE TABLE attempts(id TEXT PRIMARY KEY,case_id TEXT NOT NULL,engine TEXT NOT NULL,version INTEGER NOT NULL,status TEXT NOT NULL,record_json TEXT NOT NULL,UNIQUE(case_id,engine,version));
    CREATE TABLE preferences(id TEXT PRIMARY KEY,case_id TEXT NOT NULL,created_at TEXT NOT NULL,record_json TEXT NOT NULL);`);
  const input={brief:'Historical brief',companyName:'Historical brand',format:'story',fixture:true,assets:[],brand:{},model:{provider:'vercel',model:'old-model'}};
  const record={id:'old-attempt',caseId:'old-case',engine:'ola',version:1,status:'complete',state:{saved:true},events:[],inputHash:'original-hash',result:{pages:[{file:'/old/saved.png',width:1080,height:1920}]}};
  old.prepare('INSERT INTO cases VALUES(?,?,?,?)').run('old-case','yesterday',JSON.stringify(input),'original-hash');old.prepare('INSERT INTO attempts VALUES(?,?,?,?,?,?)').run(record.id,'old-case','ola',1,'complete',JSON.stringify(record));
  old.prepare('INSERT INTO preferences VALUES(?,?,?,?)').run('vote','old-case','yesterday','{"winner":"old-attempt"}');old.close();
  store=await import('./store');const c=store.getCase('old-case');expect(c.inputHash).toBe('original-hash');expect(c.input).toEqual(input);expect(c.attempts[0]).toEqual(record);
  expect(store.labDb().prepare('SELECT contender_id FROM attempts').get()).toEqual({contender_id:'ola'});
  expect(store.labDb().prepare('SELECT record_json FROM preferences').get()).toEqual({record_json:'{"winner":"old-attempt"}'});
  // The new constraint permits independent Ola model versions within one case.
  store.labDb().prepare('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)').run('model-a','old-case','ola','model-1',1,'complete','{}');
  store.labDb().prepare('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)').run('model-b','old-case','ola','model-2',1,'complete','{}');
  expect(()=>store.labDb().prepare('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)').run('duplicate','old-case','ola','model-1',1,'complete','{}')).toThrow(/UNIQUE/);
});

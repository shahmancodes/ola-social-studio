// Launch or resume only unstarted cases from one materialized, explicitly approved packet.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{spawn}from'node:child_process';
const root=process.cwd(),directory=path.resolve(process.argv[2]??''),manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),snapshot=manifest.codeSnapshot?.root;
assert(snapshot&&manifest.packetFile);const packet=JSON.parse(fs.readFileSync(manifest.packetFile));assert.equal(packet.authorization.approved,true);assert.equal(packet.studyDirectory,directory);
const flag=process.argv.includes('--continue-remaining')?'--continue-remaining':'--run';
const child=spawn(process.execPath,['--import','tsx',path.join(snapshot,'scripts/ola-professional-study.mjs'),flag,directory],{cwd:snapshot,env:{...process.env,OLA_STUDY_CODE_ROOT:snapshot,OLA_STUDY_LAB_ROOT:path.join(root,'.data/comparison'),OLA_STUDY_SOURCE_DATA_DIR:path.join(root,'.data'),OLA_STUDY_ENV_ROOT:root,OLA_STUDY_FROZEN_SOURCE:'1'},stdio:'inherit'});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});child.once('exit',(code,signal)=>{if(signal)console.error('Study process exited with signal '+signal);process.exitCode=code??1;});

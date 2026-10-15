#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepare,HERE,record } from './prepare.mjs';
import { ROOT,json,sha256,writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';

assert.ok(process.argv.length===3&&['--write','--check'].includes(process.argv[2]));
const before=await prepare(),started=new Date().toISOString();
const result=await new Promise((done,reject)=>{
  const child=spawn(process.execPath,['--test','--test-reporter=tap',resolve(HERE,'verify.test.mjs')],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
  const chunks=[];let bytes=0;
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024*1024){child.kill();reject(new Error('Bounded test log exceeded'));}else chunks.push(chunk);});
  child.on('error',reject);child.on('close',code=>done({code,output:Buffer.concat(chunks)}));
});
process.stdout.write(result.output);assert.equal(result.code,0);
const after=await prepare();assert.deepEqual(after.base.inputPins,before.base.inputPins,'Protected inputs unchanged pre/post');
const sharedPaths=['scripts/pravoslavno-calendar-reference.mjs','scripts/validate-bible-reference-v1.mjs'];
const shared=[];for(const path of sharedPaths)shared.push(record(path,await readFile(resolve(ROOT,path))));
if(process.argv[2]==='--write'){
  const receipt={status:'PASS_PENDING_COMBINED_REFERENCE_ONLY',tests:10,exit_code:0,started_at:started,completed_at:new Date().toISOString(),node:process.version,
    command:'node drafts/ks01-combined-calendar-2026-10-06/verify.mjs --check',test_log_sha256:sha256(result.output),
    protected_inputs_before:before.base.inputPins,protected_inputs_after:after.base.inputPins,shared_source_pins:shared,
    no_network:true,no_native_execution:true,no_signing_or_production_mutation:true,review_simulation_memory_only:true};
  await writeNewTree(resolve(HERE,'verification'),new Map([['receipt.json',json(receipt)],['targeted-tests.log',result.output]]));
  const tree=await captureRefreshTree(HERE);
  const handoff={status:'STABLE_PENDING_COMBINED_CONTENT_REVIEW_NOT_RELEASE_GO',path:'drafts/ks01-combined-calendar-2026-10-06',
    combined_manifest:record('ab-component/combined-operation-manifest.json',after.files.get('combined-operation-manifest.json')),
    catalog:record('ab-component/catalog.pending.json',after.files.get('catalog.pending.json')),browser:record('ab-component/browser.pending.json',after.files.get('browser.pending.json')),
    scope:{A_dates:23,B_dates:19,new_article_links:40,already_linked:2,article_bodies_unchanged:104,existing_year_end_links_unchanged:true,gospel_dates:31,gospel_readings:33,gospel_last_date:'2026-11-05'},
    catalog_counts:after.delta.after,additions:after.delta.additions,shared_source_pins:shared,tests:'10/10 PASS',
    limitations:['Pending catalog/browser component is still bound to S13 annual/saints; final combined annual application and all changed bindings/manifests remain release assembly, not silently performed here',
      'No exact combined editorial approval exists in this handoff; new metadata and Gospel operations remain pending/noneligible',
      'Gospel source attributed to Pravoslavno.rs; no copied website translation, complete service schedule, official SPC endorsement or licensing guarantee',
      '06November–31December Gospel state remains exactly as S13; no2027 facts or full saints-list claims',
      'Shared adapter is semantic verification, not proof of native acceptance/authentication/publication',
      'Source registries and public S13 readback were reused with pins; no new source/public fetch this step'],
    gates:after.delta.gates,production_mutated:false,signed:false,published:false,native_run:false,
    artifacts:[...tree].map(([path,bytes])=>record(path,bytes)).sort((a,b)=>a.path.localeCompare(b.path,'en'))};
  await writeFile(resolve(HERE,'handoff.json'),json(handoff),{flag:'wx'});
}else{
  const handoff=JSON.parse(await readFile(resolve(HERE,'handoff.json')));
  for(const file of handoff.artifacts)assert.equal(sha256(await readFile(resolve(HERE,file.path))),file.sha256,file.path);
  assert.deepEqual(shared,handoff.shared_source_pins);
}
console.log(JSON.stringify({status:'PASS_PENDING_COMBINED_REFERENCE_ONLY',tests:10,additions:after.delta.additions,catalog_counts:after.delta.after}));

#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT,json,sha256,writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';
import { HERE,createPlan,record } from './prepare.mjs';
assert.ok(process.argv.length===3&&['--write','--check'].includes(process.argv[2]));
const before=await createPlan(),started=new Date().toISOString();
const result=await new Promise((done,reject)=>{const child=spawn(process.execPath,['--test','--test-reporter=tap',resolve(HERE,'verify.test.mjs')],{cwd:ROOT,stdio:['ignore','pipe','pipe']});const chunks=[];let count=0;for(const pipe of [child.stdout,child.stderr])pipe.on('data',b=>{count+=b.length;if(count>1024*1024){child.kill();reject(new Error('Bounded log exceeded'));}else chunks.push(b);});child.on('error',reject);child.on('close',code=>done({code,output:Buffer.concat(chunks)}));});
process.stdout.write(result.output);assert.equal(result.code,0);
const after=await createPlan();assert.deepEqual(after.request.protected_inputs,before.request.protected_inputs);assert.deepEqual(after.files,before.files);
if(process.argv[2]==='--write'){
  const receipt={status:'SHARED_UNSIGNED_CHECKS_PASS_DEVELOPMENT_BLOCKED_NATIVE_GATE',tests:7,exit_code:0,node:process.version,started_at:started,completed_at:new Date().toISOString(),command:'node drafts/combined-calendar-release-2026-10-06/verify.mjs --check',
    test_log_sha256:sha256(result.output),protected_inputs_before:before.request.protected_inputs,protected_inputs_after:after.request.protected_inputs,
    source_S13_real_RSA_checked:true,S14_signature_checked:false,no_network:true,no_private_key_access:true,no_signing:true,no_native_execution:true,no_production_mutation:true};
  await writeNewTree(resolve(HERE,'verification'),new Map([['receipt.json',json(receipt)],['targeted-tests.log',result.output]]));
  const tree=await captureRefreshTree(HERE),handoff={status:'DEVELOPMENT_BLOCKED_APPROVED_CONTENT_ASSEMBLY_NOT_READY_FOR_SIGN',path:'drafts/combined-calendar-release-2026-10-06',release_set_id:after.set.release_set_id,sequence:14,
    content_approval:after.report.approval,index_sha256:after.report.index_sha256,release_sha256:after.report.release_sha256,
    payloads:Object.fromEntries(['calendar','saints','catalog','browser'].map(k=>[k,after.report[k]])),
    scope:{unchanged_article_objects:104,A_dates:23,B_dates:19,new_article_links:40,gospel_dates:31,gospel_readings:33,gospel_window:['2026-10-06','2026-11-05'],unresolved_future_dates_unchanged:56},
    requested_minimum_clients:after.set.min_clients,minimum_clients_compatible:false,
    blocker:{platform:'ios',installed_version:'0.1.14',installed_build:41,installed_source:'452e4bcda43f076f02abe5310016f4cb25d5e00d',reported_by:'root exact installed-source read-only review',
      path:'M0 ModularRuntimeProjector.swift loadDevelopmentReview → AnnualGospelCalendar.swift development validation',
      issue:'Requires173SOURCE_RECORDED/192UNRESOLVED and productionEligible=false; approved S14 has204/161 and31new eligible days.',
      resolution:'Need separately authorized narrow native correction/new release and exact acceptance. Revise iOS minimum only after compatible release is confirmed. Do not weaken historical guards or sign/publish this floor.'},
    unsigned_root:'unsigned-s14',graph_files_without_private_signing_request:73,documents_requiring_signature:6,signed_graph_expected_files:79,publication_allowlist_files:18,
    tests:'7/7 shared unsigned checks PASS; not native or S14 RSA acceptance',native_descriptor:'preparation/native-acceptance.json',
    readback_plan:'After a corrected/accepted final floor and separate signing/publication GO, reuse ordinary HTTPS exact graph readback, discovery pair before/after and24 production RSA profiles; do not run now.',
    signed:false,published:false,native_pass:false,production_mutated:false,signer_or_public_readback_created:false,
    limitations:['Calendar historical top-level review flags and approved library release-scope unchanged; only31new reference display eligibility approved','No source translation/commentary, full service schedule, new clergy or rights claims','Original pending drafts, S13 and104article objects preserved byte/structure exactly','Fresh public source CAS and both native acceptance still required'],
    artifacts:[...tree].map(([path,bytes])=>record(path,bytes)).sort((a,b)=>a.path.localeCompare(b.path,'en'))};
  await writeFile(resolve(HERE,'handoff.json'),json(handoff),{flag:'wx'});
}else{const h=JSON.parse(await readFile(resolve(HERE,'handoff.json')));for(const f of h.artifacts)assert.equal(sha256(await readFile(resolve(HERE,f.path))),f.sha256,f.path);}
console.log(JSON.stringify({status:'SHARED_UNSIGNED_CHECKS_PASS_DEVELOPMENT_BLOCKED_NATIVE_GATE',tests:7,index_sha256:after.report.index_sha256,release_sha256:after.report.release_sha256}));

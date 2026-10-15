#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT,json,sha256,writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';
import { HERE,createPlan,record,CONFIRMED_IOS_VERSION,FROZEN_HANDOFF_SHA } from './prepare.mjs';
assert.ok(process.argv.length===3&&['--write','--check'].includes(process.argv[2]));
const before=await createPlan(),started=new Date().toISOString();
const run=await new Promise((done,reject)=>{const child=spawn(process.execPath,['--test','--test-reporter=tap',resolve(HERE,'verify.test.mjs')],{cwd:ROOT,stdio:['ignore','pipe','pipe']});const chunks=[];let size=0;for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{size+=b.length;if(size>1024*1024){child.kill();reject(new Error('Bounded log exceeded'));}else chunks.push(b);});child.on('error',reject);child.on('close',code=>done({code,output:Buffer.concat(chunks)}));});
process.stdout.write(run.output);assert.equal(run.code,0);const after=await createPlan();assert.deepEqual(after.files,before.files);assert.deepEqual(after.request.protected_inputs,before.request.protected_inputs);
if(process.argv[2]==='--write'){
  const receipt={status:'PASS_SHARED_R2_TRANSPORT_ONLY_NOT_SIGNED_OR_NATIVE_ACCEPTED',tests:7,exit_code:0,node:process.version,started_at:started,completed_at:new Date().toISOString(),command:'node drafts/combined-calendar-release-2026-10-06-r2/verify.mjs --check',test_log_sha256:sha256(run.output),
    protected_inputs_before:before.request.protected_inputs,protected_inputs_after:after.request.protected_inputs,source_S13_RSA_verified:true,S14_RSA_verified:false,
    no_network:true,no_private_key_access:true,no_signing_or_key_generation:true,no_native_execution:true,no_production_mutation:true};
  await writeNewTree(resolve(HERE,'verification'),new Map([['receipt.json',json(receipt)],['targeted-tests.log',run.output]]));
  const tree=await captureRefreshTree(HERE),handoff={status:'STABLE_UNSIGNED_S14_R2_ROOT_REVIEW_AND_SIGNING_GO_REQUIRED',path:'drafts/combined-calendar-release-2026-10-06-r2',release_set_id:after.set.release_set_id,sequence:14,
    index_sha256:after.report.index_sha256,release_sha256:after.report.release_sha256,signing_request_sha256:sha256(after.files.get('signing-request.json')),minimum_clients:{android:66,ios:CONFIRMED_IOS_VERSION},ios_confirmation:after.confirmed.pin,
    frozen_r1_handoff_sha256:FROZEN_HANDOFF_SHA,payloads:Object.fromEntries(['calendar','saints','catalog','browser'].map(k=>[k,after.report[k]])),four_payloads_byte_identical_to_r1:true,
    scope:{unchanged_article_objects:104,A_dates:23,B_dates:19,new_article_links:40,gospel_dates:31,gospel_readings:33,unresolved_later_dates:56},
    changed_r1_paths:after.report.changed_candidate_paths,unsigned_root:'unsigned-s14-r2',native_descriptor:'preparation/native-acceptance.json',graph_files_without_signing_request:73,signed_graph_expected_files:79,publication_allowlist_files:18,documents_to_sign:6,
    tests:'7/7 shared checks PASS; unsigned content/transport identity and pre-key guards only',production_key_used:false,S14_signature_acceptance:false,native_exact_signed_acceptance:false,published:false,
    root_workflow:{blocked_until_explicit_root_go:true,go_status:'ROOT_AUTHORIZED_LOCAL_S14_R2_SIGNING',go_binding_fields:['release_set_id','sequence','index_sha256','release_sha256','signing_request_sha256','minimum_ios','expected_public_head','expected_public_index_sha256','publication_authorized:false'],
      sign:'node drafts/combined-calendar-release-2026-10-06-r2/sign.mjs --coordinator-go --candidate <unsigned-s14-r2> --out <new-signed-s14-r2> --private-key <existing-external-private-key> --source <current-public-S13-root> --root-go <root-hash-bound-signing-go.json>',
      validate_signed:'node drafts/combined-calendar-release-2026-10-06-r2/sign.mjs --validate-signed <signed-s14-r2>',
      public_readback_after_publication:'node drafts/combined-calendar-release-2026-10-06-r2/public-readback.mjs --signed <signed-s14-r2> --out <new-receipt-outside-stage>',
      public_readback_files:79,ordinary_https_gets:81,production_RSA_profile_checks:24,publication_requires_separate_allowlisted_CAS_and_both_native_acceptance:true},
    limitations:['Confirmation of a compatible iOS version is not exact signed S14 native acceptance','No runtime/source/data change beyond min_ios and dependent release/index/signing-plan bytes','No new signing algorithm; reviewed S13 primitive reused, no private or ephemeral key used in this suite','No new clergy/rights/full-service claims; historical unknowns and all old pending/prod evidence retained'],
    artifacts:[...tree].map(([path,bytes])=>record(path,bytes)).sort((a,b)=>a.path.localeCompare(b.path,'en'))};
  await writeFile(resolve(HERE,'handoff.json'),json(handoff),{flag:'wx'});
}else{const h=JSON.parse(await readFile(resolve(HERE,'handoff.json')));for(const f of h.artifacts)assert.equal(sha256(await readFile(resolve(HERE,f.path))),f.sha256,f.path);}
console.log(JSON.stringify({status:'PASS_SHARED_R2_TRANSPORT_ONLY',tests:7,index_sha256:after.report.index_sha256,release_sha256:after.report.release_sha256,minimum_ios:CONFIRMED_IOS_VERSION}));

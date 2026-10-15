#!/usr/bin/env node
// Additive transport-only revision. Frozen r1 content and all production bytes are read-only.
import assert from 'node:assert/strict';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT,json,sha256,writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { readRefreshInput } from '../../scripts/prepare-shared-refresh-release-v2.mjs';
import { captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';
import { createPlan as createFrozenPlan,nativeDescriptor,record,parse,RELEASE_ID,SEQUENCE,S13_ROOT,S13_ARCHIVE,S13_INDEX_SHA,S13_RELEASE_SHA,PUBLIC_COMMIT,PREPARED_AT } from '../combined-calendar-release-2026-10-06/prepare.mjs';
export { record,parse,RELEASE_ID,SEQUENCE,S13_ROOT,S13_ARCHIVE,S13_INDEX_SHA,S13_RELEASE_SHA,PUBLIC_COMMIT,PREPARED_AT };
export const HERE=dirname(fileURLToPath(import.meta.url));
export const FROZEN='drafts/combined-calendar-release-2026-10-06';
export const FROZEN_HANDOFF_SHA='1179ff7461e93d454ba43ecf2aae49e23fcc935efc51ebf82a5d73cfe2e318e0';
// Root accepted the original owner's bounded compatibility preflight, not signed S14 acceptance.
export const CONFIRMED_IOS_VERSION='0.1.15';
export const CONFIRMATION_PATH='approvals/pravoslavno-gospel-2026-10-06/root-ios-s14-compatible-floor.json';
export const CONFIRMATION_SHA='f3ae3f72d335e8c4d5413b85fcb025f1c8a3c9b9ac3fdb03a095756ed49e5b85';

export async function frozenInputs(){
  const path=`${FROZEN}/handoff.json`,bytes=await readRefreshInput(resolve(ROOT,path));assert.equal(sha256(bytes),FROZEN_HANDOFF_SHA);
  const handoff=parse(bytes),pins=[record(path,bytes)];
  for(const file of handoff.artifacts){assert.ok(!file.path.includes('..')&&!file.path.startsWith('/'));const path=`${FROZEN}/${file.path}`,raw=await readRefreshInput(resolve(ROOT,path));assert.equal(raw.length,file.bytes);assert.equal(sha256(raw),file.sha256,path);pins.push(record(path,raw));}
  for(const [path,expected]of [
    ['drafts/saints104-release-2026-10-06/sign.mjs','f9f15f6aa69ae078dc7c72795c8eb0f16188c25509890bbfd5350f8ceefbd20e'],
    ['drafts/saints104-release-2026-10-06/public-readback.mjs','63c79ae59feb25504fc3abefcd6f87ba462d3f432014ad20105721f512111a26']]){
    const raw=await readRefreshInput(resolve(ROOT,path));assert.equal(sha256(raw),expected,'Reviewed S13 workflow source');pins.push(record(path,raw));
  }
  return {handoff,pins};
}
export async function confirmation(){
  assert.ok(typeof CONFIRMED_IOS_VERSION==='string'&&/^\d+\.\d+\.\d+$/u.test(CONFIRMED_IOS_VERSION),'BLOCKED: root-confirmed compatible iOS release is not pinned');
  assert.ok(typeof CONFIRMATION_PATH==='string'&&typeof CONFIRMATION_SHA==='string'&&/^[0-9a-f]{64}$/u.test(CONFIRMATION_SHA),'BLOCKED: confirmation evidence is not pinned');
  const bytes=await readRefreshInput(resolve(ROOT,CONFIRMATION_PATH));assert.equal(sha256(bytes),CONFIRMATION_SHA,'Exact root-relayed version evidence');
  const document=parse(bytes);
  assert.equal(document.status,'BOUNDED_IOS_S14_COMPATIBILITY_PREFLIGHT_ACCEPTED');
  assert.equal(document.minimum_ios,CONFIRMED_IOS_VERSION);assert.equal(document.build,42);
  assert.equal(document.source_commit,'66e8fce66233682079d3e33c5f446c417435f358');
  assert.equal(document.root_validation.tests,4);assert.equal(document.root_validation.failures,0);assert.equal(document.root_validation.skips,0);
  assert.equal(document.root_validation.signed_s14_acceptance,false);assert.equal(document.publication_authorized,false);
  return {document,pin:record(CONFIRMATION_PATH,bytes)};
}
export async function createPlan({sourceDirectory=S13_ROOT,now=new Date().toISOString(),archived=false}={}){
  const confirmed=await confirmation(),frozen=await frozenInputs(),original=await createFrozenPlan({sourceDirectory,now,archived});
  const stored=await captureRefreshTree(resolve(ROOT,FROZEN,'unsigned-s14'));assert.deepEqual(original.files,stored,'Frozen r1 plan reproduction');
  const files=new Map(original.files),set={...original.set,min_clients:{android:66,ios:CONFIRMED_IOS_VERSION}};
  const oldIndex=parse(files.get('index.json')),releasePath=oldIndex.channels.production.path,releaseBytes=json(set);files.set(releasePath,releaseBytes);
  const indexBytes=json({...oldIndex,channels:{production:{...oldIndex.channels.production,bytes:releaseBytes.length,sha256:sha256(releaseBytes)}}});files.set('index.json',indexBytes);
  const protectedInputs=[...original.request.protected_inputs,...frozen.pins,confirmed.pin];
  const request={...original.request,state:'UNSIGNED_CANDIDATE_ROOT_SIGNING_GO_REQUIRED',revision:'r2',minimum_clients:set.min_clients,
    minimum_clients_are_requested_not_proven_compatible:false,signing_blocked_until_native_projection_gate_resolved:false,blocked_until_explicit_root_signing_go:true,
    ios_compatibility_confirmation:confirmed.pin,frozen_r1_handoff_sha256:FROZEN_HANDOFF_SHA,payload_bytes_identical_to_r1:true,
    protected_inputs:protectedInputs,
    documents_to_sign:original.request.documents_to_sign.map(item=>({...item,...record(item.path,files.get(item.path))})),
    all_candidate_files:[...files].filter(([path])=>path!=='signing-request.json').map(([path,bytes])=>record(path,bytes)).sort((a,b)=>a.path.localeCompare(b.path,'en'))};
  files.set('signing-request.json',json(request));
  for(const [path,bytes]of original.files)if(!['index.json','signing-request.json',releasePath].includes(path))assert.deepEqual(files.get(path),bytes,`r2 transport-only ${path}`);
  assert.deepEqual(set.modules,original.set.modules);assert.equal(files.size,74);assert.equal(request.documents_to_sign.length,6);assert.equal(request.publication_allowlist.length,18);
  const report={...original.report,status:'UNSIGNED_S14_R2_ROOT_SIGNING_GO_REQUIRED',revision:'r2',index_sha256:sha256(indexBytes),release_sha256:sha256(releaseBytes),
    requested_minimum_clients:set.min_clients,minimum_clients_compatible:true,ios_compatibility_confirmation:confirmed.pin,known_blocker:null,
    native_exact_signed_S14_acceptance:false,compatibility_scope:'Root-accepted bounded preflight for planned0.1.15(42); version not yet signed/delivered and exact signed S14 native acceptance remains pending.',root_signing_go_required:true,payload_bytes_identical_to_frozen_r1:true,
    changed_candidate_paths:['index.json',releasePath,'signing-request.json'],signed:false,published:false,native_pass:false,
    remaining_gates:['Root exact r2 review and hash-bound explicit local-signing GO','Fresh ordinary public S13 discovery and HEAD CAS','Local production signing by root only','Both original native owners exact signed S13→S14 acceptance including offline/restart/failed-candidate retention','Compatible iOS app delivery and final allowlisted content publication','Exact ordinary HTTPS public graph readback']};
  return {...original,files,set,request,report,confirmed,frozen};
}
export function descriptor(plan){return nativeDescriptor(plan);}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.deepEqual(process.argv.slice(2),['--write']);const plan=await createPlan();await writeNewTree(resolve(HERE,'unsigned-s14-r2'),plan.files);
  await writeNewTree(resolve(HERE,'preparation'),new Map([['report.json',json(plan.report)],['native-acceptance.json',json(descriptor(plan))],['protected-inputs-before.json',json(plan.request.protected_inputs)]]));
  console.log(JSON.stringify(plan.report));
}

#!/usr/bin/env node
// Root-only local workflow. Defining this tool does not authorize key access or signing.
import assert from 'node:assert/strict';
import { createPrivateKey } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT,KEY_ID,PUBLIC_KEY_SHA256,sha256,writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { readRefreshInput } from '../../scripts/prepare-shared-refresh-release-v2.mjs';
import { assertNoSymlinkPath } from '../../scripts/prepare-saints-completion-release-v2.mjs';
import { assertRefreshExternalKey,captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';
import { CALENDAR_BROWSER_PROFILES } from '../../scripts/prepare-calendar-browser-release-v2.mjs';
import { validateRelease } from '../../scripts/validate-m0-v2.mjs';
import { fetchExactPublicFile } from '../../scripts/verify-public-shared-refresh-v2.mjs';
import { assertUnsignedCandidate,assertNewOutput,signDocuments,assertProductionKey } from '../saints104-release-2026-10-06/sign.mjs';
import { createPlan,confirmation,RELEASE_ID,SEQUENCE,S13_ARCHIVE,S13_INDEX_SHA,PUBLIC_COMMIT,CONFIRMED_IOS_VERSION } from './prepare.mjs';
export { assertUnsignedCandidate,assertNewOutput,signDocuments,assertProductionKey };
const equal=(a,b,label)=>assert.ok(a?.equals(b),label);
const absent=e=>{if(e.code==='ENOENT')return null;throw e;};
const actualNow=()=>new Date().toISOString();

export function assertRootGoDocument(go,plan){
  assert.equal(go.status,'ROOT_AUTHORIZED_LOCAL_S14_R2_SIGNING','Explicit root signing GO required');
  assert.equal(go.release_set_id,RELEASE_ID);assert.equal(go.sequence,SEQUENCE);assert.equal(go.publication_authorized,false,'Signing GO must not assert publication');
  assert.equal(go.index_sha256,plan.report.index_sha256);assert.equal(go.release_sha256,plan.report.release_sha256);
  assert.equal(go.signing_request_sha256,sha256(plan.files.get('signing-request.json')));assert.equal(go.minimum_ios,CONFIRMED_IOS_VERSION);
  assert.equal(go.expected_public_head,PUBLIC_COMMIT);assert.equal(go.expected_public_index_sha256,S13_INDEX_SHA);
  return true;
}
export async function assertRootGo(path,plan){
  assert.ok(path,'Explicit root-go receipt path required');const bytes=await readRefreshInput(resolve(path));const go=JSON.parse(bytes);assertRootGoDocument(go,plan);return bytes;
}
export async function assertLiveS13(sourceDirectory,plan){
  assert.equal(sha256(await readRefreshInput(resolve(sourceDirectory,'index.json'))),S13_INDEX_SHA,'S13 source advanced; replan before key access or output');
  equal(await readRefreshInput(resolve(sourceDirectory,'index.sig')),plan.files.get(`${S13_ARCHIVE}/index.sig`),'S13 source signature changed');
}
export async function assertFreshPublicS13(plan){for(const path of ['index.json','index.sig'])await fetchExactPublicFile(path,plan.files.get(`${S13_ARCHIVE}/${path}`),globalThis.fetch);}
export async function assertPublicationTarget(target,plan,signedFiles,observedHead){
  assert.equal(observedHead,PUBLIC_COMMIT,'Public HEAD advanced: CAS/replan required');await assertLiveS13(target,plan);
  const paths=[...plan.request.publication_allowlist].sort();assert.equal(paths.length,18);assert.equal(new Set(paths).size,18);
  for(const path of paths){assert.ok(signedFiles.has(path));if(['index.json','index.sig'].includes(path))continue;
    const absolute=resolve(target,path);await assertNoSymlinkPath(absolute,{allowMissing:true});if(await lstat(absolute).catch(absent))equal(await readRefreshInput(absolute),signedFiles.get(path),`Immutable publication conflict ${path}`);
  }
  return {status:'READ_ONLY_PUBLICATION_GUARDS_PASS',expected_head:PUBLIC_COMMIT,allowlist:paths,atomic_git_compare_and_swap_still_required:true,native_acceptance_still_required:true,published:false};
}
export async function validateSigned(directory,{now=actualNow()}={}){
  const plan=await createPlan({sourceDirectory:directory,archived:true,now}),files=await captureRefreshTree(directory);
  const paths=[...plan.files.keys()].filter(p=>p!=='signing-request.json'),signatures=plan.request.documents_to_sign.map(x=>x.signature_path);
  assert.deepEqual([...files.keys()].sort(),[...paths,...signatures].sort(),'Exact signed S14 graph without private sidecars');assert.equal(files.size,79);
  for(const path of paths)equal(files.get(path),plan.files.get(path),`Signed approved-plan mismatch ${path}`);
  assert.equal(sha256(files.get('trusted-public-key.pem')),PUBLIC_KEY_SHA256);
  const checks=[];for(const [platform,clientVersion]of [['android',66],['ios',CONFIRMED_IOS_VERSION]])for(const profile of CALENDAR_BROWSER_PROFILES){
    const result=await validateRelease(directory,{now,platform,clientVersion,trustedKeyId:KEY_ID,minimumSequence:SEQUENCE,clientCapabilities:profile.capabilities});
    assert.equal(result.releaseSetId,RELEASE_ID);assert.equal(result.sequence,SEQUENCE);assert.equal(result.modules,profile.modules);assert.equal(result.verifiedModules,7);assert.deepEqual(result.skippedOptionalModules,profile.skipped);checks.push({platform,profile:profile.id,...result});
  }
  return {status:'SIGNED_LOCAL_S14_R2_VALID_NOT_PUBLISHED',release_set_id:RELEASE_ID,sequence:SEQUENCE,index_sha256:sha256(files.get('index.json')),release_sha256:plan.report.release_sha256,minimum_clients:plan.set.min_clients,checks,
    public_files:plan.request.publication_allowlist.map(path=>({path,bytes:files.get(path).length,sha256:sha256(files.get(path))})),native_exact_generation_acceptance_required:true,published:false};
}
export async function signS14({candidate,out,privateKeyPath,sourceDirectory,rootGoPath,coordinatorGo=false}={}){
  assert.equal(coordinatorGo,true,'Separate explicit coordinator signing GO required');assert.ok(candidate&&out&&privateKeyPath&&sourceDirectory&&rootGoPath,'All explicit paths required');
  await confirmation();assertRefreshExternalKey(privateKeyPath,[sourceDirectory,candidate,out]);
  const plan=await createPlan({sourceDirectory,now:actualNow()}),goBytes=await assertRootGo(rootGoPath,plan);
  await assertUnsignedCandidate(candidate,plan);await assertNewOutput(out,{sourceDirectory,candidate});await assertLiveS13(sourceDirectory,plan);await assertFreshPublicS13(plan);
  assert.deepEqual((await createPlan({sourceDirectory,now:actualNow()})).files,plan.files);
  // All approval, compatibility, exact-byte, freshness and immutable-output gates precede key access.
  const privateBytes=await readRefreshInput(resolve(privateKeyPath),64*1024);let key;try{key=createPrivateKey(privateBytes);}finally{privateBytes.fill(0);}
  assertProductionKey(key,plan.files.get('trusted-public-key.pem'));
  const unsigned=new Map(plan.files);unsigned.delete('signing-request.json');const signed=signDocuments(unsigned,plan.request.documents_to_sign,key);
  await assertLiveS13(sourceDirectory,plan);await assertFreshPublicS13(plan);await assertUnsignedCandidate(candidate,plan);
  assert.deepEqual((await createPlan({sourceDirectory,now:actualNow()})).files,plan.files);equal(await assertRootGo(rootGoPath,plan),goBytes,'Root GO changed');
  await assertNewOutput(out,{sourceDirectory,candidate});await writeNewTree(out,signed);return validateSigned(out);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),go=args.includes('--coordinator-go'),rest=args.filter(x=>x!=='--coordinator-go'),values=new Map();assert.ok(args.filter(x=>x==='--coordinator-go').length<=1);
  for(let n=0;n<rest.length;n+=2){assert.ok(['--candidate','--out','--private-key','--source','--root-go','--validate-signed'].includes(rest[n])&&rest[n+1]&&!values.has(rest[n]));values.set(rest[n],rest[n+1]);}
  if(values.has('--validate-signed')){assert.equal(values.size,1);assert.equal(go,false);console.log(JSON.stringify(await validateSigned(values.get('--validate-signed')),null,2));}
  else{assert.equal(values.size,5);console.log(JSON.stringify(await signS14({candidate:values.get('--candidate'),out:values.get('--out'),privateKeyPath:values.get('--private-key'),sourceDirectory:values.get('--source'),rootGoPath:values.get('--root-go'),coordinatorGo:go}),null,2));}
}

#!/usr/bin/env node
// Explicit post-publication GET-only command. No signing, activation, git or release writes.
import assert from 'node:assert/strict';
import { lstat,mkdtemp,realpath,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute,relative,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT,PUBLIC_KEY_SHA256,json,sha256,writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { assertNoSymlinkPath } from '../../scripts/prepare-saints-completion-release-v2.mjs';
import { captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';
import { CHANNEL,fetchExactPublicFile } from '../../scripts/verify-public-shared-refresh-v2.mjs';
import { validateSigned } from './sign.mjs';
const within=(root,path)=>{const r=relative(resolve(root),resolve(path));return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
const absent=e=>{if(e.code==='ENOENT')return null;throw e;};

export async function publicReadback({signedDirectory,out}={}){
  assert.ok(typeof signedDirectory==='string'&&signedDirectory&&typeof out==='string'&&out,'Explicit signed stage and new receipt path required');
  const source=resolve(signedDirectory),receiptPath=resolve(out);assert.equal(within(source,receiptPath),false,'Receipt outside signed stage');assert.equal(within(resolve(ROOT,'releases'),receiptPath),false,'Receipt outside production');
  await assertNoSymlinkPath(source);await assertNoSymlinkPath(receiptPath,{allowMissing:true});assert.equal(await lstat(receiptPath).catch(absent),null,'New receipt only; never overwrite');
  const startedAt=new Date().toISOString(),expectedValidation=await validateSigned(source);assert.equal(expectedValidation.sequence,14);assert.equal(expectedValidation.checks.length,24);
  const expected=await captureRefreshTree(source);assert.equal(expected.size,79,'Exact public S14 graph; no private sidecars');assert.ok([...expected.values()].reduce((n,b)=>n+b.length,0)<=100*1024*1024);assert.equal(sha256(expected.get('trusted-public-key.pem')),PUBLIC_KEY_SHA256);
  const fetched=new Map(),records=[],beforeCache={},afterCache={},discovery=['index.json','index.sig'];
  for(const path of [...discovery,...[...expected.keys()].filter(p=>!discovery.includes(p)).sort()]){
    const result=await fetchExactPublicFile(path,expected.get(path),globalThis.fetch);fetched.set(path,result.bytes);records.push({path,bytes:result.bytes.length,sha256:sha256(result.bytes)});if(discovery.includes(path))beforeCache[path]=result.cache;
  }
  assert.equal(fetched.size,79);const temp=await mkdtemp(resolve(await realpath(tmpdir()),'svetlost33-s14-r2-public-readback-'));
  try{
    const received=resolve(temp,'received');await writeNewTree(received,fetched);const receivedValidation=await validateSigned(received);assert.deepEqual(receivedValidation,expectedValidation,'Downloaded graph/profile identity');
    for(const path of discovery){const result=await fetchExactPublicFile(path,expected.get(path),globalThis.fetch);afterCache[path]=result.cache;}
    assert.deepEqual(await captureRefreshTree(source),expected,'Local signed stage changed');
    const graphBytes=records.reduce((n,r)=>n+r.bytes,0),receipt={status:'PASS',verification_kind:'ORDINARY_PUBLIC_HTTPS_EXACT_BYTE_READBACK',started_at:startedAt,completed_at:new Date().toISOString(),channel:CHANNEL,
      release_set_id:receivedValidation.release_set_id,sequence:14,index_sha256:receivedValidation.index_sha256,release_sha256:receivedValidation.release_sha256,minimum_clients:receivedValidation.minimum_clients,
      trusted_public_key_sha256:PUBLIC_KEY_SHA256,fetched_files:79,graph_bytes:graphBytes,http_gets:81,transferred_bytes:graphBytes+discovery.reduce((n,p)=>n+expected.get(p).length,0),shared_profile_checks:24,checks:receivedValidation.checks,
      discovery_pair_checked_before_and_after:true,cache:{before:beforeCache,after:afterCache},files:records.sort((a,b)=>a.path.localeCompare(b.path,'en')),native_activation_confirmed_by_this_receipt:false,production_mutated_by_this_tool:false};
    await assertNoSymlinkPath(receiptPath,{allowMissing:true});await writeFile(receiptPath,json(receipt),{flag:'wx'});return receipt;
  }finally{await rm(temp,{recursive:true});} // Only the uniquely created local download copy.
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);assert.ok(args.length===4&&args[0]==='--signed'&&args[1]&&args[2]==='--out'&&args[3],'Usage: --signed <exact-signed-s14-root> --out <new-receipt-outside-stage>');
  const result=await publicReadback({signedDirectory:args[1],out:args[3]});console.log(JSON.stringify({status:result.status,release_set_id:result.release_set_id,fetched_files:79,shared_profile_checks:24,index_sha256:result.index_sha256,receipt:resolve(args[3])}));
}

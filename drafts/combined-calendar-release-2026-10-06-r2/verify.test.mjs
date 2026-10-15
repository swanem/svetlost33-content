// One finite shared check set. No network, native execution, private key or signing.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,realpath,rm,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname,resolve } from 'node:path';
import { ROOT,json,sha256,writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';
import { preflight,bibleChecks } from '../combined-calendar-release-2026-10-06/prepare.mjs';
import { HERE,FROZEN,createPlan,frozenInputs,confirmation,descriptor,CONFIRMED_IOS_VERSION,RELEASE_ID,SEQUENCE,S13_INDEX_SHA,S13_ARCHIVE,PUBLIC_COMMIT } from './prepare.mjs';
import { assertRootGoDocument,assertUnsignedCandidate,assertNewOutput,assertPublicationTarget,assertLiveS13,signS14 } from './sign.mjs';
import { publicReadback } from './public-readback.mjs';
const noNetwork=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Network forbidden in shared r2 tests');};
after(()=>{globalThis.fetch=noNetwork;});
const now=new Date().toISOString(),plan=await createPlan({now});
const temp=await mkdtemp(resolve(await realpath(tmpdir()),'svetlost33-s14-r2-shared-check-'));after(async()=>{await rm(temp,{recursive:true});});
let serial=0;const stage=async files=>{const dir=resolve(temp,`stage-${++serial}`);await writeNewTree(dir,files);return dir;};
const go={status:'ROOT_AUTHORIZED_LOCAL_S14_R2_SIGNING',release_set_id:RELEASE_ID,sequence:SEQUENCE,publication_authorized:false,index_sha256:plan.report.index_sha256,release_sha256:plan.report.release_sha256,signing_request_sha256:sha256(plan.files.get('signing-request.json')),minimum_ios:CONFIRMED_IOS_VERSION,expected_public_head:PUBLIC_COMMIT,expected_public_index_sha256:S13_INDEX_SHA};

test('r2 differs from frozen r1 only in index/release-set/signing plan; exact4payloads and all old evidence preserved',async()=>{
  const original=await captureRefreshTree(resolve(ROOT,FROZEN,'unsigned-s14')),releasePath=JSON.parse(original.get('index.json')).channels.production.path;
  for(const [path,bytes]of original)if(!['index.json',releasePath,'signing-request.json'].includes(path))assert.deepEqual(plan.files.get(path),bytes,path);
  const set=JSON.parse(original.get(releasePath));assert.deepEqual(plan.set,{...set,min_clients:{android:66,ios:CONFIRMED_IOS_VERSION}});
  const oldIndex=JSON.parse(original.get('index.json')),index=JSON.parse(plan.files.get('index.json'));
  assert.deepEqual(index,{...oldIndex,channels:{production:{...oldIndex.channels.production,bytes:plan.files.get(releasePath).length,sha256:sha256(plan.files.get(releasePath))}}});
  assert.equal(plan.files.size,74);assert.equal(plan.request.publication_allowlist.length,18);assert.equal(plan.request.documents_to_sign.length,6);
  for(const file of plan.request.documents_to_sign){assert.equal(plan.files.has(file.signature_path),false);assert.equal(sha256(plan.files.get(file.path)),file.sha256);}
  assert.deepEqual((await frozenInputs()).pins,plan.frozen.pins);assert.deepEqual((await confirmation()).pin,plan.confirmed.pin);
});
test('Confirmed floor propagates into descriptor, hashes/dependencies and exact unsigned artifact',async()=>{
  assert.notEqual(CONFIRMED_IOS_VERSION,'0.1.14');assert.ok(CONFIRMED_IOS_VERSION);assert.deepEqual(plan.set.min_clients,{android:66,ios:CONFIRMED_IOS_VERSION});
  await assertUnsignedCandidate(resolve(HERE,'unsigned-s14-r2'),plan);
  const d=descriptor(plan);assert.equal(d.old.sequence,13);assert.equal(d.candidate.sequence,14);assert.equal(d.candidate.article_count,104);assert.equal(d.candidate.article_links,93);assert.equal(d.candidate.index_sha256,plan.report.index_sha256);
  for(const m of plan.set.modules){const bytes=plan.files.get(m.manifest_path),manifest=JSON.parse(bytes);assert.equal(sha256(bytes),m.manifest_sha256);assert.equal(bytes.length,m.manifest_bytes);
    for(const file of manifest.files){const raw=plan.files.get(`${dirname(m.manifest_path)}/${file.path}`);assert.equal(sha256(raw),file.sha256);assert.equal(raw.length,file.bytes);}
    for(const dep of manifest.dependencies)assert.ok(plan.set.modules.some(x=>x.module_id===dep.module_id&&x.version===dep.version));
  }
});
test('Full KS01/Bible reference validation over unchanged approved content; no native/signature acceptance implied',()=>{
  assert.deepEqual(preflight({files:plan.files,set:plan.set,indexBytes:plan.files.get('index.json'),payloads:plan.payloads,now}),plan.report.preflight);
  assert.deepEqual(bibleChecks(plan.files,plan.set,plan.payloads.calendar),plan.report.bible_checks);
  assert.equal(plan.payloads.saints.articles.length,104);assert.equal(plan.payloads.catalog.article_links.length,93);
  assert.equal(plan.payloads.calendar.days.filter(d=>d.gospel.production_eligible).length,31);assert.equal(plan.payloads.calendar.days.filter(d=>d.date>'2026-11-05'&&d.gospel.status==='UNRESOLVED').length,56);
  assert.equal(plan.report.native_pass,false);assert.equal(plan.report.native_exact_signed_S14_acceptance,false);assert.equal(plan.report.signed,false);assert.equal(plan.report.published,false);
});
test('Hash-bound explicit root GO cannot substitute publication or wrong release/floor/head',()=>{
  assert.equal(assertRootGoDocument(go,plan),true); // In-memory shape example only; not a saved approval.
  for(const key of ['status','release_set_id','sequence','publication_authorized','index_sha256','release_sha256','signing_request_sha256','minimum_ios','expected_public_head','expected_public_index_sha256']){
    const bad={...go,[key]:key==='sequence'?99:key==='publication_authorized'?true:'wrong'};assert.throws(()=>assertRootGoDocument(bad,plan),undefined,key);
  }
});
test('Unsigned extra/tamper and missing authority/external key location stop before key/network access',async()=>{
  const extra=new Map(plan.files);extra.set('unapproved.json',json({extra:true}));await assert.rejects(assertUnsignedCandidate(await stage(extra),plan),/Exact unsigned/u);
  const tamper=new Map(plan.files);tamper.set('index.json',Buffer.from('{}'));await assert.rejects(assertUnsignedCandidate(await stage(tamper),plan),/Unsigned approved-plan mismatch/u);
  await assert.rejects(signS14({}),/coordinator signing GO/u);
  await assert.rejects(signS14({coordinatorGo:true,candidate:resolve(HERE,'unsigned-s14-r2'),out:resolve(temp,'never-created-signed'),sourceDirectory:resolve(ROOT,FROZEN,'unsigned-s14'),rootGoPath:resolve(temp,'never-created-go.json'),privateKeyPath:resolve(ROOT,'never-read-private.pem')}),/Private key must stay outside/u);
});
test('S13 CAS and18-path publication/immutable/new-output guards are read-only and bounded',async()=>{
  const live=new Map(plan.base.files);live.set('index.json',live.get(`${S13_ARCHIVE}/index.json`));live.set('index.sig',live.get(`${S13_ARCHIVE}/index.sig`));live.delete(`${S13_ARCHIVE}/index.json`);live.delete(`${S13_ARCHIVE}/index.sig`);const target=await stage(live);
  // These placeholders exercise path guards only. They are not valid signatures.
  const placeholders=new Map(plan.files);for(const file of plan.request.documents_to_sign)placeholders.set(file.signature_path,Buffer.from('NOT_A_SIGNATURE_TEST_ONLY'));
  assert.equal((await assertPublicationTarget(target,plan,placeholders,PUBLIC_COMMIT)).allowlist.length,18);
  await assert.rejects(assertPublicationTarget(target,plan,placeholders,'0'.repeat(40)),/HEAD advanced/u);
  const advanced=new Map(live);advanced.set('index.json',plan.files.get('index.json'));await assert.rejects(assertLiveS13(await stage(advanced),plan),/S13 source advanced/u);
  const conflict=new Map(live);conflict.set(plan.request.documents_to_sign[0].path,Buffer.from('conflict'));await assert.rejects(assertPublicationTarget(await stage(conflict),plan,placeholders,PUBLIC_COMMIT),/Immutable publication conflict/u);
  await assert.rejects(assertNewOutput(resolve(ROOT,'releases','never-created'),{sourceDirectory:target,candidate:HERE}),/disjoint/u);
  await assert.rejects(assertNewOutput(target,{sourceDirectory:resolve(temp,'source'),candidate:HERE}),/New immutable/u);
  const link=resolve(temp,'symlink');await symlink(target,link);await assert.rejects(assertUnsignedCandidate(link,plan),/[Ss]ymlink/u);
});
test('Readback rejects malformed/in-stage output without fetching; protected inputs remain exact',async()=>{
  await assert.rejects(publicReadback({}),/Explicit signed stage/u);
  await assert.rejects(publicReadback({signedDirectory:HERE,out:resolve(HERE,'never-created.json')}),/outside signed stage/u);
  assert.deepEqual((await frozenInputs()).pins,plan.frozen.pins);
  const afterPlan=await createPlan({now});assert.deepEqual(afterPlan.files,plan.files);assert.deepEqual(afterPlan.request.protected_inputs,plan.request.protected_inputs);
});

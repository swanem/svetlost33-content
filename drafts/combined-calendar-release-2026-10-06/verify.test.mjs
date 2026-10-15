import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { ROOT,json,sha256 } from '../../scripts/prepare-charity-release-v2.mjs';
import { captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';
import { HERE,createPlan,approvedInputs,host,preflight,bibleChecks,nativeDescriptor,parse,S13_ARCHIVE,RELEASE_ID,PRESERVED,REPLACED,APPROVAL_ID } from './prepare.mjs';

const now='2026-10-06T18:20:00Z',plan=await createPlan({now});
const ajv=new Ajv2020({strict:true,allErrors:true});addFormats(ajv);
const shapes={};for(const name of ['index','release-set','module-manifest'])shapes[name]=ajv.compile(JSON.parse(await readFile(resolve(ROOT,`schemas/v2/${name}.schema.json`))));
function graph(files,set){
  const index=parse(files.get('index.json'));assert.ok(shapes.index(index));assert.ok(shapes['release-set'](set));
  const release=files.get(index.channels.production.path);assert.equal(release.length,index.channels.production.bytes);assert.equal(sha256(release),index.channels.production.sha256);assert.deepEqual(parse(release),set);
  for(const entry of set.modules){const bytes=files.get(entry.manifest_path);assert.equal(bytes.length,entry.manifest_bytes);assert.equal(sha256(bytes),entry.manifest_sha256);const manifest=parse(bytes);assert.ok(shapes['module-manifest'](manifest));assert.equal(manifest.module_id,entry.module_id);assert.equal(manifest.version,entry.version);
    for(const dep of manifest.dependencies)assert.ok(set.modules.some(m=>m.module_id===dep.module_id&&m.version===dep.version));
    for(const file of manifest.files){const raw=files.get(`${dirname(entry.manifest_path)}/${file.path}`);assert.equal(raw.length,file.bytes);assert.equal(sha256(raw),file.sha256);}
  }
}

test('Exact unsigned approved-copy reproducibility, six absent signatures, bounded18-path allowlist; development blocked',async()=>{
  assert.deepEqual(await captureRefreshTree(resolve(HERE,'unsigned-s14')),plan.files);
  assert.equal(plan.files.size,74);assert.equal(plan.request.all_candidate_files.length,73);assert.equal(plan.request.documents_to_sign.length,6);assert.equal(plan.request.publication_allowlist.length,18);
  assert.equal(new Set(plan.request.publication_allowlist).size,18);
  for(const file of plan.request.documents_to_sign){assert.equal(plan.files.has(file.signature_path),false);assert.equal(sha256(plan.files.get(file.path)),file.sha256);}
  assert.equal(plan.request.signing_blocked_until_native_projection_gate_resolved,true);assert.equal(plan.report.minimum_clients_compatible,false);
  assert.deepEqual(plan.set.min_clients,{android:66,ios:'0.1.14'}); // Requested placeholder, NOT proven safe for activation.
  graph(plan.files,plan.set);
});
test('Only four module identities changed; all old signed history and library/cycles/charities preserved',()=>{
  for(const [path,bytes]of plan.base.files)assert.deepEqual(plan.files.get(path),bytes,path);
  for(const id of PRESERVED)assert.deepEqual(plan.set.modules.find(m=>m.module_id===id),plan.base.set.modules.find(m=>m.module_id===id));
  for(const id of REPLACED){const next=plan.set.modules.find(m=>m.module_id===id),old=plan.base.set.modules.find(m=>m.module_id===id);assert.notEqual(next.manifest_path,old.manifest_path);assert.equal(next.required,old.required);const nm=parse(plan.files.get(next.manifest_path)),om=parse(plan.base.files.get(old.manifest_path));assert.deepEqual(nm.capabilities,om.capabilities);assert.equal(nm.module_type,om.module_type);}
  assert.equal(parse(plan.files.get(`${S13_ARCHIVE}/index.json`)).sequence,13);assert.equal(plan.base.checks.length,2);assert.ok(plan.base.checks.every(c=>c.verifiedModules===7&&c.sequence===13));
  const d=nativeDescriptor(plan);assert.deepEqual(Object.keys(d),['key_id','trusted_pem_sha256','accepted_at','old','candidate']);assert.equal(d.old.sequence,13);assert.equal(d.candidate.sequence,14);assert.equal(d.old.article_count,104);assert.equal(d.candidate.article_count,104);assert.equal(d.old.article_links,53);assert.equal(d.candidate.article_links,93);
});
test('All104 article objects/days/sources identical; only authorized A+B rows promoted with actual approval ID',()=>{
  const {saints,catalog,browser}=plan.payloads,draft=plan.approved.draft;
  assert.deepEqual(saints.articles,draft.saints.articles);assert.deepEqual(saints.days,draft.saints.days);assert.deepEqual(saints.sources,draft.saints.sources);
  for(const p of [saints,catalog,browser]){assert.equal(p.approval_id,APPROVAL_ID);assert.equal(p.review_status,'approved');}
  for(const key of ['sources','subjects','observances','occurrences','article_links']){
    assert.deepEqual(catalog[key].slice(0,draft.previous[key].length),draft.previous[key]);
    const added=catalog[key].slice(draft.previous[key].length);assert.deepEqual(added,draft.catalog[key].slice(draft.previous[key].length).map(x=>key==='sources'?x:{...x,review_status:'reviewed'}));
  }
  for(const key of ['legacy_slava_links','calendar_profiles'])assert.deepEqual(catalog[key],draft.previous[key]);
  for(const key of ['feast_memberships','archive_bindings','archive_days'])assert.deepEqual(browser[key],draft.beforeBrowser[key]);
});
test('Only31 pinned Gospel operations, exact publisher registration, true display eligibility; all other annual fields untouched',()=>{
  const {calendar}=plan.payloads,old=plan.approved.draft.calendar,ops=plan.approved.combined.gospel.operations;
  assert.equal(calendar.days.length,365);assert.deepEqual(calendar.sources.slice(0,-1),old.sources);assert.deepEqual(calendar.sources.at(-1),plan.approved.combined.gospel.source_to_register);
  for(const key of Object.keys(old))if(!['version','sources','days'].includes(key))assert.deepEqual(calendar[key],old[key],key);
  assert.equal(calendar.days.filter(d=>d.gospel.status==='SOURCE_RECORDED').length,204);assert.equal(calendar.days.filter(d=>d.gospel.status==='UNRESOLVED').length,161);
  assert.equal(calendar.days.filter(d=>d.gospel.production_eligible===true).length,31);
  let afterCount=0;for(const day of calendar.days){const before=old.days.find(d=>d.date===day.date),op=ops.find(o=>o.date===day.date);for(const key of Object.keys(before))if(key!=='gospel')assert.deepEqual(day[key],before[key]);
    assert.deepEqual(day.gospel,op?{...op.after,production_eligible:true}:before.gospel);
    assert.equal(day.gospel.complete_service_schedule_verified,false);
    if(day.date>'2026-11-05'){assert.equal(day.gospel.status,'UNRESOLVED');assert.deepEqual(day.gospel.readings,[]);afterCount++;}
  }assert.equal(afterCount,56);
  assert.equal(calendar.days.find(d=>d.date==='2026-10-14').gospel.readings.length,2);assert.deepEqual(calendar.days.find(d=>d.date==='2026-10-14').gospel.readings[1].zachalo_numbers,[54,58]);
});
test('Calendar→saints→catalog→browser exact raw bindings/dependencies and full semantic checks',()=>{
  const {calendar,saints,catalog,browser}=plan.payloads;
  assert.equal(saints.calendar_binding.sha256,sha256(json(calendar)));assert.equal(saints.calendar_binding.version,'2026.10.6');assert.equal(saints.calendar_binding.revision,3);
  assert.equal(catalog.calendar_bindings[0].sha256,sha256(json(calendar)));assert.equal(catalog.article_bindings[0].sha256,sha256(json(saints)));assert.equal(browser.catalog_binding.sha256,sha256(json(catalog)));
  assert.deepEqual(preflight({files:plan.files,set:plan.set,indexBytes:plan.files.get('index.json'),payloads:plan.payloads,now}),plan.report.preflight);
  assert.deepEqual(bibleChecks(plan.files,plan.set,calendar),plan.report.bible_checks);assert.ok(plan.report.bible_checks.every(x=>x.valid&&x.counts.calendar_readings===285&&x.counts.quotes===21));
  assert.equal(plan.report.preflight.runtime_authenticated,false);
});
test('Wrong dependency, payload bytes, stale binding, forged zachalo and missing corpus verse fail closed',()=>{
  const files=new Map(plan.files),entry=plan.set.modules.find(m=>m.module_id==='calendar-2026-r1');files.set(`${dirname(entry.manifest_path)}/data/calendar.2026.json`,Buffer.from('{}'));assert.throws(()=>graph(files,plan.set));
  const wrong=structuredClone(plan.set);wrong.modules.find(m=>m.module_id==='calendar-2026-r1').version='2026.1.1';assert.throws(()=>graph(plan.files,wrong));
  const stale=structuredClone(plan.payloads);stale.catalog.calendar_bindings[0].sha256='0'.repeat(64);assert.throws(()=>preflight({files:plan.files,set:plan.set,indexBytes:plan.files.get('index.json'),payloads:stale,now}),/binding/u);
  const malformed=structuredClone(plan.payloads.calendar);malformed.days.find(d=>d.date==='2026-10-14').gospel.readings[1].zachalo_numbers=[54];assert.throws(()=>bibleChecks(plan.files,plan.set,malformed),/source_calendar_label_mismatch/u);
  const corpusFiles=new Map(plan.files),lib=plan.set.modules.find(m=>m.module_id==='library-annual-2026-r1'),path=`${dirname(lib.manifest_path)}/data/gospels.sr-Cyrl.json`,gospel=parse(corpusFiles.get(path));const chapter=gospel.books.find(b=>b.id==='LUK').chapters.find(c=>c.number===5);chapter.verses=chapter.verses.filter(v=>v.number!==13);corpusFiles.set(path,json(gospel));assert.throws(()=>bibleChecks(corpusFiles,plan.set,plan.payloads.calendar),/missing_verse/u);
});
test('Old review/service gates preserved, no native/signature/publication acceptance claimed, immutable inputs unchanged',async()=>{
  assert.equal(plan.payloads.calendar.review_state,'DRAFT');assert.equal(plan.payloads.calendar.activation_status,'NOT_ACTIVE');assert.equal(plan.payloads.calendar.production_ready,false);assert.equal(plan.payloads.calendar.human_or_clergy_review,null);
  assert.ok(plan.payloads.calendar.days.filter(d=>d.gospel.production_eligible).every(d=>d.gospel.service_assignment_status==='UNRESOLVED'&&d.gospel.readings.every(r=>r.service==='unspecified')));
  assert.equal(plan.report.native_pass,false);assert.equal(plan.report.signed,false);assert.equal(plan.report.published,false);assert.equal(plan.request.production_signing_requires_separate_coordinator_go,true);
  assert.deepEqual((await approvedInputs()).protected_inputs,plan.request.protected_inputs);
  for(const item of plan.request.protected_inputs){const bytes=await readFile(resolve(ROOT,item.path));assert.equal(sha256(bytes),item.sha256,item.path);}
  assert.equal(plan.approved.catalog.review_status,'pending');assert.equal(plan.approved.browser.review_status,'pending');
});

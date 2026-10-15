#!/usr/bin/env node
// S14 approved-copy assembly only. No signing, key discovery, network or publication.
import assert from 'node:assert/strict';
import { dirname,isAbsolute,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT,KEY_ID,PUBLIC_KEY_SHA256,json,sha256,writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { readRefreshInput } from '../../scripts/prepare-shared-refresh-release-v2.mjs';
import { validateRelease } from '../../scripts/validate-m0-v2.mjs';
import { CALENDAR_BROWSER_CAPABILITIES } from '../../scripts/prepare-calendar-browser-release-v2.mjs';
import { KS01_CAPACITY_PROFILE as profile } from '../../scripts/validate-ks01-capacity.mjs';
import { assertBibleCandidate } from '../../scripts/validate-bible-reference-v1.mjs';
import { host,preflight,parse,record } from '../saints104-release-2026-10-06/prepare.mjs';

export { host,preflight,parse,record };
export const HERE=dirname(fileURLToPath(import.meta.url));
export const RELEASE_ID='shared-calendar-gospel-2026-10-06-m0v2-s14';
export const SEQUENCE=14;
export const PREPARED_AT='2026-10-06T18:16:00Z';
export const APPROVAL_PATH='approvals/pravoslavno-gospel-2026-10-06/owner-combined-publication-approval.json';
export const APPROVAL_SHA='5f6caab4281e3a31a1b0c9b6d69c1aca89bed418a81e1d8822ccf0c846db3912';
export const APPROVAL_ID='owner-combined-calendar-gospel-2026-10-06';
export const S13_ID='shared-saints104-2026-10-06-m0v2-s13';
export const S13_ROOT=resolve(ROOT,'drafts/saints104-release-2026-10-06/signed-s13');
export const S13_ARCHIVE=`discovery-archive/${S13_ID}`;
export const S13_INDEX_SHA='6250554d597daa19025cdcd3bc1d0c7c1763c3763ff4bc4fe1b85fb03f69441b';
export const S13_RELEASE_SHA='76054fb851221ad1de64922a1167741646e2dd9f199588404b9a6a7745d4b7ff';
export const PUBLIC_COMMIT='0cbc5e31100c3a66830f1fd6e3d0a08a489dcb8b';
export const PRESERVED=['library-annual-2026-r1','daily-cycles-r1','organizations-v1'];
export const REPLACED=['calendar-2026-r1','saints-v1','liturgical-catalog-v1','calendar-browser-v1'];
const safe=p=>{assert.ok(typeof p==='string'&&!isAbsolute(p)&&!p.includes('\\')&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'));return p;};

export async function approvedInputs(){
  const pins=new Map(),pinned=async(path,hash)=>{const bytes=await readRefreshInput(resolve(ROOT,safe(path)));assert.equal(sha256(bytes),hash,`Approved input ${path}`);pins.set(path,record(path,bytes));return parse(bytes);};
  const owner=await pinned(APPROVAL_PATH,APPROVAL_SHA);
  assert.equal(owner.status,'USER_APPROVED_EXACT_COMBINED_CONTENT_PUBLICATION_AFTER_FINAL_NATIVE_CHECKS');assert.equal(owner.approval_id,APPROVAL_ID);assert.equal(owner.user_answer_exact,'odobravam');assert.equal(owner.preserve_original_pending_drafts,true);
  assert.ok(Date.parse(owner.recorded_at_utc)<=Date.parse(PREPARED_AT));
  const dir='drafts/ks01-combined-calendar-2026-10-06',h=await pinned(`${dir}/handoff.json`,owner.pins_verified_by_root.combined_handoff);
  for(const file of h.artifacts){const path=`${dir}/${safe(file.path)}`;const bytes=await readRefreshInput(resolve(ROOT,path));assert.equal(sha256(bytes),file.sha256,path);assert.equal(bytes.length,file.bytes);pins.set(path,record(path,bytes));}
  for(const file of h.shared_source_pins){const bytes=await readRefreshInput(resolve(ROOT,safe(file.path)));assert.equal(sha256(bytes),file.sha256);pins.set(file.path,record(file.path,bytes));}
  await pinned('approvals/pravoslavno-gospel-2026-10-06/root-combined-draft-review.json',owner.pins_verified_by_root.root_combined_review);
  const combined=await pinned(`${dir}/ab-component/combined-operation-manifest.json`,owner.pins_verified_by_root.combined_operation_manifest);
  const catalog=await pinned(`${dir}/ab-component/catalog.pending.json`,owner.pins_verified_by_root.catalog_pending);
  const browser=await pinned(`${dir}/ab-component/browser.pending.json`,owner.pins_verified_by_root.browser_pending);
  await pinned('drafts/pravoslavno-gospel-2026-10-06/review/candidate.json',owner.pins_verified_by_root.source_intake_candidate);
  const observation=await pinned('approvals/saints104-2026-10-06/public-readback-s13.json',owner.pins_verified_by_root.public_S13_readback);
  // Reuses pinned pure preparation only after every frozen source/artifact was checked.
  const {prepare}=await import('../ks01-combined-calendar-2026-10-06/prepare.mjs');const draft=await prepare();
  assert.deepEqual(draft.combined,combined);assert.deepEqual(draft.catalog,catalog);assert.deepEqual(draft.browser,browser);
  for(const item of draft.base.inputPins)pins.set(item.path,item);
  const reused='drafts/saints104-release-2026-10-06/prepare.mjs',reusedBytes=await readRefreshInput(resolve(ROOT,reused));
  assert.equal(sha256(reusedBytes),'2a38f9a0dac361925e9392e0c9a976b95d1c447c335f9b3356aa1d3568ddb4fb');pins.set(reused,record(reused,reusedBytes));
  return {owner,draft,combined,catalog,browser,observation,protected_inputs:[...pins.values()].sort((a,b)=>a.path.localeCompare(b.path,'en'))};
}

export async function loadS13({sourceDirectory=S13_ROOT,now=new Date().toISOString(),archived=false,approved}={}){
  approved??=await approvedInputs();const observation=approved.observation;
  assert.equal(observation.status,'PASS');assert.equal(observation.fetched_files,63);assert.equal(observation.index_sha256,S13_INDEX_SHA);
  const files=new Map();for(const item of observation.files){const path=archived&&['index.json','index.sig'].includes(item.path)?`${S13_ARCHIVE}/${item.path}`:item.path;const bytes=await readRefreshInput(resolve(sourceDirectory,safe(path)));assert.equal(bytes.length,item.bytes);assert.equal(sha256(bytes),item.sha256);files.set(path,bytes);}
  assert.equal(sha256(files.get('trusted-public-key.pem')),PUBLIC_KEY_SHA256);
  const indexPath=archived?`${S13_ARCHIVE}/index.json`:'index.json',indexSignaturePath=archived?`${S13_ARCHIVE}/index.sig`:'index.sig';
  const index=parse(files.get(indexPath)),set=parse(files.get(index.channels.production.path));assert.equal(index.sequence,13);assert.equal(set.release_set_id,S13_ID);assert.equal(index.channels.production.sha256,S13_RELEASE_SHA);
  const checks=[];for(const [platform,clientVersion]of [['android',66],['ios','0.1.14']]){
    const result=await validateRelease(sourceDirectory,{now,platform,clientVersion,trustedKeyId:KEY_ID,minimumSequence:13,clientCapabilities:CALENDAR_BROWSER_CAPABILITIES,indexPath,indexSignaturePath});assert.equal(result.releaseSetId,S13_ID);assert.equal(result.verifiedModules,7);checks.push({platform,...result});
  }
  files.set(`${S13_ARCHIVE}/index.json`,files.get(indexPath));files.set(`${S13_ARCHIVE}/index.sig`,files.get(indexSignaturePath));files.delete('index.json');files.delete('index.sig');
  return {files,index,set,checks,observation};
}

export function bibleChecks(files,set,calendar){
  const entry=set.modules.find(m=>m.module_id==='library-annual-2026-r1'),cycle=set.modules.find(m=>m.module_id==='daily-cycles-r1');
  return ['sr-Cyrl','sr-Latn'].map(locale=>assertBibleCandidate({locale,generationId:RELEASE_ID,
    psalms:parse(files.get(`${dirname(entry.manifest_path)}/data/psalms.${locale}.json`)),
    gospels:parse(files.get(`${dirname(entry.manifest_path)}/data/gospels.${locale}.json`)),
    cycle:parse(files.get(`${dirname(cycle.manifest_path)}/data/legacy-cycle.${locale}.json`)),calendar}));
}

export async function createPlan({sourceDirectory=S13_ROOT,now=new Date().toISOString(),archived=false}={}){
  assert.ok(Number.isFinite(Date.parse(now))&&Date.parse(now)>=Date.parse(PREPARED_AT));
  const approved=await approvedInputs(),base=await loadS13({sourceDirectory,now,archived,approved}),draft=approved.draft;
  const calendar=structuredClone(draft.calendar),saints=structuredClone(draft.saints),catalog=structuredClone(approved.catalog),browser=structuredClone(approved.browser);
  calendar.version='2026.10.6';calendar.sources.push(structuredClone(approved.combined.gospel.source_to_register));
  for(const op of approved.combined.gospel.operations){
    const day=calendar.days.find(d=>d.date===op.date);assert.equal(sha256(json(day.gospel)),op.before_sha256);
    day.gospel=structuredClone(op.after);assert.equal(day.gospel.production_eligible,false);
    // Authorization is only to display these publisher references, not full service assignment.
    day.gospel.production_eligible=true;
  }
  assert.equal(approved.combined.gospel.operations.length,31);
  const calendarBytes=json(calendar),calendarBinding={module_id:'calendar-2026-r1',version:'2026.10.6',revision:3,path:'data/calendar.2026.json',sha256:sha256(calendarBytes)};
  Object.assign(saints,{version:'2026.10.6',revision:6,review_status:'approved',approval_id:APPROVAL_ID,calendar_binding:calendarBinding});
  assert.deepEqual(saints.articles,draft.saints.articles);assert.deepEqual(saints.sources,draft.saints.sources);assert.deepEqual(saints.days,draft.saints.days);
  const saintsBytes=json(saints);
  Object.assign(catalog,{version:'2026.10.6',revision:9,review_status:'approved',approval_id:APPROVAL_ID});
  for(const key of ['subjects','observances','occurrences','article_links'])for(const item of catalog[key].slice(draft.previous[key].length)){assert.equal(item.review_status,'pending');item.review_status='reviewed';}
  for(const key of ['sources','subjects','observances','occurrences','article_links'])assert.deepEqual(catalog[key].slice(0,draft.previous[key].length),draft.previous[key]);
  Object.assign(catalog.calendar_bindings.find(b=>b.module_id===calendarBinding.module_id),calendarBinding);
  Object.assign(catalog.article_bindings.find(b=>b.module_id==='saints-v1'),{version:saints.version,revision:saints.revision,sha256:sha256(saintsBytes)});
  const catalogBytes=json(catalog);
  Object.assign(browser,{version:'2026.10.6',revision:5,review_status:'approved',approval_id:APPROVAL_ID});Object.assign(browser.catalog_binding,{version:catalog.version,revision:catalog.revision,sha256:sha256(catalogBytes)});
  const browserBytes=json(browser);
  for(const [name,raw]of [['saints',saintsBytes],['catalog',catalogBytes],['browser',browserBytes]]){const method={saints:'parseSaintsPayload',catalog:'parseCatalogPayload',browser:'parseCalendarBrowserPayload'}[name];assert.equal(profile[name][method](raw).valid,true);}
  const files=new Map(base.files),documents=[],replacements=new Map(),prefix=`releases/${RELEASE_ID}`;
  for(const [id,bytes,version,revision,dependencies]of [
    ['calendar-2026-r1',calendarBytes,'2026.10.6',3,draft.base.modules['calendar-2026-r1'].manifest.dependencies],
    ['saints-v1',saintsBytes,saints.version,saints.revision,[{module_id:calendarBinding.module_id,version:calendarBinding.version}]],
    ['liturgical-catalog-v1',catalogBytes,catalog.version,catalog.revision,profile.catalog.catalogDependencies(catalog)],
    ['calendar-browser-v1',browserBytes,browser.version,browser.revision,[]]]){
    const old=base.set.modules.find(m=>m.module_id===id),oldManifest=parse(base.files.get(old.manifest_path));
    const root=`${prefix}/modules/${id}-${version}-r${revision}`,path=id==='calendar-2026-r1'?'data/calendar.2026.json':`data/${id}.json`;
    const manifestPath=`${root}/manifest.json`,signaturePath=`${root}/manifest.sig`;files.set(`${root}/${path}`,bytes);
    const manifest=json({...oldManifest,version,revision,dependencies,files:[{...record(path,bytes),content_type:'application/json',encoding:'utf-8'}]});
    files.set(manifestPath,manifest);documents.push([manifestPath,signaturePath]);
    replacements.set(id,{...old,version,manifest_path:manifestPath,manifest_bytes:manifest.length,manifest_sha256:sha256(manifest),signature_path:signaturePath});
  }
  const set={...base.set,release_set_id:RELEASE_ID,sequence:SEQUENCE,min_clients:{android:66,ios:'0.1.14'},modules:base.set.modules.map(m=>replacements.get(m.module_id)??m)};
  const releasePath=`${prefix}/release-set.json`,releaseBytes=json(set);files.set(releasePath,releaseBytes);documents.push([releasePath,`${prefix}/release-set.sig`]);
  const indexBytes=json({...base.index,sequence:SEQUENCE,issued_at:PREPARED_AT,channels:{production:{release_set_id:RELEASE_ID,path:releasePath,bytes:releaseBytes.length,sha256:sha256(releaseBytes),signature_path:`${prefix}/release-set.sig`}}});
  files.set('index.json',indexBytes);documents.push(['index.json','index.sig']);
  const payloads={calendar,saints,catalog,browser},checks=preflight({files,set,indexBytes,payloads,now}),bible=bibleChecks(files,set,calendar);
  const publishPaths=[...files.keys()].filter(p=>p==='index.json'||p.startsWith(`${prefix}/`)||p.startsWith(`${S13_ARCHIVE}/`));
  const request={schema_version:'svetlost33-signing-request-1',state:'UNSIGNED_CANDIDATE',release_set_id:RELEASE_ID,sequence:SEQUENCE,key_id:KEY_ID,expected_public_key_sha256:PUBLIC_KEY_SHA256,
    owner_approval_path:APPROVAL_PATH,owner_approval_sha256:APPROVAL_SHA,approval_id:APPROVAL_ID,source_public_commit:PUBLIC_COMMIT,source_index_sha256:S13_INDEX_SHA,source_release_sha256:S13_RELEASE_SHA,
    public_base_observation_path:'approvals/saints104-2026-10-06/public-readback-s13.json',public_base_observation_sha256:approved.owner.pins_verified_by_root.public_S13_readback,
    minimum_clients:set.min_clients,preserved_module_ids:PRESERVED,replaced_module_ids:REPLACED,
    signature_algorithm:'RSA-PSS-SHA256',salt_length:32,signature_encoding:'base64-with-final-newline',production_signing_requires_separate_coordinator_go:true,
    native_exact_generation_acceptance_required_before_publication:true,minimum_clients_are_requested_not_proven_compatible:true,signing_blocked_until_native_projection_gate_resolved:true,publication_requires_public_head_compare_and_swap:PUBLIC_COMMIT,
    publication_immutable_paths:publishPaths.filter(p=>p!=='index.json').sort(),documents_to_sign:documents.map(([path,signature_path])=>({...record(path,files.get(path)),signature_path})),
    publication_allowlist:[...publishPaths,...documents.map(([,path])=>path)].sort(),all_candidate_files:[...files].map(([path,bytes])=>record(path,bytes)).sort((a,b)=>a.path.localeCompare(b.path,'en')),
    protected_inputs:approved.protected_inputs,preflight:checks,bible_checks:bible};
  assert.equal(request.publication_allowlist.length,18);assert.equal(new Set(request.publication_allowlist).size,18);assert.equal(documents.length,6);assert.equal(files.size,73);
  const report={status:'UNSIGNED_S14_APPROVED_COPY_NOT_PUBLISHED',release_set_id:RELEASE_ID,sequence:SEQUENCE,index_sha256:sha256(indexBytes),release_sha256:sha256(releaseBytes),
    calendar:record('data/calendar.2026.json',calendarBytes),saints:record('data/saints-v1.json',saintsBytes),catalog:record('data/liturgical-catalog-v1.json',catalogBytes),browser:record('data/calendar-browser-v1.json',browserBytes),
    approval:{path:APPROVAL_PATH,sha256:APPROVAL_SHA,id:APPROVAL_ID},preflight:checks,bible_checks:bible,source_actual_RSA_checks:base.checks,
    unchanged_article_objects:104,A_dates:23,B_dates:19,new_article_links:40,gospel_dates_added:31,gospel_readings_added:33,
    gospel_display_eligible_dates:calendar.days.filter(d=>d.gospel.production_eligible===true).map(d=>d.date),
    full_service_schedule_claimed:false,annual_top_level_historical_review_flags_preserved:true,unresolved_future_dates_preserved:56,fasting_and_non_gospel_day_fields_unchanged:true,
    preserved_module_ids:PRESERVED,replaced_module_ids:REPLACED,old_pending_originals_unchanged:true,test_fixture_reused:false,
    unsigned_graph_files:73,unsigned_documents:6,signed_graph_expected_files:79,publication_allowlist_files:18,
    native_pass:false,signed:false,published:false,requested_minimum_clients:set.min_clients,minimum_clients_compatible:false,
    known_blocker:'Root source review: released iOS41 M0 ModularRuntimeProjector uses loadDevelopmentReview; AnnualGospelCalendar requires173 source-recorded/192 unresolved and productionEligible=false. S14 changes counts to204/161 and31eligible=true. Native owner confirmation/remediation required; no historical guard weakened here.',
    remaining_gates:['Root review of exact graph/approval transform and separate local signing GO','Exact signed native S13→S14 acceptance including publisher-reference display and historical annual-gate compatibility','Fresh ordinary public S13 index/signature and HEAD compare-and-swap','Atomic allowlisted publication and exact signed public graph readback'],
    limitation:'Historical annual top-level gates and library release-scope stay unchanged; only31 newly approved publisher reference days get production_eligible=true. No blanket annual/clergy approval.'};
  files.set('signing-request.json',json(request));
  return {files,request,report,base,set,payloads,approved};
}

export function nativeDescriptor(plan){
  const describe=(files,set,indexBytes)=>({release_set_id:set.release_set_id,sequence:set.sequence,minimum_android_code:set.min_clients.android,index_sha256:sha256(indexBytes),release_sha256:parse(indexBytes).channels.production.sha256,
    article_count:host(files,set,'saints-v1').payload.articles.length,article_links:host(files,set,'liturgical-catalog-v1').payload.article_links.length,
    modules:set.modules.map(m=>{const manifest=parse(files.get(m.manifest_path));return {module_id:m.module_id,version:manifest.version,revision:manifest.revision,dependencies:manifest.dependencies};})});
  return {key_id:KEY_ID,trusted_pem_sha256:PUBLIC_KEY_SHA256,accepted_at:PREPARED_AT,old:describe(plan.base.files,plan.base.set,plan.base.files.get(`${S13_ARCHIVE}/index.json`)),candidate:describe(plan.files,plan.set,plan.files.get('index.json'))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.deepEqual(process.argv.slice(2),['--write']);const plan=await createPlan();await writeNewTree(resolve(HERE,'unsigned-s14'),plan.files);
  await writeNewTree(resolve(HERE,'preparation'),new Map([['report.json',json(plan.report)],['native-acceptance.json',json(nativeDescriptor(plan))],['protected-inputs-before.json',json(plan.request.protected_inputs)]]));
  console.log(JSON.stringify(plan.report));
}

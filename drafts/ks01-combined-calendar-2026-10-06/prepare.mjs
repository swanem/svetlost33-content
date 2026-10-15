#!/usr/bin/env node
// Offline A+B materialization only. No shared adapter, approval, transport or production writes.
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, json, sha256, writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { readRefreshInput } from '../../scripts/prepare-shared-refresh-release-v2.mjs';
import { KS01_CAPACITY_PROFILE as profile } from '../../scripts/validate-ks01-capacity.mjs';
import { toLatin } from '../../scripts/validate-saints-v1.mjs';
import { rows, popularAliases, identityNotes } from '../calendar-saints-expansion-2026-10-06/master.mjs';
import { PRAVOSLAVNO_SOURCE_ID, PRAVOSLAVNO_SOURCE_URL, PRAVOSLAVNO_SOURCE_TITLE, pravoslavnoCalendarLabelMatches } from '../../scripts/pravoslavno-calendar-reference.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const S13 = 'shared-saints104-2026-10-06-m0v2-s13';
export const PROFILE = 'spc-rs-ba-julian-v1';
const oldDraft = 'drafts/calendar-saints-expansion-2026-10-06';
const stage = 'drafts/saints104-release-2026-10-06/signed-s13';
const reviewPath = '../svetlost33-github/docs/contracts/calendar-saints-expansion-2026-10-06/package-a-source-review.json';
const counts = c => Object.fromEntries(['sources','subjects','observances','occurrences','article_links'].map(k => [k,c[k].length]));
const localized = text => ({ 'sr-Cyrl': text, 'sr-Latn': toLatin(text) });
export const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });

export async function loadBase() {
  const inputPins = [], capture = async (path, expected) => {
    const bytes = await readRefreshInput(resolve(ROOT,path));
    if (expected) assert.equal(sha256(bytes), expected, `Pinned input: ${path}`);
    inputPins.push(record(path,bytes)); return bytes;
  };
  const review = JSON.parse(await capture(reviewPath,'e4376220de5d59a88c61f081d70a6b7d4734b3a0a839a1bb49345cdc49510c50'));
  assert.equal(review.decision,'NO_BLOCKER_FOR_TECHNICAL_REUSE_OF_APPROVED_SOURCES');
  for (const [path,hash] of Object.entries(review.frozen_artifact_sha256)) await capture(`${oldDraft}/${path}`,hash);
  const sourceRecords = {};
  for (const item of review.prior_scope_records) sourceRecords[item.path_relative_to_content_repo] = JSON.parse(await capture(item.path_relative_to_content_repo,item.sha256));
  const publicReadback = JSON.parse(await capture('approvals/saints104-2026-10-06/public-readback-s13.json','e6bce373760da88996bf2df0a789ff853eef483e12a9d393608106d149f9c700'));
  assert.equal(publicReadback.status,'PASS'); assert.equal(publicReadback.release_set_id,S13);
  assert.equal(publicReadback.fetched_files,63); assert.equal(publicReadback.shared_profile_checks,24);
  const graph = new Map();
  for (const item of publicReadback.files) {
    const bytes = await capture(`${stage}/${item.path}`,item.sha256); assert.equal(bytes.length,item.bytes);
    graph.set(item.path,bytes);
  }
  const index = JSON.parse(graph.get('index.json')), set = JSON.parse(graph.get(index.channels.production.path));
  assert.equal(index.sequence,13); assert.equal(set.sequence,13); assert.equal(set.release_set_id,S13); assert.equal(set.modules.length,7);
  const modules = {};
  for (const id of ['calendar-2026-r1','saints-v1','liturgical-catalog-v1','calendar-browser-v1']) {
    const entry = set.modules.find(m => m.module_id===id), rawManifest = graph.get(entry.manifest_path);
    assert.equal(sha256(rawManifest),entry.manifest_sha256); assert.equal(rawManifest.length,entry.manifest_bytes);
    const manifest = JSON.parse(rawManifest); assert.equal(manifest.files.length,1);
    const file = manifest.files[0], path = `${dirname(entry.manifest_path)}/${file.path}`, bytes = graph.get(path);
    assert.equal(bytes.length,file.bytes); assert.equal(sha256(bytes),file.sha256);
    modules[id] = { manifest, file, path:`${stage}/${path}`, bytes, payload:JSON.parse(bytes) };
  }
  const priorInventory = JSON.parse(await readRefreshInput(resolve(ROOT,oldDraft,'inventory.json')));
  const priorDelta = JSON.parse(await readRefreshInput(resolve(ROOT,oldDraft,'package-a.delta.json')));
  const gospel = JSON.parse(await capture('drafts/pravoslavno-gospel-2026-10-06/review/candidate.json','fb4ed9f299fce8c8ee411815c5c2c68884c68e0c9468c4437c3c044f82a5ae1c'));
  await capture('drafts/pravoslavno-gospel-2026-10-06/handoff.json','fbfb34c177017198bbc76761f0841c99f006cf931ba3b5c9d4675425a9661cc9');
  await capture('approvals/pravoslavno-gospel-2026-10-06/source-label-adapter-decision.json','978269e1f256a5567634baec0c893d69e53902c6be55d5c6959bf32252d5d4d1');
  return { inputPins, modules, graph, index, set, priorInventory, priorDelta, sourceRecords, publicReadback, gospel };
}

export async function prepare() {
  const base = await loadBase();
  const calendar = base.modules['calendar-2026-r1'].payload, saints = base.modules['saints-v1'].payload;
  const previous = base.modules['liturgical-catalog-v1'].payload, beforeBrowser = base.modules['calendar-browser-v1'].payload;
  assert.equal(profile.saints.parseSaintsPayload(base.modules['saints-v1'].bytes).valid,true);
  assert.equal(saints.review_status,'approved'); assert.equal(saints.articles.length,104);
  const catalog = structuredClone(previous), browser = structuredClone(beforeBrowser);
  Object.assign(catalog,{ version:'2026.10.6',revision:9,review_status:'pending',approval_id:null });
  const additions = {sources:[],subjects:[],observances:[],occurrences:[],article_links:[]};
  const packages = {A:structuredClone(additions),B:structuredClone(additions)};
  const cb = catalog.calendar_bindings.find(b=>b.year===2026&&b.calendar_profile_id===PROFILE);
  const ab = catalog.article_bindings.find(b=>b.module_id==='saints-v1');
  assert.equal(cb.sha256,sha256(base.modules['calendar-2026-r1'].bytes));
  assert.equal(ab.sha256,sha256(base.modules['saints-v1'].bytes));
  const inventory = [];
  for (const row of rows) {
    const add = (key,value) => { catalog[key].push(value); additions[key].push(value); packages[row.package][key].push(value); };
    const old = base.priorInventory.rows.find(r=>r.date===row.date);
    assert.ok(old); for (const key of Object.keys(row)) assert.deepEqual(row[key],old[key]);
    const day = saints.days.find(d=>d.date===row.date), annual = calendar.days.find(d=>d.date===row.date), article = saints.articles.find(a=>a.id===row.article_id);
    assert.ok(day&&annual&&article); assert.deepEqual(day.article_ids,[row.article_id]);
    assert.equal(annual.commemoration.status,'SOURCE_RECORDED'); assert.equal(annual.commemoration.complete_saint_list_verified,false);
    assert.equal(day.julian_date,annual.julian_date); assert.deepEqual(day.calendar_title,localized(annual.commemoration.title_cyrl));
    assert.deepEqual(day.calendar_source_ids,annual.commemoration.source_ids);
    assert.equal(article.type,old.article_type); assert.equal(article.content['sr-Cyrl'].title,old.article_title);
    const sourceRecords = article.source_ids.map(id=>saints.sources.find(s=>s.id===id));
    assert.deepEqual(sourceRecords,old.article_sources); assert.ok(sourceRecords.every(s=>s.kind==='article'));
    const sourceProof = sourceRecords.map(source=>{
      const registryPath = source.id.startsWith('comp-') ? 'drafts/saints-completion-2026-09-21/sources.json' : 'drafts/saints-next-window-2026-09-30/sources.json';
      const registry = base.sourceRecords[registryPath];
      const entry = source.id.startsWith('comp-') ? registry.sources.find(s=>s.id===source.id) : registry.biography_sources.find(s=>s.source.id===source.id);
      assert.ok(entry,`Original source registry ${source.id}`);
      if (entry.source) for(const key of Object.keys(entry.source)) assert.deepEqual(source[key],entry.source[key]);
      else { assert.equal(source.url,entry.url); assert.equal(source.reviewed_on,entry.checked_on); }
      return {source_id:source.id,registry_path:registryPath,original_record:entry,new_web_check:false};
    });
    const subject = previous.subjects.find(s=>s.id===row.subject_id), observance = previous.observances.find(o=>o.id===row.observance_id);
    const occurrence = previous.occurrences.find(o=>o.observance_id===row.observance_id&&o.date===row.date);
    const link = previous.article_links.find(l=>l.observance_id===row.observance_id&&l.article_id===row.article_id);
    const kind = article.type==='saint'?'saint_commemoration':article.type==='group'?'group_commemoration':article.subtype==='commemoration_of_event'?'event':'feast';
    if (subject) assert.equal(subject.type,article.type==='feast'?'saint':article.type);
    if (observance) {assert.equal(observance.kind,kind); assert.deepEqual(observance.subject_ids,row.subject_id?[row.subject_id]:[]);}
    assert.deepEqual(previous.occurrences.filter(o=>o.date===row.date).map(o=>o.observance_id),occurrence?[row.observance_id]:[]);
    if(occurrence) {assert.equal(occurrence.julian_date,day.julian_date);assert.deepEqual(occurrence.calendar_title,day.calendar_title);assert.deepEqual(occurrence.calendar_source_ids,day.calendar_source_ids);}
    const alias = popularAliases[row.observance_id], aliases = alias ? Object.entries(localized(alias)).map(([locale,text])=>({text,locale,kind:'popular',source_ids:day.calendar_source_ids})) : [];
    for(const a of aliases) assert.ok(day.calendar_title[a.locale].includes(a.text),'Alias exact calendar evidence');
    const operations = { subject:row.subject_id===null?'none_for_feast':subject?'reuse':'add',observance:observance?'reuse':'add',occurrence:occurrence?'reuse':'add',article_link:link?'reuse':'add' };
    const sourceIds = [...new Set([...day.calendar_source_ids,...article.source_ids])];
    const name = Object.fromEntries(['sr-Cyrl','sr-Latn'].map(locale=>[locale,article.content[locale].title]));
    if(!link) {
      for(const s of sourceRecords) if(!catalog.sources.some(x=>x.id===s.id)) add('sources',{id:s.id,title:s.title,url:s.url,publisher:s.publisher,original_author:s.original_author,checked_on:s.reviewed_on,review_status:'reviewed',rights_status:'recorded_elsewhere'});
      if(row.subject_id&&!subject) add('subjects',{id:row.subject_id,type:article.type,name,aliases:[],source_ids:sourceIds,review_status:'pending'});
      if(!observance) add('observances',{id:row.observance_id,kind,name,description:localized(article.type==='feast'?'Празнични спомен':article.type==='group'?'Спомен групе светих':'Спомен светитеља'),subject_ids:row.subject_id?[row.subject_id]:[],aliases,source_ids:sourceIds,review_status:'pending'});
      if(!occurrence) add('occurrences',{id:`occ-${row.observance_id}-2026`,observance_id:row.observance_id,calendar_binding_id:cb.id,date:row.date,julian_date:day.julian_date,calendar_title:day.calendar_title,calendar_source_ids:day.calendar_source_ids,source_ids:sourceIds,review_status:'pending'});
      add('article_links',{observance_id:row.observance_id,article_binding_id:ab.id,article_id:row.article_id,source_ids:sourceIds,review_status:'pending'});
    }
    inventory.push({...row,julian_date:day.julian_date,calendar_title:day.calendar_title,article_title:name,article_type:article.type,observance_kind:kind,
      operations,occurrence_id:occurrence?.id??`occ-${row.observance_id}-2026`,aliases,article_sources:sourceRecords,source_proof:sourceProof,
      calendar_evidence:{payload_sha256:cb.sha256,date:annual.date,julian_date:annual.julian_date,commemoration:annual.commemoration},
      identity_note:identityNotes[row.article_id]??sourceProof.map(s=>s.original_record.evidence?.editorial_note??'Original approved article identity retained.').join(' '),
      review_basis:row.package==='A'?'REUSED_PINNED_INDEPENDENT_A_REVIEW':'EXACT_APPROVED_ARTICLE_TYPE_AND_ORIGINAL_SOURCE_REGISTRY_WITH_IMMUTABLE_ANNUAL_JOIN',
      candidate_status:link?'ALREADY_LINKED_IN_S13':'PENDING_EXACT_METADATA_REVIEW',unresolved_identity_or_date:[]});
  }
  // A source-reviewed records must remain byte-for-byte equivalent across rebase.
  for(const key of Object.keys(additions)) assert.deepEqual(packages.A[key],base.priorDelta.records[key]);
  const coverage = catalog.coverage.find(c=>c.calendar_binding_id===cb.id);
  coverage.mapped_dates = new Set([...catalog.occurrences,...catalog.day_reviews].filter(x=>x.calendar_binding_id===cb.id).map(x=>x.date)).size;
  coverage.occurrences = catalog.occurrences.filter(x=>x.calendar_binding_id===cb.id).length;
  const catalogBytes=json(catalog); assert.equal(profile.catalog.parseCatalogPayload(catalogBytes).valid,true);
  Object.assign(browser,{version:'2026.10.6',revision:5,review_status:'pending',approval_id:null});
  Object.assign(browser.catalog_binding,{version:catalog.version,revision:catalog.revision,sha256:sha256(catalogBytes)});
  const browserBytes=json(browser); assert.equal(profile.browser.parseCalendarBrowserPayload(browserBytes).valid,true);
  const delta={schema_version:'svetlost33-combined-ab-delta-1',status:'PENDING_UNSIGNED_COMPONENT_NOT_FULL_COMBINED_RELEASE',
    base_release_set_id:S13,base_index_sha256:sha256(await readRefreshInput(resolve(ROOT,stage,'index.json'))),window:['2026-10-09','2026-11-19'],
    before:counts(previous),additions:counts(additions),after:counts(catalog),packages:Object.fromEntries(Object.entries(packages).map(([k,v])=>[k,counts(v)])),records:additions,
    article_count:104,new_or_changed_article_bodies:0,saints_payload_unchanged:true,annual_payload_unchanged:true,
    existing_s13_year_end_links_preserved:true,browser_memberships_and_archive_unchanged:true,
    candidate_versions_local_only:true,production_eligible:false,approval:null,new_web_review:false,source_checked_dates_advanced:false,
    already_linked:inventory.filter(r=>r.operations.article_link==='reuse').map(r=>({date:r.date,article_id:r.article_id})),
    combined_gospel_dependency:{candidate_sha256:'fb4ed9f299fce8c8ee411815c5c2c68884c68e0c9468c4437c3c044f82a5ae1c',dates:31,readings:33,window:['2026-10-06','2026-11-05'],status:'PINNED_OPERATIONS_IN_COMBINED_MANIFEST_WITH_SOURCE_SPECIFIC_SHARED_GATE'},
    gates:['Exact combined editorial review/approval of new metadata and source observations','Assemble and rebind changed calendar/saints/catalog/browser in one combined release; preserve all104 article objects','Native exact generation acceptance; separately authorized signing/publication and fresh public baseline CAS'],
    scope_limitations:['Source-recorded annual commemoration is not a complete saints list','Historical source reviews reused; no fresh website, licensing or clergy assertion','No standalone A/B or Gospel publication; this is one pending component of the requested combined release']};
  const gospelSource={id:PRAVOSLAVNO_SOURCE_ID,url:PRAVOSLAVNO_SOURCE_URL,title:PRAVOSLAVNO_SOURCE_TITLE,
    publisher:'Pravoslavno.rs / Pravoslavni podsetnik; © Mikro knjiga',evidence_path:'drafts/pravoslavno-gospel-2026-10-06/review/candidate.json',
    evidence_sha256:'fb4ed9f299fce8c8ee411815c5c2c68884c68e0c9468c4437c3c044f82a5ae1c',evidence_path_base:'canonical_repository',
    scope:'Dated publisher Gospel reference observations only; no translated prose, independent SPC endorsement, complete service schedule or licence claim.'};
  assert.ok(!calendar.sources.some(s=>s.id===gospelSource.id));
  const gospelOperations=base.gospel.rows.map(r=>{
    assert.equal(r.state,'SOURCE_REFERENCE_VALIDATED_PENDING_REVIEW'); assert.deepEqual(r.errors,[]);
    assert.deepEqual(calendar.days.find(d=>d.date===r.date).gospel,r.before_gospel);
    assert.ok(r.source_readings.every(reading=>pravoslavnoCalendarLabelMatches(reading,[gospelSource])));
    assert.equal(r.proposed_gospel.production_eligible,false);assert.equal(r.proposed_gospel.complete_service_schedule_verified,false);
    return {date:r.date,operation:'RECORD_PUBLISHER_REFERENCES_PENDING_REVIEW',before_sha256:sha256(json(r.before_gospel)),after:r.proposed_gospel,
      dated_source_evidence:r.source,reading_provenance:r.reading_provenance};
  });
  const combined={schema_version:'svetlost33-combined-calendar-operation-manifest-1',status:'PENDING_UNSIGNED_ONE_RELEASE_REVIEW_MANIFEST_NOT_TRANSPORT',
    base:{release_set_id:S13,index_sha256:delta.base_index_sha256,public_readback_sha256:'e6bce373760da88996bf2df0a789ff853eef483e12a9d393608106d149f9c700'},
    intent:'One combined calendar/saints A+B through19November + unchanged published year-end104 articles through31December + currently verified Pravoslavno Gospel references. No separate Gospel publication.',
    catalog_component:record('catalog.pending.json',catalogBytes),browser_component:record('browser.pending.json',browserBytes),
    saints:{articles:104,changed_article_objects:0,sha256:sha256(base.modules['saints-v1'].bytes),article_objects_sha256:sha256(json(saints.articles))},
    gospel:{source_to_register:gospelSource,operations:gospelOperations,dates:31,readings:33,first_date:'2026-10-06',last_date:'2026-11-05',
      complete_service_schedule_verified:false,source_selection:'Prema Pravoslavno.rs; not radio or official SPC verification',source_translation_or_commentary_imported:false,
      unknown_after_last_date:calendar.days.filter(d=>d.date>'2026-11-05').map(d=>({date:d.date,status:d.gospel.status,reading_count:d.gospel.readings.length,unchanged:true})),
      followup:{date:'2026-10-26',time:'09:00',timezone:'Europe/Belgrade',automation_owned_by_root:true}},
    release_assembly_remaining:{production_eligible:false,exact_revision_approval:null,release_id:null,sequence:null,
      operations:['After exact editorial approval apply the31 pinned Gospel operations to a copy of S13 annual; retain all other day fields and unknowns',
        'Allocate final version/revision only in separately authorized release assembly; update saints calendar_binding only, retain104 article objects',
        'Rebind catalog calendar/saints and browser catalog to FINAL approved bytes; pending component hashes are NOT final release hashes',
        'Regenerate changed manifests/dependencies; retain library, cycles, organizations unchanged; authenticate/native-test the exact whole generation before publication'],
      signing_performed:false,published:false,native_run:false},gates:delta.gates};
  const files=new Map([['catalog.pending.json',catalogBytes],['browser.pending.json',browserBytes],['inventory.json',json({status:'PENDING_METADATA_REVIEW',rows:inventory})],['delta.json',json(delta)],
    ['combined-operation-manifest.json',json(combined)],
    ['source-provenance.json',json({protected_inputs:base.inputPins,prior_a_review:reviewPath,source_policy:'Original checked dates/author/publisher preserved; recorded_elsewhere references historical records, not licensing the source pages.',published_s13_verified_by_prior_readback:true,new_fetch_or_rsa_run:false})],
    ['unchanged-modules.json',json({status:'BASE_S13_MODULES_RETAINED_AT_THIS_COMPONENT_CHECKPOINT',modules:base.set.modules,saints_article_objects_sha256:sha256(json(saints.articles)),calendar_sha256:sha256(base.modules['calendar-2026-r1'].bytes),saints_sha256:sha256(base.modules['saints-v1'].bytes)})]]);
  return {base,calendar,saints,previous,beforeBrowser,catalog,browser,inventory,delta,combined,files};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2),['--write']); const p=await prepare();
  await writeNewTree(resolve(HERE,'ab-component'),p.files);
  console.log(JSON.stringify({status:p.delta.status,counts:p.delta.after,additions:p.delta.additions}));
}

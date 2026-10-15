#!/usr/bin/env node
// One bounded Node reference check set. Synthetic trust/review lives in memory only.
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepare, HERE, ROOT, PROFILE, BASE_ID, BASE_INDEX_HASH, hash, json } from './prepare.mjs';
import { CATALOG_MODULE, catalogDependencies, parseCatalogPayload, evaluateCatalog, resolveCatalogDay, searchCatalog } from '../../scripts/validate-liturgical-catalog-v1.mjs';
import { CALENDAR_BROWSER_MODULE, parseCalendarBrowserPayload, evaluateCalendarBrowser, upcomingBrowserFeasts } from '../../scripts/validate-calendar-browser-v1.mjs';

assert.ok(process.argv.length === 3 && ['--check', '--write-evidence'].includes(process.argv[2]), 'Usage: verify.mjs --check | --write-evidence');
const p = await prepare(), checks = [];
const check = async (name, fn) => { await fn(); checks.push({ name, result: 'PASS' }); };
const aRows = p.inventory.filter(r => r.package === 'A');
const generation = { id: 'ks01-test-only-never-a-release', sequence: 1, decision_sha256: hash(Buffer.from('synthetic-ks01-test-context')) };
function contextFor(catalog) {
  return { generation, contentAuthenticated: true,
    moduleContext: { ...CATALOG_MODULE, version: catalog.version, revision: catalog.revision, dependencies: catalogDependencies(catalog), generation },
    calendarContexts: catalog.calendar_bindings.map(b => ({ ...b, generation, authenticated: true, days: p.calendar.days })),
    articleContexts: catalog.article_bindings.map(b => ({ ...b, generation, authenticated: true, review_status: p.saints.review_status,
      calendar_binding: p.saints.calendar_binding, articles: p.saints.articles.map(({id,type}) => ({id,type})) })),
  };
}
const simulation = structuredClone(p.catalog);
simulation.review_status = 'approved'; simulation.approval_id = 'test-only-not-owner-approval';
for (const key of ['subjects', 'observances', 'occurrences', 'article_links']) for (const item of simulation[key]) if (item.review_status === 'pending') item.review_status = 'reviewed';
const context = contextFor(simulation);
const search = (catalog, host, query, locale = 'sr-Cyrl', year = 2026) => searchCatalog(catalog, host, { query, locale, year, calendar_profile_id: PROFILE });

await check('All seven exported files reproduce byte for byte from the one master', async () => {
  for (const [path, expected] of p.files) assert.deepEqual(await readFile(resolve(HERE,path)), expected, path);
});
await check('Pinned approved 62-article source, exact 42 day joins and bounded A/B ordering', () => {
  assert.equal(p.inventory.length, 42); assert.equal(aRows.length, 23);
  assert.equal(p.inventory.filter(r => r.package === 'B').length, 19);
  assert.equal(p.inventory[0].date, '2026-10-09'); assert.equal(aRows.at(-1).date, '2026-10-31'); assert.equal(p.inventory.at(-1).date, '2026-11-19');
  assert.equal(p.base.modules['saints-v1'].bytes.length, 211965); assert.equal(p.saints.articles.length, 62);
  assert.ok(p.inventory.filter(r=>r.package==='B').every(r=>r.candidate_status==='INVENTORIED_AWAITING_PACKAGE_A_REVIEW'));
  assert.ok(p.delta.records.occurrences.every(o=>o.date>='2026-10-09'&&o.date<='2026-10-31'));
});
await check('Independent expected counts, array/raw byte limits and exact browser binding', () => {
  assert.deepEqual(p.delta.additions, { sources: 28, subjects: 20, observances: 21, occurrences: 21, article_links: 22 });
  assert.deepEqual(p.delta.after, { sources: 48, subjects: 38, observances: 55, occurrences: 53, article_links: 33 });
  assert.equal(parseCatalogPayload(p.files.get('package-a.catalog.pending.json')).valid, true);
  assert.equal(parseCalendarBrowserPayload(p.files.get('package-a.browser.pending.json')).valid, true);
  assert.equal(p.browser.catalog_binding.sha256, hash(p.files.get('package-a.catalog.pending.json')));
  assert.equal(p.browser.catalog_binding.version, p.catalog.version); assert.equal(p.browser.catalog_binding.revision, p.catalog.revision);
  assert.ok(p.files.get('package-a.catalog.pending.json').length < 524288);
  assert.ok(p.files.get('package-a.browser.pending.json').length < 1048576);
});
await check('All previous entities/links/sources, annual/article bindings, slava map and 2027 stay identical', () => {
  for (const key of ['sources','subjects','observances','occurrences','article_links']) assert.deepEqual(p.catalog[key].slice(0,p.previous[key].length),p.previous[key]);
  const edited = new Set(['version','revision','review_status','approval_id','sources','subjects','observances','occurrences','article_links','coverage']);
  for (const key of Object.keys(p.previous)) if (!edited.has(key)) assert.deepEqual(p.catalog[key], p.previous[key]);
  assert.deepEqual(p.catalog.coverage.filter(c=>c.year!==2026),p.previous.coverage.filter(c=>c.year!==2026));
  for (const key of ['feast_memberships','archive_start_date','archive_bindings','archive_days']) assert.deepEqual(p.browser[key],p.beforeBrowser[key]);
  assert.equal(p.catalog.occurrences.filter(o=>o.date==='2026-10-12').length,1);
  assert.equal(p.catalog.occurrences.filter(o=>o.date==='2026-10-27').length,1);
  assert.equal(p.catalog.occurrences.filter(o=>o.date==='2026-11-08').length,1);
  assert.equal(p.catalog.article_links.filter(l=>l.article_id==='paraskeva-epivates').length,1);
  assert.equal(p.catalog.article_links.filter(l=>l.article_id==='demetrius-thessalonica').length,1);
});
await check('Historical source dates/attribution stay exact; every new alias is explicitly evidenced', () => {
  for (const source of p.delta.records.sources) {
    const old=p.saints.sources.find(s=>s.id===source.id); assert.ok(old);
    assert.equal(source.checked_on,old.reviewed_on); assert.notEqual(source.checked_on,'2026-10-06');
    for(const key of ['title','url','publisher','original_author']) assert.equal(source[key],old[key]);
  }
  assert.deepEqual(p.delta.alias_additions.map(a=>a.text),['Томиндан','Tomindan','Срђевдан','Srđevdan']);
  for(const alias of p.delta.alias_additions){const row=aRows.find(r=>r.observance_id===alias.observance_id);assert.ok(row.calendar_title[alias.locale].includes(alias.text));}
  assert.equal(p.delta.new_web_review,false); assert.equal(p.delta.source_checked_dates_advanced,false);
});
await check('Candidate/null approval and every newly proposed metadata row remain fail closed', () => {
  assert.equal(p.catalog.review_status,'pending'); assert.equal(p.catalog.approval_id,null);
  assert.equal(p.browser.review_status,'pending'); assert.equal(p.browser.approval_id,null);
  assert.equal(evaluateCatalog(p.catalog,context).reason,'unapproved');
  assert.equal(evaluateCalendarBrowser(p.browser,{}).reason,'unapproved');
  for(const key of ['subjects','observances','occurrences','article_links']) assert.ok(p.delta.records[key].every(r=>r.review_status==='pending'));
  const topOnly=structuredClone(p.catalog); topOnly.review_status='approved';topOnly.approval_id='test-only-no-row-approval';
  assert.equal(search(topOnly,context,'Јован Богослов').results.length,0);
  assert.deepEqual(search(topOnly,context,'Михољдан').results.find(r=>r.observance_id==='obs-cyriacus-miholjdan').article_ids,[]);
});
await check('All 23 dates resolve exactly and each old article is found in both scripts in memory-only reviewed simulation', () => {
  assert.deepEqual(evaluateCatalog(simulation,context),{eligible:true,reason:null});
  for(const row of aRows){
    const day=resolveCatalogDay(simulation,context,{date:row.date,calendar_profile_id:PROFILE});
    assert.equal(day.state,'source_recorded');assert.deepEqual(day.occurrence_ids,[row.occurrence_id]);
    const obs=simulation.observances.find(o=>o.id===row.observance_id);
    for(const locale of ['sr-Cyrl','sr-Latn']){const match=search(simulation,context,obs.name[locale],locale).results.find(r=>r.observance_id===row.observance_id);assert.ok(match);assert.deepEqual(match.dates,[row.date]);assert.deepEqual(match.article_ids,[row.article_id]);}
  }
});
await check('Identity distinctions, intact groups, exact popular aliases and article/image-independent search', () => {
  assert.equal(simulation.observances.find(o=>o.id==='obs-john-theologian-repose').subject_ids[0],'saint-john-theologian');
  assert.notEqual('saint-john-theologian','saint-john-baptist');
  assert.deepEqual(simulation.observances.find(o=>o.id==='obs-protection-theotokos').subject_ids,[]);
  assert.equal(p.delta.records.subjects.filter(s=>s.type==='group').length,6);
  for(const [query,id] of [['Јаков Алфејев','obs-james-alphaeus'],['Filip','obs-philip-deacon-seventy'],['Srđevdan','obs-sergius-bacchus'],['Srdjevdan','obs-sergius-bacchus'],['Томиндан','obs-apostle-thomas'],['Калистрат','obs-callistratus-companions']]){
    const result=search(simulation,{...context,articleContexts:[]},query);const match=result.results.find(r=>r.observance_id===id);assert.ok(match);assert.equal(match.date_state,'source_recorded');assert.deepEqual(match.article_ids,[]);
  }
  for(const row of aRows){const match=search(simulation,context,simulation.observances.find(o=>o.id===row.observance_id).name['sr-Cyrl'],'sr-Cyrl',2027).results.find(r=>r.observance_id===row.observance_id);assert.ok(match);assert.equal(match.date_state,'unavailable');assert.deepEqual(match.dates,[]);assert.deepEqual(match.occurrence_ids,[]);}
});
await check('Wrong source day, pending date, pending article and stale generation are rejected or suppressed', () => {
  const wrong=structuredClone(simulation);wrong.occurrences.find(o=>o.date==='2026-10-09').julian_date='2026-09-27';assert.equal(evaluateCatalog(wrong,context).reason,'calendar_day_mismatch');
  const pending=structuredClone(simulation);pending.occurrences.find(o=>o.date==='2026-10-09').review_status='pending';assert.deepEqual(search(pending,context,'Јован Богослов').results.find(r=>r.observance_id==='obs-john-theologian-repose').dates,[]);
  const pendingLink=structuredClone(simulation);pendingLink.article_links.find(l=>l.article_id==='john-theologian-repose').review_status='pending';assert.deepEqual(search(pendingLink,context,'Јован Богослов').results.find(r=>r.observance_id==='obs-john-theologian-repose').article_ids,[]);
  const badContext=structuredClone(context);badContext.articleContexts[0].generation={...generation,sequence:2};assert.equal(evaluateCatalog(simulation,badContext).reason,'generation_mismatch');
  assert.equal(evaluateCatalog(simulation,{...context,contentAuthenticated:false}).reason,'content_not_authenticated');
  const mismatch=structuredClone(context);mismatch.articleContexts[0].sha256='0'.repeat(64);assert.deepEqual(search(simulation,mismatch,'Јован Богослов').results.find(r=>r.observance_id==='obs-john-theologian-repose').article_ids,[]);
});
await check('Browser simulation uses exact newly serialized reviewed catalog hash; stale binding cannot expose feasts', () => {
  const browser=structuredClone(p.browser);browser.review_status='approved';browser.approval_id='test-only-never-owner-approval';
  browser.catalog_binding.sha256=hash(json(simulation));
  const browserContext={generation,contentAuthenticated:true,moduleContext:{...CALENDAR_BROWSER_MODULE,version:browser.version,revision:browser.revision,dependencies:[],generation},archiveContexts:[],
    catalogContext:{...browser.catalog_binding,authenticated:true,generation,payload:simulation,context}};
  const args={from_date:'2026-10-08',locale:'sr-Cyrl'};
  const result=upcomingBrowserFeasts(browser,browserContext,args);assert.equal(result.state,'matches');
  assert.ok(result.items.some(i=>i.observance_id==='obs-paraskeva'));
  assert.ok(!result.items.some(i=>i.observance_id==='obs-protection-theotokos'));
  browser.catalog_binding.sha256=p.browser.catalog_binding.sha256;assert.equal(upcomingBrowserFeasts(browser,browserContext,args).state,'unavailable');
});
await check('Duplicate observance/occurrence/link proposals and malformed local binding fail structural validation', () => {
  for(const key of ['observances','occurrences','article_links']){const bad=structuredClone(p.catalog);bad[key].push(structuredClone(bad[key].at(-1)));assert.equal(parseCatalogPayload(json(bad)).valid,false);}
  const badBrowser=structuredClone(p.browser);badBrowser.catalog_binding.sha256='invalid';assert.equal(parseCalendarBrowserPayload(json(badBrowser)).valid,false);
});
await check('All hash-bound source files, current local discovery and original raw articles/calendar remain unchanged after checks', async () => {
  for(const input of p.base.inputs){const raw=await readFile(resolve(ROOT,input.path));assert.equal(raw.length,input.bytes);assert.equal(hash(raw),input.sha256);}
});

const verification = { schema_version:'svetlost33-ks01-reference-verification-1',status:'PASS_EDITORIAL_REFERENCE_ONLY',
  command:'node drafts/calendar-saints-expansion-2026-10-06/verify.mjs --write-evidence',node_version:process.version,
  checks,assertion_groups:checks.length,test_context:'TEST_ONLY_SYNTHETIC_TRUST_AND_REVIEW_NOT_OWNER_APPROVAL',
  native_acceptance:false,signature_verification:false,publication:false,
  candidate_bytes:p.files.get('package-a.catalog.pending.json').length,browser_bytes:p.files.get('package-a.browser.pending.json').length,
  artifact_sha256:Object.fromEntries([...p.files].map(([path,bytes])=>[path,hash(bytes)])) };
const verificationBytes=json(verification);
const toolFiles=['master.mjs','prepare.mjs','verify.mjs'];
const tooling=Object.fromEntries(await Promise.all(toolFiles.map(async path=>[path,hash(await readFile(resolve(HERE,path)))])));
const handoff={id:'ks01-calendar-saints-package-a-2026-10-06',prepared_on:'2026-10-06',status:'PACKAGE_A_PREPARED_PENDING_REVIEW_NOT_PUBLISHED',
  base:{release_set_id:BASE_ID,local_index_sha256:BASE_INDEX_HASH,public_confirmation:p.publicBaseline},
  scope:{package_a:['2026-10-09','2026-10-31'],package_b:'42-row inventory includes November 1–19; candidate deferred until package A accepted',new_articles:0},
  additions:p.delta.additions,after:p.delta.after,capacity:p.delta.capacity,
  approval_id:null,new_metadata_review_status:'pending',native_acceptance:false,production_signing:false,publication:false,
  artifacts:{...verification.artifact_sha256,'verification.json':hash(verificationBytes),...tooling},
  validation:{command:verification.command,result:verification.status,assertion_groups:checks.length},
  remaining_gates:p.delta.open_gates,
  source_limitations:['No fresh source web review; inherited source dates retained exactly.','No new source snapshot hashes or rights/clerical clearance.',
    'November prior URL-unavailability limitation preserved; exact approved annual bytes are date authority.',
    'Any approved promotion changes catalog bytes and requires newly computed browser binding, manifests and native checks.'],
  preserved:['All 62 raw approved articles','Annual calendar and fasting/Gospel decisions','Existing S12 records and legacy slava mapping',
    'Calendar-browser memberships and complete historical archive','2027 unavailable state','Production index/manifests/signatures and unrelated dirty files']};
if(process.argv[2]==='--write-evidence'){
  for(const path of ['verification.json','handoff.json']){let exists=true;try{await access(resolve(HERE,path));}catch(e){if(e.code==='ENOENT')exists=false;else throw e;}assert.equal(exists,false,`Refusing overwrite: ${path}`);}
  await writeFile(resolve(HERE,'verification.json'),verificationBytes,{flag:'wx'});
  await writeFile(resolve(HERE,'handoff.json'),json(handoff),{flag:'wx'});
}
console.log(JSON.stringify({status:verification.status,assertion_groups:checks.length,checks:checks.map(c=>c.name),
  artifacts:handoff.artifacts,handoff_sha256:hash(json(handoff))},null,2));

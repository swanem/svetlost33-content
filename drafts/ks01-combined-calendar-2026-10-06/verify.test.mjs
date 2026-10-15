import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { prepare,HERE,PROFILE } from './prepare.mjs';
import { json,sha256 } from '../../scripts/prepare-charity-release-v2.mjs';
import { KS01_CAPACITY_PROFILE as profile } from '../../scripts/validate-ks01-capacity.mjs';
import { CATALOG_MODULE } from '../../scripts/validate-liturgical-catalog-v1.mjs';
import { CALENDAR_BROWSER_MODULE } from '../../scripts/validate-calendar-browser-v1.mjs';
import { PRAVOSLAVNO_SOURCE_ID,parsePravoslavnoHeading,pravoslavnoCalendarLabelMatches } from '../../scripts/pravoslavno-calendar-reference.mjs';
import { validateBibleCandidate,legacyCalendarLabelMatches } from '../../scripts/validate-bible-reference-v1.mjs';

const p=await prepare(),source=p.combined.gospel.source_to_register;
const generation={id:'combined-draft-memory-only-not-authenticated-release',sequence:1,decision_sha256:sha256(Buffer.from('test-only'))};
const approved=structuredClone(p.catalog);Object.assign(approved,{review_status:'approved',approval_id:'test-only-not-owner-approval'});
for(const key of ['subjects','observances','occurrences','article_links'])for(const row of approved[key])if(row.review_status==='pending')row.review_status='reviewed';
const context={generation,contentAuthenticated:true,moduleContext:{...CATALOG_MODULE,version:approved.version,revision:approved.revision,generation,dependencies:profile.catalog.catalogDependencies(approved)},
  calendarContexts:approved.calendar_bindings.map(b=>({...b,generation,authenticated:true,days:p.calendar.days})),
  articleContexts:approved.article_bindings.map(b=>({...b,generation,authenticated:true,review_status:p.saints.review_status,calendar_binding:p.saints.calendar_binding,articles:p.saints.articles.map(({id,type})=>({id,type}))}))};
const search=(payload,ctx,query,locale='sr-Cyrl',year=2026)=>profile.catalog.searchCatalog(payload,ctx,{query,locale,year,calendar_profile_id:PROFILE});
const simulatedCalendar=structuredClone(p.calendar);simulatedCalendar.sources.push(source);
for(const op of p.combined.gospel.operations)simulatedCalendar.days.find(d=>d.date===op.date).gospel=structuredClone(op.after);
function bibleInput(locale,calendar=simulatedCalendar){
  const entry=p.base.set.modules.find(m=>m.module_id==='library-annual-2026-r1'),root=dirname(entry.manifest_path);
  const read=name=>JSON.parse(p.base.graph.get(`${root}/data/${name}.${locale}.json`));
  return {locale,generationId:generation.id,psalms:read('psalms'),gospels:read('gospels'),calendar};
}

test('Deterministic frozen inputs/public63-file readback and reviewable outputs',async()=>{
  assert.equal(p.base.graph.size,63);assert.equal(p.base.set.sequence,13);
  assert.equal(p.inventory.length,42);assert.equal(p.inventory.filter(r=>r.package==='A').length,23);assert.equal(p.inventory.filter(r=>r.package==='B').length,19);
  for(const [path,bytes]of p.files)assert.deepEqual(await readFile(resolve(HERE,'ab-component',path)),bytes,path);
  const again=await prepare();for(const [path,bytes]of p.files)assert.deepEqual(again.files.get(path),bytes);
});
test('Exact A rebase/B counts and pending shapes; no approved flag fabrication',()=>{
  assert.deepEqual(p.delta.additions,{sources:47,subjects:37,observances:39,occurrences:39,article_links:40});
  assert.deepEqual(p.delta.packages.B,{sources:19,subjects:17,observances:18,occurrences:18,article_links:18});
  assert.deepEqual(p.delta.after,{sources:112,subjects:93,observances:112,occurrences:110,article_links:93});
  assert.equal(profile.catalog.parseCatalogPayload(p.files.get('catalog.pending.json')).valid,true);
  assert.equal(profile.browser.parseCalendarBrowserPayload(p.files.get('browser.pending.json')).valid,true);
  assert.equal(profile.catalog.evaluateCatalog(p.catalog,context).reason,'unapproved');
  assert.equal(profile.browser.evaluateCalendarBrowser(p.browser,{}).reason,'unapproved');
  assert.equal(p.catalog.approval_id,null);assert.equal(p.browser.approval_id,null);
  for(const key of ['subjects','observances','occurrences','article_links'])assert.ok(p.delta.records[key].every(r=>r.review_status==='pending'));
});
test('All104 article objects, year-end links, old catalog rows, settings, archive and unavailable2027 unchanged',()=>{
  assert.equal(p.saints.articles.length,104);assert.equal(sha256(p.base.modules['saints-v1'].bytes),'35d9401dd895557de013e42ce71d8101a11b5e96e42212a3605951181c002047');
  for(const key of ['sources','subjects','observances','occurrences','article_links'])assert.deepEqual(p.catalog[key].slice(0,p.previous[key].length),p.previous[key]);
  for(const key of ['legacy_slava_links','calendar_bindings','article_bindings'])assert.deepEqual(p.catalog[key],p.previous[key]);
  assert.deepEqual(p.catalog.coverage.filter(c=>c.year!==2026),p.previous.coverage.filter(c=>c.year!==2026));
  for(const key of ['feast_memberships','archive_bindings','archive_days'])assert.deepEqual(p.browser[key],p.beforeBrowser[key]);
  assert.equal(p.files.has('saints-v1.json'),false);assert.equal(p.files.has('calendar.2026.json'),false);
  for(const date of ['2026-10-12','2026-10-27','2026-11-08'])assert.equal(p.catalog.occurrences.filter(o=>o.date===date).length,1);
});
test('All42 dates/articles resolve both scripts in memory-only reviewed simulation; groups and namesakes preserved',()=>{
  assert.deepEqual(profile.catalog.evaluateCatalog(approved,context),{eligible:true,reason:null});
  for(const row of p.inventory){
    assert.deepEqual(profile.catalog.resolveCatalogDay(approved,context,{date:row.date,calendar_profile_id:PROFILE}).occurrence_ids,[row.occurrence_id]);
    const obs=approved.observances.find(o=>o.id===row.observance_id);
    for(const locale of ['sr-Cyrl','sr-Latn'])assert.deepEqual(search(approved,context,obs.name[locale],locale).results.find(r=>r.observance_id===obs.id).article_ids,[row.article_id]);
    if(row.article_type==='group')assert.equal(approved.subjects.find(s=>s.id===row.subject_id).type,'group');
  }
  assert.equal(p.inventory.filter(r=>r.package==='B'&&r.article_type==='group').length,8);
  assert.notEqual(p.inventory.find(r=>r.article_id==='james-alphaeus').subject_id,p.inventory.find(r=>r.article_id==='james-brother-lord').subject_id);
  const george=approved.observances.find(o=>o.id==='obs-george-lydda-dedication');assert.equal(george.kind,'event');assert.deepEqual(george.subject_ids,['saint-george']);
  assert.deepEqual(approved.subjects.find(s=>s.id==='saint-george'),p.previous.subjects.find(s=>s.id==='saint-george'));
  assert.deepEqual(p.inventory.filter(r=>r.operations.article_link==='reuse').map(r=>r.date),['2026-10-27','2026-11-08']);
});
test('Source dates exact, eight alias strings exact calendar evidence, annual-day and binding negatives',()=>{
  for(const source of p.delta.records.sources){const old=p.saints.sources.find(s=>s.id===source.id);assert.equal(source.checked_on,old.reviewed_on);assert.equal(source.url,old.url);}
  const aliases=p.delta.records.observances.flatMap(o=>o.aliases);assert.equal(aliases.length,8);
  for(const row of p.inventory)for(const a of row.aliases)assert.ok(row.calendar_title[a.locale].includes(a.text));
  const wrong=structuredClone(approved);wrong.occurrences.find(o=>o.date==='2026-11-16').julian_date='2026-11-04';assert.equal(profile.catalog.evaluateCatalog(wrong,context).reason,'calendar_day_mismatch');
  const stale=structuredClone(context);stale.articleContexts[0].sha256='0'.repeat(64);assert.deepEqual(search(approved,stale,'Ђурђиц').results.find(r=>r.observance_id==='obs-george-lydda-dedication').article_ids,[]);
  const duplicate=structuredClone(approved);duplicate.article_links.push(duplicate.article_links.at(-1));assert.equal(profile.catalog.validateCatalogPayload(duplicate).valid,false);
  const pending=structuredClone(approved);pending.article_links.find(l=>l.article_id==='george-lydda-dedication').review_status='pending';assert.deepEqual(search(pending,context,'Ђурђиц').results.find(r=>r.observance_id==='obs-george-lydda-dedication').article_ids,[]);
});
test('Exact pending browser binding; stale approved simulation binding cannot expose feasts',()=>{
  assert.equal(p.browser.catalog_binding.sha256,sha256(p.files.get('catalog.pending.json')));
  const browser=structuredClone(p.browser);Object.assign(browser,{review_status:'approved',approval_id:'test-only'});browser.catalog_binding.sha256=sha256(json(approved));
  const ctx={generation,contentAuthenticated:true,moduleContext:{...CALENDAR_BROWSER_MODULE,version:browser.version,revision:browser.revision,dependencies:[],generation},archiveContexts:[],catalogContext:{...browser.catalog_binding,authenticated:true,generation,payload:approved,context}};
  const args={from_date:'2026-10-08',locale:'sr-Cyrl'};
  assert.equal(profile.browser.upcomingBrowserFeasts(browser,ctx,args).state,'matches');
  browser.catalog_binding.sha256=p.browser.catalog_binding.sha256;assert.equal(profile.browser.upcomingBrowserFeasts(browser,ctx,args).state,'unavailable');
});
test('All33 original source labels match registered source; entire ordered multi-zachalo/discontiguous readings intact',()=>{
  const readings=p.combined.gospel.operations.flatMap(o=>o.after.readings);assert.equal(readings.length,33);
  for(const r of readings){assert.equal(pravoslavnoCalendarLabelMatches(r,[source]),true);assert.equal(legacyCalendarLabelMatches(r),false);}
  const oct14=p.combined.gospel.operations.find(o=>o.date==='2026-10-14').after.readings;
  assert.equal(oct14.length,2);assert.deepEqual(oct14[1].zachalo_numbers,[54,58]);assert.equal(oct14[1].zachalo,54);
  assert.deepEqual(oct14[0].segments,[{start:{chapter:1,verse:39},end:{chapter:1,verse:49}},{start:{chapter:1,verse:56},end:{chapter:1,verse:56}}]);
  assert.deepEqual(oct14[1].segments,[{start:{chapter:10,verse:38},end:{chapter:10,verse:42}},{start:{chapter:11,verse:27},end:{chapter:11,verse:28}}]);
});
test('Strict grammar and exact source registration/book/all ranges/full list/scalar/service negatives',()=>{
  const r=p.combined.gospel.operations.find(o=>o.date==='2026-10-14').after.readings[1];
  for(const change of [x=>x.book='John',x=>x.segments.pop(),x=>x.segments.reverse(),x=>x.segments[1].end.verse++,x=>x.zachalo_numbers=[54],x=>x.zachalo_numbers=[58,54],x=>x.zachalo=58,x=>x.source_ids=['radio'],x=>x.source_ids.push('radio'),x=>x.service='liturgy',x=>x.role='radio_daily_proposal']){const bad=structuredClone(r);change(bad);assert.equal(pravoslavnoCalendarLabelMatches(bad,[source]),false);}
  for(const registry of [[],[source,source],[{...source,url:'https://example.org/'}],[{...source,title:'СПЦ'}]])assert.equal(pravoslavnoCalendarLabelMatches(r,registry),false);
  for(const label of ['',`${r.source_reference} appended`,r.source_reference.replace('54, 58','54, 54'),r.source_reference.replace('10,38-42','10,42-38'),r.source_reference.replace('11,27-28','10,40-41'),'Свето Јеванђеље од Луке, зачало 54 (38-42)',r.source_reference.replace('54','9007199254740992'),`${r.source_reference}\n`])assert.equal(parsePravoslavnoHeading(label),null,label);
});
test('Shared Bible gate validates all old+new readings against exact approved corpus in both scripts and fails corrupted input',()=>{
  for(const locale of ['sr-Cyrl','sr-Latn']){
    const baseline=validateBibleCandidate(bibleInput(locale,p.calendar));assert.equal(baseline.valid,true,JSON.stringify(baseline.errors));
    const candidate=validateBibleCandidate(bibleInput(locale));assert.equal(candidate.valid,true,JSON.stringify(candidate.errors));assert.equal(candidate.counts.calendar_readings,baseline.counts.calendar_readings+33);
  }
  const bad=structuredClone(simulatedCalendar),r=bad.days.find(d=>d.date==='2026-10-14').gospel.readings[1];r.zachalo_numbers=[54];
  assert.ok(validateBibleCandidate(bibleInput('sr-Cyrl',bad)).errors.some(e=>e.reason==='source_calendar_label_mismatch'));
  const missing=structuredClone(simulatedCalendar);missing.sources=missing.sources.filter(s=>s.id!==PRAVOSLAVNO_SOURCE_ID);assert.equal(validateBibleCandidate(bibleInput('sr-Cyrl',missing)).valid,false);
  const corpus=bibleInput('sr-Cyrl');const book=corpus.gospels.books.find(b=>b.id==='LUK'),chapter=book.chapters.find(c=>c.number===5);chapter.verses=chapter.verses.filter(v=>v.number!==13);assert.equal(validateBibleCandidate(corpus).valid,false);
  const legacy=p.calendar.days.flatMap(d=>d.gospel.readings)[0];assert.equal(legacyCalendarLabelMatches(legacy),true);assert.equal(legacyCalendarLabelMatches({...legacy,zachalo:legacy.zachalo+1}),false);
});
test('Single combined pending plan preserves old observations, unknown future dates and all non-Gospel annual fields',()=>{
  assert.equal(p.combined.gospel.operations.length,31);assert.equal(p.combined.gospel.last_date,'2026-11-05');assert.equal(p.combined.gospel.followup.date,'2026-10-26');
  for(const old of p.calendar.days){const next=simulatedCalendar.days.find(d=>d.date===old.date);for(const key of Object.keys(old))if(key!=='gospel')assert.deepEqual(next[key],old[key]);
    if(old.date<'2026-10-06'||old.date>'2026-11-05')assert.deepEqual(next.gospel,old.gospel);
  }
  for(const op of p.combined.gospel.operations){const old=p.calendar.days.find(d=>d.date===op.date).gospel;assert.equal(op.before_sha256,sha256(json(old)));assert.deepEqual(op.after.source_observations.slice(0,old.source_observations.length),old.source_observations);assert.equal(op.after.production_eligible,false);assert.equal(op.after.complete_service_schedule_verified,false);assert.equal(op.after.service_assignment_status,'UNRESOLVED');}
  assert.equal(p.combined.release_assembly_remaining.exact_revision_approval,null);assert.equal(p.combined.release_assembly_remaining.signing_performed,false);
});

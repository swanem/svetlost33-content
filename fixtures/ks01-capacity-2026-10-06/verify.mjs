#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { allData, datasetFiles, measurements, contexts, synthetic, json, hash, ROOT, HERE, OUT, WARNING, APPROVAL, writeNew } from './generate.mjs';
import { saints, catalog, browser, PROPOSAL, inputRecords, schemaChanges, saintsSchema, catalogSchema } from './reference-profile.mjs';
import { parseSaintsPayload as oldSaints } from '../../scripts/validate-saints-v1.mjs';
import { parseCatalogPayload as oldCatalog } from '../../scripts/validate-liturgical-catalog-v1.mjs';
import { parseCalendarBrowserPayload as oldBrowser } from '../../scripts/validate-calendar-browser-v1.mjs';

assert.ok(process.argv.length===3&&['--check','--write-evidence'].includes(process.argv[2]),'Usage: verify.mjs --check | --write-evidence');
const corpus=await allData(),data=[...corpus.datasets,corpus.packageA],large=corpus.datasets[2],checks=[];
const check=async(name,fn)=>{await fn();checks.push({name,status:'PASS'});};
const profile='spc-rs-ba-julian-v1';
function find(data,query,host=contexts(data).catalog){return catalog.searchCatalog(data.catalog,host,{query,locale:'sr-Cyrl',year:2026,calendar_profile_id:profile});}
function browserHost(data){const c=contexts(data);return {generation:c.generation,contentAuthenticated:true,moduleContext:c.browser_module,archiveContexts:[],catalogContext:{...c.browser_catalog,payload:data.catalog,context:c.catalog}};}

await check('All generated datasets and raw common calendar reproduce byte-for-byte with exact manifest hashes',async()=>{
  for(const d of data)for(const[path,bytes]of datasetFiles(d))assert.deepEqual(await readFile(resolve(OUT,path)),bytes,path);
  assert.deepEqual(await readFile(resolve(OUT,'common/calendar.2026.json')),corpus.base.raw.calendar);
  assert.deepEqual(JSON.parse(await readFile(resolve(OUT,'measurements.json'))).datasets,corpus.datasets.map(measurements));
});
await check('Baseline62 and frozen pendingA remain unchanged; testA promotions are only review flags, test approval and exact browser hash',async()=>{
  const base=corpus.datasets[0];for(const key of ['saints','catalog','browser'])assert.deepEqual(base.raw[key],corpus.base.raw[key]);
  const source=JSON.parse(await readFile(resolve(ROOT,'drafts/calendar-saints-expansion-2026-10-06/package-a.catalog.pending.json')));
  assert.equal(hash(await readFile(resolve(ROOT,'drafts/calendar-saints-expansion-2026-10-06/package-a.catalog.pending.json'))),'121387e5bb1d80ab76460e1aff92cdfa10d70590ba8e78db0c5717bc3e6674d4');
  assert.equal(hash(await readFile(resolve(ROOT,'drafts/calendar-saints-expansion-2026-10-06/package-a.browser.pending.json'))),'97a0dbbfa106e9c941f5fda076dd35f3aefd8e1c0bdb8df00e4800fc8717f763');
  const expected=structuredClone(source);expected.review_status='approved';expected.approval_id=APPROVAL;
  for(const key of ['subjects','observances','occurrences','article_links'])for(const item of expected[key])if(item.review_status==='pending')item.review_status='reviewed';
  assert.deepEqual(corpus.packageA.catalog,expected);assert.equal(oldCatalog(corpus.packageA.raw.catalog).valid,true);assert.equal(oldBrowser(corpus.packageA.raw.browser).valid,true);
  assert.equal(corpus.packageA.browser.catalog_binding.sha256,hash(corpus.packageA.raw.catalog));
});
await check('104/366 each preserve all62 original article objects and S12 catalog rows; 366 distinct subjects/sources/links really exist',()=>{
  for(const d of corpus.datasets.slice(1)){
    assert.deepEqual(d.saints.articles.slice(0,62),corpus.base.saints.articles);
    for(const key of ['sources','subjects','observances','occurrences','article_links'])assert.deepEqual(d.catalog[key].slice(0,corpus.base.catalog[key].length),corpus.base.catalog[key]);
    assert.deepEqual(d.raw.calendar,corpus.base.raw.calendar);
    for(const key of ['feast_memberships','archive_bindings','archive_days','archive_start_date'])assert.deepEqual(d.browser[key],corpus.base.browser[key]);
    assert.equal(d.catalog.article_links.filter(l=>l.observance_id.startsWith('test-observance-')).length,d.saints.articles.length);
    assert.equal(new Set(d.catalog.article_links.filter(l=>l.observance_id.startsWith('test-observance-')).map(l=>l.article_id)).size,d.saints.articles.length);
    assert.equal(d.catalog.subjects.filter(s=>s.id.startsWith('test-subject-')).length,d.saints.articles.length);
    assert.equal(d.catalog.sources.filter(s=>s.id.startsWith('test-identity-source-')).length,d.saints.articles.length);
    assert.ok(d.saints.days.every(day=>day.date.startsWith('2026-')&&day.article_ids.length<=8));
  }
  assert.deepEqual(measurements(large).catalog_counts,{sources:386,subjects:384,observances:400,occurrences:398,article_links:377,calendar_bindings:1,article_bindings:1});
});
await check('Historical parsers still accept real62/testA and reject unsupported104/366; cloned profile changes only locked count/byte limits',()=>{
  assert.equal(oldSaints(corpus.datasets[0].raw.saints).valid,true);assert.equal(oldCatalog(corpus.datasets[0].raw.catalog).valid,true);
  for(const d of corpus.datasets.slice(1))assert.equal(oldSaints(d.raw.saints).valid,false);
  assert.equal(oldCatalog(large.raw.catalog).valid,false);
  assert.deepEqual(schemaChanges.saints,[{path:'properties.articles.maxItems',before:64,after:366}]);
  assert.deepEqual(schemaChanges.catalog.map(c=>[c.path,c.before,c.after]),[['properties.sources.maxItems',256,512],['properties.subjects.maxItems',256,512],['properties.article_links.maxItems',256,512]]);
  assert.equal(PROPOSAL.saints.sources,512);assert.equal(PROPOSAL.saints.days,366);assert.equal(PROPOSAL.catalog.observances,512);
});
await check('Expanded profile accepts all four coherent same-generation payload sets and both scripts of all366 linked identities',()=>{
  for(const d of data){
    assert.equal(saints.parseSaintsPayload(d.raw.saints).valid,true);assert.equal(catalog.parseCatalogPayload(d.raw.catalog).valid,true);assert.equal(browser.parseCalendarBrowserPayload(d.raw.browser).valid,true);
    const host=contexts(d).catalog;assert.deepEqual(catalog.evaluateCatalog(d.catalog,host),{eligible:true,reason:null});
    assert.equal(browser.upcomingBrowserFeasts(d.browser,browserHost(d),{from_date:'2026-10-08',locale:'sr-Cyrl'}).state,'matches');
    for(const day of d.saints.days){const result=saints.evaluateSaintsDay(d.saints,{contentAuthenticated:true,moduleContext:contexts(d).saints_module,calendarAuthenticated:true,calendarContext:host.calendarContexts[0],date:day.date});assert.equal(result.eligible,true);}
  }
  const host=contexts(large).catalog;
  for(const link of large.catalog.article_links.filter(l=>l.observance_id.startsWith('test-observance-'))){
    const obs=large.catalog.observances.find(o=>o.id===link.observance_id);
    for(const locale of ['sr-Cyrl','sr-Latn']){const result=catalog.searchCatalog(large.catalog,host,{query:obs.name[locale],locale,year:2026,calendar_profile_id:profile});const hit=result.results.find(r=>r.observance_id===obs.id);assert.ok(hit);assert.deepEqual(hit.article_ids,[link.article_id]);assert.equal(hit.dates.length,1);}
  }
});
await check('Article count boundary366 succeeds and367 fails with valid remaining shape; unchanged saints source boundary512/513 holds',()=>{
  assert.equal(saints.parseSaintsPayload(large.raw.saints).valid,true);
  const plus=synthetic(corpus.base,367);assert.equal(saints.parseSaintsPayload(plus.raw.saints).valid,false);
  const s=structuredClone(large.saints);
  while(s.sources.length<512){const i=s.sources.length;s.sources.push({...s.sources.at(-1),id:`test-source-bound-${i}`});}
  assert.equal(saints.parseSaintsPayload(json(s)).valid,true);
  s.sources.push({...s.sources.at(-1),id:'test-source-bound-512'});assert.equal(saints.parseSaintsPayload(json(s)).valid,false);
});
await check('Each expanded catalog collection independently accepts512 and rejects513, with valid IDs/references and bytes below1MiB',()=>{
  for(const key of ['sources','subjects','article_links']){
    const c=structuredClone(large.catalog);
    if(key==='article_links'){
      const existing=new Set(c.article_links.filter(l=>l.observance_id==='obs-paraskeva').map(l=>l.article_id));
      for(const article of large.saints.articles.filter(a=>a.type==='saint'&&!existing.has(a.id))){if(c.article_links.length===513)break;c.article_links.push({observance_id:'obs-paraskeva',article_binding_id:c.article_bindings[0].id,article_id:article.id,source_ids:['eparhija-month-10'],review_status:'reviewed'});}
      assert.equal(c.article_links.length,513);const last=c.article_links.pop();assert.equal(catalog.parseCatalogPayload(json(c)).valid,true);c.article_links.push(last);
    }else{
      while(c[key].length<512){const i=c[key].length;c[key].push({...structuredClone(c[key].at(-1)),id:`test-${key}-boundary-${i}`});}
      assert.equal(catalog.parseCatalogPayload(json(c)).valid,true);
      c[key].push({...structuredClone(c[key].at(-1)),id:`test-${key}-boundary-512`});
    }
    assert.ok(json(c).length<1048576);assert.equal(catalog.parseCatalogPayload(json(c)).valid,false);
  }
});
await check('Raw UTF8 byte ceilings accept exact whitespace-padded limit and reject one extra byte before parsing',()=>{
  for(const [raw,limit,parse]of [[large.raw.saints,1572864,saints.parseSaintsPayload],[large.raw.catalog,1048576,catalog.parseCatalogPayload],[large.raw.browser,1048576,browser.parseCalendarBrowserPayload]]){
    const exact=Buffer.concat([raw,Buffer.alloc(limit-raw.length,0x20)]);assert.equal(exact.length,limit);assert.equal(parse(exact).valid,true);assert.equal(parse(Buffer.concat([exact,Buffer.from(' ')])).valid,false);
  }
});
await check('Closed shape, duplicate identities, both-script parity and dangling references remain enforced',()=>{
  const mutations=[['saints',s=>s.extra=true],['saints',s=>s.articles[0].content['sr-Latn'].title='wrong'],['saints',s=>s.articles[1].id=s.articles[0].id],['saints',s=>s.articles[0].source_ids=['missing-source']],
    ['catalog',c=>c.extra=true],['catalog',c=>c.subjects[1].id=c.subjects[0].id],['catalog',c=>c.observances[0].subject_ids=['missing-subject']]];
  for(const [kind,mutate]of mutations){const p=structuredClone(large[kind]);mutate(p);assert.equal((kind==='saints'?saints.parseSaintsPayload:catalog.parseCatalogPayload)(json(p)).valid,false);}
});
await check('Exact calendar, article, browser and generation binding failures remain unavailable; draft status never authenticates content',()=>{
  const host=contexts(large).catalog;
  const wrongDate=structuredClone(large.catalog);wrongDate.occurrences.at(-1).julian_date='2026-01-01';assert.equal(catalog.evaluateCatalog(wrongDate,host).reason,'calendar_day_mismatch');
  const wrongCalendar=structuredClone(host);wrongCalendar.calendarContexts[0].sha256='0'.repeat(64);assert.equal(catalog.evaluateCatalog(large.catalog,wrongCalendar).reason,'calendar_mismatch');
  const wrongArticle=structuredClone(host);wrongArticle.articleContexts[0].sha256='0'.repeat(64);assert.deepEqual(find(large,'САМО ТЕСТ 0001',wrongArticle).results[0].article_ids,[]);
  const wrongGeneration=structuredClone(host);wrongGeneration.articleContexts[0].generation={...host.generation,sequence:2};assert.equal(catalog.evaluateCatalog(large.catalog,wrongGeneration).reason,'generation_mismatch');
  const staleBrowser=structuredClone(large.browser);staleBrowser.catalog_binding.sha256=corpus.base.browser.catalog_binding.sha256;assert.equal(browser.upcomingBrowserFeasts(staleBrowser,browserHost(large),{from_date:'2026-10-08',locale:'sr-Cyrl'}).state,'unavailable');
  const draft=structuredClone(large.catalog);draft.review_status='pending';draft.approval_id=null;assert.equal(catalog.evaluateCatalog(draft,host).reason,'unapproved');assert.equal(catalog.evaluateCatalog(large.catalog,{...host,contentAuthenticated:false}).reason,'content_not_authenticated');
});
await check('PackageA test view resolves all23 exact dates and existing old article links without changing feast selection or archive',()=>{
  const d=corpus.packageA,host=contexts(d).catalog;
  for(const day of d.saints.days.filter(x=>x.date>='2026-10-09'&&x.date<='2026-10-31')){const result=catalog.resolveCatalogDay(d.catalog,host,{date:day.date,calendar_profile_id:profile});assert.equal(result.state,'source_recorded');const occurrence=d.catalog.occurrences.find(o=>o.id===result.occurrence_ids[0]);const obs=d.catalog.observances.find(o=>o.id===occurrence.observance_id);assert.deepEqual(find(d,obs.name['sr-Cyrl']).results.find(r=>r.observance_id===obs.id).article_ids,day.article_ids);}
  for(const key of ['feast_memberships','archive_bindings','archive_days'])assert.deepEqual(d.browser[key],corpus.base.browser[key]);
});
await check('All pinned production/draft/schema/validator inputs remain unchanged after fixture generation and reference tests',async()=>{
  for(const input of [...corpus.base.loaded.inputs,...inputRecords,...corpus.packageA.sources]){const raw=await readFile(resolve(ROOT,input.path));assert.equal(raw.length,input.bytes);assert.equal(hash(raw),input.sha256);}
});

const timing=[];
for(const d of corpus.datasets){const samples=[];for(let i=0;i<5;i++){const start=performance.now();assert.equal(saints.parseSaintsPayload(d.raw.saints).valid,true);assert.equal(catalog.parseCatalogPayload(d.raw.catalog).valid,true);assert.equal(browser.parseCalendarBrowserPayload(d.raw.browser).valid,true);samples.push(Number((performance.now()-start).toFixed(3)));}const sorted=[...samples].sort((a,b)=>a-b);timing.push({dataset:d.name,operation:'Node raw parse and structural validation of saints+catalog+browser only',samples_ms:samples,median_ms:sorted[2],max_of_five_ms:sorted[4]});}
const inputHashes=Object.fromEntries(await Promise.all(['generate.mjs','reference-profile.mjs','verify.mjs','README.md'].map(async p=>[p,hash(await readFile(resolve(HERE,p)))])));
const profileDocument={...PROPOSAL,warning:WARNING,schema_changes:schemaChanges,unchanged_reference_inputs:inputRecords,
  measured366:measurements(large),headroom:{saints_bytes:1572864-large.raw.saints.length,catalog_bytes:1048576-large.raw.catalog.length,
    saints_percent:Number(((1572864/large.raw.saints.length-1)*100).toFixed(2)),catalog_percent:Number(((1048576/large.raw.catalog.length-1)*100).toFixed(2))},
  release_gates:['Actual new up-to-104 approved content must be measured against these same limits before release; synthetic104 is not actual content.',
    'Native same-device timing/memory/projection/startup and offline preservation acceptance remain required.',
    'First compatible min_clients must be chosen and old-client whole-generation retention proven in native tests.'],
  unchanged_production_shapes:true,production_ready:false};
const report={schema_version:'svetlost33-ks01-capacity-test-receipt-1',status:'PASS_TEST_ONLY_REFERENCE_NOT_NATIVE_ACCEPTANCE',warning:WARNING,
  command:'node fixtures/ks01-capacity-2026-10-06/verify.mjs --write-evidence',node_version:process.version,platform:process.platform,architecture:process.arch,
  assertions:checks,assertion_groups:checks.length,node_measurements:{samples:timing,cold_native_measurement:false,peak_memory_measured:false,
    note:'Five in-process Node runs; excludes module compilation, projection, install, UI and native hardware. Not a device performance gate.'},
  source_hashes:inputHashes,fixture_manifests:Object.fromEntries(await Promise.all(data.map(async d=>[d.name,hash(await readFile(resolve(OUT,`${d.name}/manifest.json`)))]))),
  no_production_signature:true,no_native_change:true,actual104_content_supplied:false};
const outputs=new Map([['profile-proposal.json',json(profileDocument)],['saints.test-schema.json',json(saintsSchema)],['catalog.test-schema.json',json(catalogSchema)],['verification.json',json(report)]]);
const handoff={status:'TEST_ONLY_CORPUS_COMPLETE_SHARED_DECISION_INPUT',warning:WARNING,publication_authorized:false,actual104_content_supplied:false,
  datasets:corpus.datasets.map(measurements),package_a_test_view_manifest_sha256:report.fixture_manifests['package-a-test-view'],
  bounded_profile:PROPOSAL,tests:{assertion_groups:checks.length,status:report.status},
  outputs:Object.fromEntries([...outputs].map(([p,b])=>[p,{bytes:b.length,sha256:hash(b)}])),generator_hashes:inputHashes,
  next_gates:profileDocument.release_gates};
outputs.set('handoff.json',json(handoff));
if(process.argv[2]==='--write-evidence')await writeNew(outputs);
console.log(JSON.stringify({status:report.status,assertion_groups:checks.length,measurements:corpus.datasets.map(measurements),profile:PROPOSAL,
  outputs:Object.fromEntries([...outputs].map(([p,b])=>[p,{bytes:b.length,sha256:hash(b)}]))},null,2));

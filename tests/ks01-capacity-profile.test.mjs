import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KS01_CAPACITY_PROFILE as profile } from '../scripts/validate-ks01-capacity.mjs';
import * as historicalSaints from '../scripts/validate-saints-v1.mjs';
import * as historicalCatalog from '../scripts/validate-liturgical-catalog-v1.mjs';
import * as historicalBrowser from '../scripts/validate-calendar-browser-v1.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const FIXTURES=resolve(ROOT,'fixtures/ks01-capacity-2026-10-06/generated');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(`${JSON.stringify(value,null,2)}\n`);
const PROFILE='spc-rs-ba-julian-v1';
const pins={
  'baseline-62':'4dac3598d340d87d0690112e20b41b986f6039910c8efee0b6b835241dad1812',
  'package-a-test-view':'da31d9a3206f70836d9c207a13c27a2880de91fb47ba3c828b197703425b7b9b',
  'synthetic-104':'6606022609b65f1d6eab10b147b9c590448ff5926cbb29c595b397b4925d255d',
  'synthetic-366':'c043f0bf2ab9ec4045375e6d92af9f06907bdb30737142ece839e15f2e89e0a6',
};
const datasets={};
for(const[name,pin]of Object.entries(pins)){
  const manifestBytes=await readFile(resolve(FIXTURES,name,'manifest.json'));assert.equal(hash(manifestBytes),pin);
  const manifest=JSON.parse(manifestBytes),files={};
  for(const item of manifest.files){const raw=await readFile(resolve(FIXTURES,item.path));assert.equal(raw.length,item.bytes);assert.equal(hash(raw),item.sha256);files[item.path.slice(name.length+1)]=raw;}
  datasets[name]={name,manifest,raw:{saints:files['saints-v1.json'],catalog:files['liturgical-catalog-v1.json'],browser:files['calendar-browser-v1.json']},
    saints:JSON.parse(files['saints-v1.json']),catalog:JSON.parse(files['liturgical-catalog-v1.json']),browser:JSON.parse(files['calendar-browser-v1.json']),contexts:JSON.parse(files['contexts.json'])};
}
const baseline=datasets['baseline-62'],view=datasets['package-a-test-view'],large=datasets['synthetic-366'];
const search=(d,query,locale='sr-Cyrl',year=2026,host=d.contexts.catalog)=>profile.catalog.searchCatalog(d.catalog,host,{query,locale,year,calendar_profile_id:PROFILE});
const browserHost=d=>({generation:d.contexts.generation,contentAuthenticated:true,moduleContext:d.contexts.browser_module,archiveContexts:[],
  catalogContext:{...d.contexts.browser_catalog,payload:d.catalog,context:d.contexts.catalog}});

test('KS01 is explicit, fixed and immutable; all historical schema/validator/fixture pins remain exact',async()=>{
  assert.equal(profile.id,'ks01-capacity-366-r1');assert.equal(profile.decision_sha256,'5452b8728adad35a1fc300ec04967a3b70d3cac3a175b06136c9aff39b0c781b');
  assert.equal(profile.limits.saints.articles,366);assert.equal(profile.limits.saints.bytes,1572864);
  for(const key of ['sources','subjects','article_links'])assert.equal(profile.limits.catalog[key],512);assert.equal(profile.limits.catalog.bytes,1048576);
  assert.ok(Object.isFrozen(profile)&&Object.isFrozen(profile.saints)&&Object.isFrozen(profile.limits.saints));
  const receipt=await readFile(resolve(FIXTURES,'profile-proposal.json'));assert.equal(hash(receipt),'fb4469338db9d619eac763a42da588fbeae9dd8d6eb788a8c0e5d3fc0a5e69ea');
  for(const input of JSON.parse(receipt).unchanged_reference_inputs){const raw=await readFile(resolve(ROOT,input.path));assert.equal(raw.length,input.bytes);assert.equal(hash(raw),input.sha256);}
  assert.equal(hash(await readFile(resolve(FIXTURES,'handoff.json'))),'1e47b55ff442628eb0445ecbb0456d48b511ec449912b55a154d4ab9a12e0c33');
  assert.equal(hash(await readFile(resolve(ROOT,'drafts/calendar-saints-expansion-2026-10-06/package-a.catalog.pending.json'))),'121387e5bb1d80ab76460e1aff92cdfa10d70590ba8e78db0c5717bc3e6674d4');
  assert.equal(hash(await readFile(resolve(ROOT,'drafts/calendar-saints-expansion-2026-10-06/package-a.browser.pending.json'))),'97a0dbbfa106e9c941f5fda076dd35f3aefd8e1c0bdb8df00e4800fc8717f763');
});

test('62/A retain historical acceptance; 104/366 require explicit KS01, including browser catalog selection',()=>{
  for(const d of [baseline,view]){assert.equal(historicalSaints.parseSaintsPayload(d.raw.saints).valid,true);assert.equal(historicalCatalog.parseCatalogPayload(d.raw.catalog).valid,true);}
  for(const d of Object.values(datasets)){
    assert.equal(profile.saints.parseSaintsPayload(d.raw.saints).valid,true);assert.equal(profile.catalog.parseCatalogPayload(d.raw.catalog).valid,true);assert.equal(profile.browser.parseCalendarBrowserPayload(d.raw.browser).valid,true);
    assert.deepEqual(profile.catalog.evaluateCatalog(d.catalog,d.contexts.catalog),{eligible:true,reason:null});
    assert.equal(profile.browser.upcomingBrowserFeasts(d.browser,browserHost(d),{from_date:'2026-10-08',locale:'sr-Cyrl'}).state,'matches');
    assert.deepEqual(d.saints.articles.slice(0,62),baseline.saints.articles);
  }
  for(const name of ['synthetic-104','synthetic-366'])assert.equal(historicalSaints.parseSaintsPayload(datasets[name].raw.saints).valid,false);
  assert.equal(historicalCatalog.parseCatalogPayload(large.raw.catalog).valid,false);
  assert.equal(historicalBrowser.upcomingBrowserFeasts(large.browser,browserHost(large),{from_date:'2026-10-08',locale:'sr-Cyrl'}).state,'unavailable');
  assert.equal(profile.browser.parseCalendarBrowserPayload,historicalBrowser.parseCalendarBrowserPayload);
  assert.equal(profile.browser.resolveBrowserArchiveDay,historicalBrowser.resolveBrowserArchiveDay);
});

test('Historical saints64/65 and KS01366/367 boundaries remain independent',()=>{
  const old=structuredClone(datasets['synthetic-104'].saints);old.articles=old.articles.slice(0,64);
  const allowed=new Set(old.articles.map(a=>a.id));for(const day of old.days)day.article_ids=day.article_ids.filter(id=>allowed.has(id));
  const usedSources=new Set([...old.articles.flatMap(a=>a.source_ids),...old.days.flatMap(d=>d.calendar_source_ids)]);old.sources=old.sources.filter(s=>usedSources.has(s.id));
  assert.equal(historicalSaints.parseSaintsPayload(json(old)).valid,true);
  const article65=structuredClone(datasets['synthetic-104'].saints.articles[64]);old.articles.push(article65);
  for(const id of article65.source_ids)if(!old.sources.some(s=>s.id===id))old.sources.push(structuredClone(datasets['synthetic-104'].saints.sources.find(s=>s.id===id)));
  assert.ok(json(old).length<262144);assert.equal(profile.saints.parseSaintsPayload(json(old)).valid,true);assert.equal(historicalSaints.parseSaintsPayload(json(old)).valid,false);
  const extra=structuredClone(large.saints);extra.articles.push({...structuredClone(extra.articles.at(-1)),id:'test-only-article-0367'});
  assert.ok(json(extra).length<1572864);assert.equal(profile.saints.parseSaintsPayload(large.raw.saints).valid,true);assert.equal(profile.saints.parseSaintsPayload(json(extra)).valid,false);
});

test('Sources/subjects/article links each accept512 and reject513 without unrelated limit changes',()=>{
  const s=structuredClone(large.saints);while(s.sources.length<512)s.sources.push({...s.sources.at(-1),id:`test-source-${s.sources.length}`});
  assert.equal(profile.saints.parseSaintsPayload(json(s)).valid,true);s.sources.push({...s.sources.at(-1),id:'test-source-512'});assert.equal(profile.saints.parseSaintsPayload(json(s)).valid,false);
  for(const key of ['sources','subjects','article_links']){
    const c=structuredClone(large.catalog);
    if(key==='article_links'){
      const oldIds=new Set(c.article_links.filter(l=>l.observance_id==='obs-paraskeva').map(l=>l.article_id));
      for(const a of large.saints.articles.filter(a=>a.type==='saint'&&!oldIds.has(a.id))){if(c.article_links.length===513)break;c.article_links.push({observance_id:'obs-paraskeva',article_binding_id:c.article_bindings[0].id,article_id:a.id,source_ids:['eparhija-month-10'],review_status:'reviewed'});}
      assert.equal(c.article_links.length,513);const last=c.article_links.pop();assert.equal(profile.catalog.parseCatalogPayload(json(c)).valid,true);c.article_links.push(last);
    }else{
      while(c[key].length<512)c[key].push({...structuredClone(c[key].at(-1)),id:`test-${key}-${c[key].length}`});
      assert.equal(profile.catalog.parseCatalogPayload(json(c)).valid,true);c[key].push({...structuredClone(c[key].at(-1)),id:`test-${key}-512`});
    }
    assert.ok(json(c).length<1048576);assert.equal(profile.catalog.parseCatalogPayload(json(c)).valid,false);
  }
});

test('Raw byte ceilings precede decoding: exact limit succeeds, +1 byte/invalid UTF8/BOM fail',()=>{
  for(const[raw,limit,parse]of [[large.raw.saints,1572864,profile.saints.parseSaintsPayload],[large.raw.catalog,1048576,profile.catalog.parseCatalogPayload],[large.raw.browser,1048576,profile.browser.parseCalendarBrowserPayload]]){
    const exact=Buffer.concat([raw,Buffer.alloc(limit-raw.length,32)]);assert.equal(parse(exact).valid,true);assert.equal(parse(Buffer.concat([exact,Buffer.from(' ')])).valid,false);
    assert.equal(parse(Buffer.concat([raw,Buffer.from([0xff])])).valid,false);assert.equal(parse(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),raw])).valid,false);
  }
});

test('Closed shape, duplicate IDs, script parity, article type and references remain fail-closed',()=>{
  for(const[kind,mutate]of [['saints',p=>p.extra=true],['saints',p=>p.articles[0].content['sr-Latn'].title='invalid'],['saints',p=>p.articles[1].id=p.articles[0].id],['saints',p=>p.articles[0].source_ids=['missing-source']],['saints',p=>p.articles[0].subtype=p.articles[0].type==='feast'?null:'feast'],['catalog',p=>p.extra=true],['catalog',p=>p.subjects[1].id=p.subjects[0].id],['catalog',p=>p.observances[0].subject_ids=['missing-subject']]]){
    const data=structuredClone(large[kind]);mutate(data);assert.equal((kind==='saints'?profile.saints.parseSaintsPayload:profile.catalog.parseCatalogPayload)(json(data)).valid,false);
  }
});

test('Both scripts resolve exact packageA links and full366 graph identities; next year has no derived dates',()=>{
  for(const day of view.saints.days.filter(x=>x.date>='2026-10-09'&&x.date<='2026-10-31')){
    const result=profile.catalog.resolveCatalogDay(view.catalog,view.contexts.catalog,{date:day.date,calendar_profile_id:PROFILE});assert.equal(result.state,'source_recorded');
    const occurrence=view.catalog.occurrences.find(o=>o.id===result.occurrence_ids[0]),obs=view.catalog.observances.find(o=>o.id===occurrence.observance_id);
    for(const locale of ['sr-Cyrl','sr-Latn'])assert.deepEqual(search(view,obs.name[locale],locale).results.find(r=>r.observance_id===obs.id).article_ids,day.article_ids);
  }
  const links=large.catalog.article_links.filter(l=>l.observance_id.startsWith('test-observance-'));
  assert.equal(links.length,366);assert.equal(new Set(links.map(l=>l.article_id)).size,366);
  for(const index of [0,103,365]){const link=links[index],obs=large.catalog.observances.find(o=>o.id===link.observance_id);
    for(const locale of ['sr-Cyrl','sr-Latn'])assert.deepEqual(search(large,obs.name[locale],locale).results.find(r=>r.observance_id===obs.id).article_ids,[link.article_id]);
    const next=search(large,obs.name['sr-Cyrl'],'sr-Cyrl',2027).results.find(r=>r.observance_id===obs.id);assert.equal(next.date_state,'unavailable');assert.deepEqual(next.dates,[]);
  }
});

test('Same-generation, approval and exact calendar/article/browser bindings are enforced by KS01',()=>{
  const host=large.contexts.catalog;
  const wrongDate=structuredClone(large.catalog);wrongDate.occurrences.at(-1).julian_date='2026-01-01';assert.equal(profile.catalog.evaluateCatalog(wrongDate,host).reason,'calendar_day_mismatch');
  const wrongCalendar=structuredClone(host);wrongCalendar.calendarContexts[0].sha256='0'.repeat(64);assert.equal(profile.catalog.evaluateCatalog(large.catalog,wrongCalendar).reason,'calendar_mismatch');
  const wrongArticle=structuredClone(host);wrongArticle.articleContexts[0].sha256='0'.repeat(64);assert.deepEqual(search(large,'САМО ТЕСТ 0001','sr-Cyrl',2026,wrongArticle).results[0].article_ids,[]);
  const stale=structuredClone(host);stale.articleContexts[0].generation={...host.generation,sequence:2};assert.equal(profile.catalog.evaluateCatalog(large.catalog,stale).reason,'generation_mismatch');
  const badBrowser=structuredClone(large.browser);badBrowser.catalog_binding.sha256=baseline.browser.catalog_binding.sha256;assert.equal(profile.browser.upcomingBrowserFeasts(badBrowser,browserHost(large),{from_date:'2026-10-08',locale:'sr-Cyrl'}).state,'unavailable');
  const draft=structuredClone(large.catalog);draft.review_status='pending';draft.approval_id=null;assert.equal(profile.catalog.evaluateCatalog(draft,host).reason,'unapproved');assert.equal(profile.catalog.evaluateCatalog(large.catalog,{...host,contentAuthenticated:false}).reason,'content_not_authenticated');
  const saintsContext={contentAuthenticated:true,moduleContext:large.contexts.saints_module,calendarAuthenticated:true,calendarContext:host.calendarContexts[0],date:large.saints.days[0].date};
  assert.equal(profile.saints.evaluateSaintsDay(large.saints,saintsContext).eligible,true);
  assert.equal(profile.saints.evaluateSaintsDay(large.saints,{...saintsContext,calendarContext:{...saintsContext.calendarContext,sha256:'0'.repeat(64)}}).reason,'calendar_mismatch');
});

test('Baseline semantic API output and browser archive behavior are identical under both explicit profiles',()=>{
  for(const d of [baseline,view]){
    assert.deepEqual(profile.catalog.evaluateCatalog(d.catalog,d.contexts.catalog),historicalCatalog.evaluateCatalog(d.catalog,d.contexts.catalog));
    for(const query of ['Јован','Nikola','Михољдан','Srđevdan'])for(const locale of ['sr-Cyrl','sr-Latn']){
      const args={query,locale,year:2026,calendar_profile_id:PROFILE};assert.deepEqual(profile.catalog.searchCatalog(d.catalog,d.contexts.catalog,args),historicalCatalog.searchCatalog(d.catalog,d.contexts.catalog,args));
    }
    assert.deepEqual(profile.browser.upcomingBrowserFeasts(d.browser,browserHost(d),{from_date:'2026-10-08',locale:'sr-Cyrl'}),historicalBrowser.upcomingBrowserFeasts(d.browser,browserHost(d),{from_date:'2026-10-08',locale:'sr-Cyrl'}));
    assert.deepEqual(profile.browser.resolveBrowserArchiveDay(d.browser,browserHost(d),{date:'2026-09-27'}),historicalBrowser.resolveBrowserArchiveDay(d.browser,browserHost(d),{date:'2026-09-27'}));
  }
});

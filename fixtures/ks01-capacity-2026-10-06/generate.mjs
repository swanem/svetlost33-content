#!/usr/bin/env node
// TEST ONLY. Never creates a release set, signatures, owner approval, or production data.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBase, json, hash, ROOT, PROFILE } from '../../drafts/calendar-saints-expansion-2026-10-06/prepare.mjs';
import { toLatin, SAINTS_MODULE } from '../../scripts/validate-saints-v1.mjs';
import { CATALOG_MODULE, catalogDependencies } from '../../scripts/validate-liturgical-catalog-v1.mjs';
import { CALENDAR_BROWSER_MODULE } from '../../scripts/validate-calendar-browser-v1.mjs';

export { json, hash, ROOT };
export const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = resolve(HERE, 'generated');
export const WARNING = 'TEST_ONLY_SYNTHETIC_TRUST_AND_REVIEW_NEVER_PUBLISH_NOT_OWNER_APPROVAL';
export const APPROVAL = 'test-only-ks01-never-publish';
const localized = text => ({ 'sr-Cyrl': text, 'sr-Latn': toLatin(text) });
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: hash(bytes) });
const ids = n => String(n).padStart(4, '0');

export async function baseline() {
  const loaded = await loadBase();
  const get = id => loaded.modules[id];
  return { loaded, saints: get('saints-v1').payload, catalog: get('liturgical-catalog-v1').payload,
    browser: get('calendar-browser-v1').payload, calendar: get('calendar-2026-r1').payload,
    raw: { saints: get('saints-v1').bytes, catalog: get('liturgical-catalog-v1').bytes,
      browser: get('calendar-browser-v1').bytes, calendar: get('calendar-2026-r1').bytes } };
}

export async function packageA(base) {
  const folder = 'drafts/calendar-saints-expansion-2026-10-06';
  const sources = [];
  const read = async (name, sha) => { const path = `${folder}/${name}`, raw = await readFile(resolve(ROOT,path)); assert.equal(hash(raw),sha);sources.push(record(path,raw));return JSON.parse(raw); };
  const catalog = await read('package-a.catalog.pending.json','121387e5bb1d80ab76460e1aff92cdfa10d70590ba8e78db0c5717bc3e6674d4');
  const browser = await read('package-a.browser.pending.json','97a0dbbfa106e9c941f5fda076dd35f3aefd8e1c0bdb8df00e4800fc8717f763');
  assert.equal(catalog.review_status,'pending');assert.equal(catalog.approval_id,null);
  catalog.review_status='approved';catalog.approval_id=APPROVAL;
  for(const key of ['subjects','observances','occurrences','article_links']) for(const row of catalog[key]) if(row.review_status==='pending')row.review_status='reviewed';
  browser.review_status='approved';browser.approval_id=APPROVAL;browser.catalog_binding.sha256=hash(json(catalog));
  return { name:'package-a-test-view', saints:structuredClone(base.saints),catalog,browser,calendar:base.calendar,
    raw:{ saints:base.raw.saints,catalog:json(catalog),browser:json(browser),calendar:base.raw.calendar }, sources, syntheticArticles:0,
    note:'Only pending review flags and unmistakable test approval IDs promoted; browser hash rebound. Original frozen draft untouched.' };
}

export function synthetic(base, count) {
  assert.ok(Number.isInteger(count)&&count>=62&&count<=500);
  const saints=structuredClone(base.saints),catalog=structuredClone(base.catalog),browser=structuredClone(base.browser);
  const version=`test.ks01.${count}`;
  for(const p of [saints,catalog,browser]) Object.assign(p,{version,revision:1,review_status:'approved',approval_id:APPROVAL});
  saints.authorship.attribution=localized('САМО ТЕСТ — копирани кратки текстови; није одобрени садржај.');
  for(let i=62;i<count;i++){
    const template=base.saints.articles[(i-62)%62],article=structuredClone(template),id=ids(i+1);
    article.id=`test-article-${id}`;article.revision=1;
    article.source_ids=[`test-biography-${id}`];
    const title=`САМО ТЕСТ ${id}: ${template.content['sr-Cyrl'].title}`;
    article.content['sr-Cyrl'].title=title;article.content['sr-Latn'].title=toLatin(title);
    const source=base.saints.sources.find(s=>s.id===template.source_ids[0]);
    saints.sources.push({...structuredClone(source),id:article.source_ids[0],title:`TEST ONLY ${id}: ${source.title}`,
      url:`https://example.invalid/ks01/biography/${id}`,publisher:'TEST ONLY — copied source metadata, no real source',published_on:null,reviewed_on:'2026-10-06'});
    saints.articles.push(article);
    // Test assignments only: at most seven articles on any existing source-bound 2026 day.
    // No invented 366th date in non-leap 2026 and no arithmetic/2027 date claims.
    saints.days[(i-62)%saints.days.length].article_ids.push(article.id);
  }
  const articleBinding=catalog.article_bindings.find(b=>b.module_id==='saints-v1');
  Object.assign(articleBinding,{version,revision:1,sha256:hash(json(saints))});
  const calendarBinding=catalog.calendar_bindings.find(b=>b.year===2026);
  for(let i=0;i<count;i++){
    const article=saints.articles[i],id=ids(i+1),sourceId=`test-identity-source-${id}`;
    const name=localized(`САМО ТЕСТ ${id}: ${base.saints.articles[i%62].content['sr-Cyrl'].title}`);
    const subjectId=`test-subject-${id}`,observanceId=`test-observance-${id}`;
    const kind=article.type==='saint'?'saint_commemoration':article.type==='group'?'group_commemoration':article.subtype==='commemoration_of_event'?'event':'feast';
    catalog.sources.push({id:sourceId,title:`TEST ONLY fixture identity source ${id}`,url:`https://example.invalid/ks01/identity/${id}`,
      publisher:'TEST ONLY — no ecclesiastical source',original_author:null,checked_on:'2026-10-06',review_status:'reviewed',rights_status:'pending'});
    // Even feast rows have a dummy fixture subject to exercise 366 distinct identities.
    // This is deliberate synthetic load, not an assertion that a feast is a person.
    catalog.subjects.push({id:subjectId,type:article.type==='group'?'group':'saint',name,aliases:[],source_ids:[sourceId],review_status:'reviewed'});
    catalog.observances.push({id:observanceId,kind,name,description:localized('САМО ТЕСТ — синтетички идентитет за мерење капацитета.'),
      subject_ids:[subjectId],aliases:[],source_ids:[sourceId],review_status:'reviewed'});
    const day=saints.days.find(d=>d.article_ids.includes(article.id));assert.ok(day);
    catalog.occurrences.push({id:`test-occurrence-${id}-2026`,observance_id:observanceId,calendar_binding_id:calendarBinding.id,date:day.date,
      julian_date:day.julian_date,calendar_title:day.calendar_title,calendar_source_ids:day.calendar_source_ids,source_ids:[sourceId],review_status:'reviewed'});
    catalog.article_links.push({observance_id:observanceId,article_binding_id:articleBinding.id,article_id:article.id,source_ids:[sourceId],review_status:'reviewed'});
  }
  const coverage=catalog.coverage.find(c=>c.year===2026);
  coverage.mapped_dates=new Set(catalog.occurrences.map(o=>o.date)).size;coverage.occurrences=catalog.occurrences.length;
  Object.assign(browser.catalog_binding,{version,revision:1,sha256:hash(json(catalog))});
  return {name:`synthetic-${count}`,saints,catalog,browser,calendar:base.calendar,syntheticArticles:count-62,
    raw:{saints:json(saints),catalog:json(catalog),browser:json(browser),calendar:base.raw.calendar},
    note:`All 62 original article objects retained unchanged; copied test articles and ${count}-way identity/source/link load are never real content or publication permission.`};
}

export function contexts(data) {
  const generation={id:`test-only-ks01-${data.name}`,sequence:1,decision_sha256:hash(Buffer.from(`${WARNING}:${data.name}`))};
  const catalogContext={generation,contentAuthenticated:true,
    moduleContext:{...CATALOG_MODULE,version:data.catalog.version,revision:data.catalog.revision,dependencies:catalogDependencies(data.catalog),generation},
    calendarContexts:data.catalog.calendar_bindings.map(b=>({...b,generation,authenticated:true,days:data.calendar.days})),
    articleContexts:data.catalog.article_bindings.map(b=>({...b,generation,authenticated:true,review_status:data.saints.review_status,
      calendar_binding:data.saints.calendar_binding,articles:data.saints.articles.map(({id,type})=>({id,type}))}))};
  return {warning:WARNING,generation,catalog:catalogContext,
    saints_module:{...SAINTS_MODULE,version:data.saints.version,revision:data.saints.revision},
    browser_module:{...CALENDAR_BROWSER_MODULE,version:data.browser.version,revision:data.browser.revision,dependencies:[],generation},
    browser_catalog:{...data.browser.catalog_binding,authenticated:true,generation},archiveContexts:[],
    assembly:'For saints: calendarContext=catalog.calendarContexts[0]. For browser: catalogContext={...browser_catalog,payload:catalogPayload,context:catalog}. Use archiveContexts=[] only for calendar/search tests; raw archive bindings are preserved, not an archive acceptance fixture.',
    signature_authentication:'NONE: authenticated flags and generation are synthetic test harness values; never pass them to production trust.'};
}

export function measurements(data) {
  const c=data.catalog,s=data.saints;
  return {name:data.name,purpose:WARNING,synthetic_articles:data.syntheticArticles??0,
    raw_bytes:Object.fromEntries(Object.entries(data.raw).map(([k,v])=>[k,v.length])),
    saints_counts:{articles:s.articles.length,sources:s.sources.length,days:s.days.length,max_articles_per_day:Math.max(...s.days.map(d=>d.article_ids.length))},
    catalog_counts:Object.fromEntries(['sources','subjects','observances','occurrences','article_links','calendar_bindings','article_bindings'].map(k=>[k,c[k].length])),
    distinct_test_identity_links:c.article_links.filter(l=>l.observance_id.startsWith('test-observance-')).length,
    browser_counts:{memberships:data.browser.feast_memberships.length,archive_days:data.browser.archive_days.length},
    preserved_original_article_objects:62,note:data.note};
}

export function datasetFiles(data) {
  const root=data.name,files=new Map();
  for(const [key,name] of [['saints','saints-v1.json'],['catalog','liturgical-catalog-v1.json'],['browser','calendar-browser-v1.json']])files.set(`${root}/${name}`,data.raw[key]);
  files.set(`${root}/contexts.json`,json(contexts(data)));
  files.set(`${root}/TEST-ONLY.json`,json({warning:WARNING,publishable:false,production_signature:false,owner_approval:false,
    calendar_file:'../common/calendar.2026.json',calendar_sha256:hash(data.raw.calendar),note:data.note}));
  files.set(`${root}/manifest.json`,json({schema_version:'svetlost33-test-fixture-files-1',warning:WARNING,publishable:false,
    files:[...files].map(([p,b])=>record(p,b)),measurements:measurements(data)}));
  return files;
}

export async function writeNew(files) {
  for(const path of files.keys()) {let exists=true;try{await access(resolve(OUT,path));}catch(e){if(e.code==='ENOENT')exists=false;else throw e;}assert.equal(exists,false,`Refusing overwrite: ${path}`);}
  for(const [path,bytes]of files){const out=resolve(OUT,path);assert.ok(out.startsWith(`${OUT}/`));await mkdir(dirname(out),{recursive:true});await writeFile(out,bytes,{flag:'wx'});}
}

export async function allData() {
  const base=await baseline();
  const real={...base,name:'baseline-62',syntheticArticles:0,note:'Exact raw approved S12 payload bytes in an unauthenticated test harness.'};
  return {base,datasets:[real,synthetic(base,104),synthetic(base,366)],packageA:await packageA(base)};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.ok(['--package-a','--corpus','--check'].includes(process.argv[2])&&process.argv.length===3,'Usage: generate.mjs --package-a | --corpus | --check');
  const {base,datasets,packageA:view}=await allData();
  const selected=process.argv[2]==='--package-a'?[view]:process.argv[2]==='--corpus'?datasets:[view,...datasets];
  const files=new Map(selected.flatMap(d=>[...datasetFiles(d)]));
  if(process.argv[2]==='--package-a')files.set('common/calendar.2026.json',base.raw.calendar);
  if(process.argv[2]==='--corpus')files.set('measurements.json',json({warning:WARNING,datasets:datasets.map(measurements),original_inputs:base.loaded.inputs}));
  if(process.argv[2]==='--check')for(const [path,bytes]of files)assert.deepEqual(await readFile(resolve(OUT,path)),bytes,path);else await writeNew(files);
  console.log(JSON.stringify({status:'PASS_TEST_ONLY',mode:process.argv[2],files:[...files].map(([p,b])=>record(p,b)),measurements:selected.map(measurements)},null,2));
}

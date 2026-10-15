// TEST-ONLY proposed limits, not a shipped contract or native implementation.
// Historical validator logic runs unchanged in memory except the explicit limits below.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ROOT, hash } from './generate.mjs';

export const PROPOSAL = Object.freeze({
  status:'TEST_ONLY_MEASURED_PROPOSAL_REQUIRES_SHARED_DECISION',
  saints:{articles:366,bytes:1572864,sources:512,days:366},
  catalog:{sources:512,subjects:512,article_links:512,bytes:1048576,observances:512,occurrences:2048,calendar_bindings:4,article_bindings:4},
  unchanged:{browser_bytes:1048576,browser_memberships:128,source_refs_per_record:8,articles_per_day:8,
    m0_document_bytes:262144,modules:16,files_per_manifest:512},
  rationale:'Coordinator-directed finite shared bounds: exactly 366 articles; catalog sources/subjects/article links use the existing 512 collection scale. Saints 1.5 MiB has 23.5% headroom above the measured 366 fixture; catalog 1 MiB has 15.9%. Counts and raw byte limits are joint constraints, not a promise that all scalar fields can simultaneously reach their maxima. Actual up-to-104 content, native performance and client-gating checks remain release gates.',
});
const inputPaths={saintsSchema:'schemas/saints-v1.schema.json',catalogSchema:'schemas/liturgical-catalog-v1.schema.json',
  saintsValidator:'scripts/validate-saints-v1.mjs',catalogValidator:'scripts/validate-liturgical-catalog-v1.mjs',
  browserSchema:'schemas/calendar-browser-v1.schema.json',browserValidator:'scripts/validate-calendar-browser-v1.mjs'};
export const inputRecords=[];
const read=async path=>{const raw=await readFile(resolve(ROOT,path));inputRecords.push({path,bytes:raw.length,sha256:hash(raw)});return raw.toString('utf8');};
export const saintsSchema=JSON.parse(await read(inputPaths.saintsSchema));
export const catalogSchema=JSON.parse(await read(inputPaths.catalogSchema));
const originalSaintsSchema=structuredClone(saintsSchema),originalCatalogSchema=structuredClone(catalogSchema);
saintsSchema.properties.articles.maxItems=PROPOSAL.saints.articles;
for(const name of ['sources','subjects','article_links'])catalogSchema.properties[name].maxItems=PROPOSAL.catalog[name];
const schemaDifferences=(old,now,path=[])=>Object.keys(old).flatMap(key=>{
  const a=old[key],b=now[key];return a&&typeof a==='object'&&!Array.isArray(a)?schemaDifferences(a,b,[...path,key]):JSON.stringify(a)===JSON.stringify(b)?[]:[{path:[...path,key].join('.'),before:a,after:b}];
});
export const schemaChanges={saints:schemaDifferences(originalSaintsSchema,saintsSchema),catalog:schemaDifferences(originalCatalogSchema,catalogSchema)};
assert.deepEqual(schemaChanges.saints.map(x=>x.path),['properties.articles.maxItems']);
assert.deepEqual(schemaChanges.catalog.map(x=>x.path),['properties.sources.maxItems','properties.subjects.maxItems','properties.article_links.maxItems']);
function replaceOnce(text,from,to){assert.equal(text.split(from).length,2,`Historical source drift: ${from}`);return text.replace(from,to);}
const moduleUrls={};
async function load(kind,schema){
  let text=await read(inputPaths[`${kind}Validator`]);
  text=replaceOnce(text,`const schema = JSON.parse(await readFile(new URL('../schemas/${kind==='saints'?'saints':'liturgical-catalog'}-v1.schema.json', import.meta.url)));`,`const schema = ${JSON.stringify(schema)};`);
  text=replaceOnce(text,"from 'ajv/dist/2020.js'",`from '${pathToFileURL(resolve(ROOT,'node_modules/ajv/dist/2020.js')).href}'`);
  if(kind==='saints')text=replaceOnce(text,'bytes: 262144, articles: 64','bytes: 1572864, articles: 366');
  else{
    text=replaceOnce(text,'bytes: 524288','bytes: 1048576');
    text=replaceOnce(text,"from './validate-saints-v1.mjs'",`from '${pathToFileURL(resolve(ROOT,'scripts/validate-saints-v1.mjs')).href}'`);
  }
  // Remove only the command-line entry point; exported validation/resolution stays exact.
  const main=text.indexOf('\nif (process.argv[1]');assert.ok(main>0);text=text.slice(0,main);
  moduleUrls[kind]=`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
  return import(moduleUrls[kind]);
}
export const saints=await load('saints',saintsSchema);
export const catalog=await load('catalog',catalogSchema);
// Browser shape/limits/logic are unchanged; route its catalog resolver through this
// test-only profile so a 366-row catalog can be tested as the same generation.
let browserSource=await read(inputPaths.browserValidator);
const browserSchema=JSON.parse(await read(inputPaths.browserSchema));
browserSource=replaceOnce(browserSource,"const schema = JSON.parse(await readFile(new URL('../schemas/calendar-browser-v1.schema.json', import.meta.url)));",`const schema = ${JSON.stringify(browserSchema)};`);
browserSource=replaceOnce(browserSource,"from 'ajv/dist/2020.js'",`from '${pathToFileURL(resolve(ROOT,'node_modules/ajv/dist/2020.js')).href}'`);
browserSource=replaceOnce(browserSource,"from './validate-saints-v1.mjs'",`from '${pathToFileURL(resolve(ROOT,'scripts/validate-saints-v1.mjs')).href}'`);
browserSource=replaceOnce(browserSource,"from './validate-liturgical-catalog-v1.mjs'",`from '${moduleUrls.catalog}'`);
const browserMain=browserSource.indexOf('\nif (process.argv[1]');assert.ok(browserMain>0);browserSource=browserSource.slice(0,browserMain);
export const browser=await import(`data:text/javascript;base64,${Buffer.from(browserSource).toString('base64')}`);

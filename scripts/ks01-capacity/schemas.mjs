import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { SAINTS_LIMITS, CATALOG_COLLECTION_LIMITS } from './limits.mjs';

// Derive the same closed v1 shapes without modifying/exporting mutable historical
// schemas. Only these four maxItems values differ; all other bounds stay intact.
const saintsSchema = JSON.parse(await readFile(new URL('../../schemas/saints-v1.schema.json', import.meta.url)));
const catalogSchema = JSON.parse(await readFile(new URL('../../schemas/liturgical-catalog-v1.schema.json', import.meta.url)));
saintsSchema.properties.articles.maxItems = SAINTS_LIMITS.articles;
for (const [key, limit] of Object.entries(CATALOG_COLLECTION_LIMITS)) catalogSchema.properties[key].maxItems = limit;
const saintsShape = new Ajv2020({ strict: true, allErrors: true }).compile(saintsSchema);
const catalogShape = new Ajv2020({ strict: true, allErrors: true }).compile(catalogSchema);
export const matchesSaintsShape = payload => saintsShape(payload);
export const matchesCatalogShape = payload => catalogShape(payload);

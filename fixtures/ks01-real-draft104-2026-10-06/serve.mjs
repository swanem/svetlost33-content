#!/usr/bin/env node
// Explicit loopback-only, immutable allowlisted raw test transport. No upload endpoints.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERE, hash } from './generate.mjs';

export async function startFixtureServer(port = 0) {
  assert.ok(Number.isInteger(port) && port >= 0 && port <= 65535);
  const handoff = JSON.parse(await readFile(resolve(HERE, 'handoff.json'))), files = new Map();
  for (const dataset of handoff.datasets) for (const item of dataset.files) {
    const path = `${dataset.name}/${item.path}`, raw = await readFile(resolve(HERE, path));
    assert.equal(raw.length, item.bytes); assert.equal(hash(raw), item.sha256); files.set(`/${path}`, raw);
  }
  const server = createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const raw = files.get(req.url); if (!raw) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': req.url.endsWith('.json') ? 'application/json' : 'text/plain', 'Content-Length': raw.length, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : raw);
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  return { server, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((ok, fail) => server.close(e => e ? fail(e) : ok())) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], '--port'); assert.equal(process.argv.length, 4);
  const { origin } = await startFixtureServer(Number(process.argv[3]));
  console.log(JSON.stringify({ status: 'TEST_ONLY_LOOPBACK_SERVER', origin, datasets: ['baseline62', 'realDraft104'] }));
}

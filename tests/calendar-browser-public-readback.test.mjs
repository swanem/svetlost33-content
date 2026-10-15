import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { readTree } from '../scripts/prepare-charity-release-v2.mjs';
import { verifyCalendarBrowserPublic, CALENDAR_PUBLIC_CHANNEL } from '../scripts/verify-calendar-browser-public-v2.mjs';

// Exact locally signed integration fixture is external to Git. Never a runtime
// or publication proof: fetch is deliberately replaced by reviewed local bytes.
const stage = process.env.SVETLOST_CALENDAR_READBACK_STAGE;
const input = resolve('approvals/calendar-browser-2026-09-27/candidate-inputs');
const options = { directory: stage, catalogPath: `${input}/catalog.json`,
  browserPath: `${input}/browser.json`, evidencePath: `${input}/candidate-review.json` };

test('readback requires explicit isolated stage, never assumes production is an exact staging inventory', async () => {
  await assert.rejects(verifyCalendarBrowserPublic(), /Explicit isolated signed stage required/);
});

test('readback verifies exact signed graph, bounded responses and ordinary unmodified URLs', { skip: !stage }, async () => {
  const files = await readTree(stage), original = globalThis.fetch, urls = [];
  globalThis.fetch = async (url, init) => {
    const value = String(url); urls.push(value);
    assert.ok(value.startsWith(CALENDAR_PUBLIC_CHANNEL));
    assert.equal(new URL(value).search, '');
    assert.equal(init.redirect, 'error');
    const bytes = files.get(value.slice(CALENDAR_PUBLIC_CHANNEL.length));
    return new Response(bytes, { status: bytes ? 200 : 404 });
  };
  try {
    const r = await verifyCalendarBrowserPublic(options);
    assert.equal(r.status, 'PASS');
    assert.equal(r.index_sha256, 'cbb21ce4fcd50dbc7c97c95f56d5b5aea96da5c1ace65a1a49e68099cbd8ec23');
    assert.equal(r.sequence, 10); assert.equal(r.modules.length, 7);
    assert.equal(r.signatures_verified, 9);
    assert.equal(r.files.length, r.fetched_files); assert.equal(urls.length, r.fetched_files);
    assert.ok(r.payload_files_verified > 0);
    assert.ok(Date.parse(r.completed_at) >= Date.parse(r.started_at));
  } finally { globalThis.fetch = original; }
});

test('readback rejects stale/altered discovery bytes, never accepts a response learned hash', { skip: !stage }, async () => {
  const files = await readTree(stage), original = globalThis.fetch;
  globalThis.fetch = async url => {
    const path = String(url).slice(CALENDAR_PUBLIC_CHANNEL.length);
    const bytes = files.get(path);
    return new Response(path === 'index.json' ? Buffer.concat([bytes, Buffer.from('\n')]) : bytes);
  };
  try { await assert.rejects(verifyCalendarBrowserPublic(options), /Public file too large/); }
  finally { globalThis.fetch = original; }
});

test('readback rejects an unsuccessful public response', { skip: !stage }, async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
  try { await assert.rejects(verifyCalendarBrowserPublic(options), /Public HTTP status/); }
  finally { globalThis.fetch = original; }
});

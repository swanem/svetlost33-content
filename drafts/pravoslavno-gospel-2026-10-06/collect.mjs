#!/usr/bin/env node
// One authorized bounded acquisition. Raw HTML is research evidence, NOT distributable app content.
import assert from 'node:assert/strict';
import { mkdir, writeFile, lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { json, sha256 } from '../../scripts/prepare-charity-release-v2.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const START = '2026-10-06', END = '2026-11-05';
export const ORIGIN = 'https://www.pravoslavno.rs';
export const AGENT = 'Svetlost33-reference-review';
export const dayOffset = (date, offset) => new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
export const dates = Array.from({ length: 31 }, (_, i) => dayOffset(START, i));
export const urlFor = date => { assert.ok(dates.includes(date), 'Outside authorized30-day horizon'); return `${ORIGIN}/index.php?datum=${date}&q=citanja`; };
const wait = ms => new Promise(done => setTimeout(done, ms));

/** Conservative robots group handling: unsupported applicable directives block, never bypass. */
export function robotsPolicy(status, body, target = '/index.php?datum=2026-10-06&q=citanja') {
  if (status === 404 || status === 410) return { permitted: true, reason: 'robots_unavailable_404_or410_not_a_rights_grant', interval_ms: 1100 };
  if (status !== 200) return { permitted: false, reason: `robots_http_${status}`, interval_ms: 1100 };
  if (/<html|<!doctype/iu.test(body)) return { permitted: false, reason: 'robots_html_not_rules', interval_ms: 1100 };
  const groups = []; let group = null, rulesStarted = false;
  for (const raw of body.split(/\r?\n/u)) {
    const line = raw.replace(/#.*$/u, '').trim(); if (!line) continue;
    const match = /^([\w-]+)\s*:\s*(.*)$/u.exec(line);
    if (!match) return { permitted: false, reason: 'robots_unparsed_line', interval_ms: 1100 };
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (key === 'user-agent') {
      if (!group || rulesStarted) { group = { agents: [], rules: [] }; groups.push(group); rulesStarted = false; }
      group.agents.push(value.toLowerCase());
    } else if (key !== 'sitemap' && group) { rulesStarted = true; group.rules.push([key, value]); }
  }
  const exact = groups.filter(g => g.agents.some(a => a !== '*' && AGENT.toLowerCase().includes(a)));
  const selected = exact.length ? exact : groups.filter(g => g.agents.includes('*'));
  let interval = 1100, matches = [];
  for (const [key, value] of selected.flatMap(g => g.rules)) {
    if (key === 'crawl-delay') {
      if (!/^\d+(?:\.\d+)?$/u.test(value) || Number(value) > 30) return { permitted: false, reason: 'robots_unbounded_crawl_delay', interval_ms: interval };
      interval = Math.max(interval, Number(value) * 1000); continue;
    }
    if (!['allow', 'disallow'].includes(key)) return { permitted: false, reason: `robots_unsupported_${key}`, interval_ms: interval };
    if (!value) continue;
    const expression = value.replace(/[.+?^{}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*');
    if (new RegExp(`^${expression}`, 'u').test(target)) matches.push({ allow: key === 'allow', length: value.replace(/[*$]/gu, '').length });
  }
  matches.sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
  return { permitted: matches[0]?.allow ?? true, reason: matches[0]?.allow === false ? 'robots_disallow' : 'robots_rules_allow_not_a_rights_grant', interval_ms: interval };
}

export async function collect() {
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  assert.equal(localDate, START, 'This fixed draft only runs on its actual authorized Belgrade day; no server-date tricks');
  const out = resolve(HERE, 'acquisition');
  assert.equal(await lstat(out).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; }), false, 'New evidence directory only');
  await mkdir(out); await mkdir(resolve(out, 'raw'));
  const started_at = new Date().toISOString(), records = []; let lastStart = 0, interval = 1100;
  const retrieve = async (url, id, maximum) => {
    assert.ok(url === `${ORIGIN}/robots.txt` || dates.some(date => url === urlFor(date)), 'Fixed authorized GET URL only');
    const attempts = []; let result;
    for (let attempt = 1; attempt <= 2; attempt++) {
      await wait(Math.max(0, lastStart + interval - Date.now())); lastStart = Date.now();
      const fetched_at = new Date().toISOString(), controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, { redirect: 'error', signal: controller.signal, headers: { 'User-Agent': `${AGENT}/1.0 (bounded user-requested reference review)` } });
        const chunks = []; let length = 0;
        assert.ok(response.body, 'Missing response body');
        for await (const part of response.body) { length += part.byteLength; assert.ok(length <= maximum, 'Bounded HTTP response'); chunks.push(Buffer.from(part)); }
        const raw = Buffer.concat(chunks), path = `raw/${id}-attempt${attempt}.html`;
        await writeFile(resolve(out, path), raw, { flag: 'wx' });
        result = { url, effective_url: response.url, fetched_at, http_status: response.status,
          headers: Object.fromEntries(['date', 'content-type', 'cache-control', 'etag', 'retry-after'].map(key => [key, response.headers.get(key)])),
          path, bytes: raw.length, sha256: sha256(raw) };
        attempts.push(result);
        if (response.status < 500 || attempt === 2) break;
      } catch (error) { attempts.push({ url, fetched_at, error: String(error.message), attempt }); result = null; }
      finally { clearTimeout(timer); }
      if (attempt < 2) await wait(2000);
    }
    const record = { id, attempts, result }; records.push(record); return record;
  };
  const robots = await retrieve(`${ORIGIN}/robots.txt`, 'robots', 256 * 1024);
  const { readFile } = await import('node:fs/promises');
  const robotText = robots.result ? new TextDecoder('utf-8', { fatal: true }).decode(await readFile(resolve(out, robots.result.path))) : '';
  const policies = dates.map(date => ({ date, ...robotsPolicy(robots.result?.http_status ?? 0, robotText, `/index.php?datum=${date}&q=citanja`) }));
  let stopped = policies.find(p => !p.permitted)?.reason ?? null;
  interval = Math.max(...policies.map(p => p.interval_ms));
  if (!stopped) for (const date of dates) {
    const item = await retrieve(urlFor(date), date, 1024 * 1024);
    console.log(`${date}: ${item.result?.http_status ?? 'network-error'}`);
    if ([401, 403, 429].includes(item.result?.http_status)) { stopped = `access_or_rate_limit_${item.result.http_status}`; break; }
  }
  const manifest = { schema_version: 'svetlost33-pravoslavno-reference-acquisition-1',
    purpose: 'LOCAL_RESEARCH_EVIDENCE_ONLY_NOT_FOR_APP_DISTRIBUTION', started_at, completed_at: new Date().toISOString(),
    window: [START, END], actual_belgrade_date: localDate, horizon_days_ahead: 30,
    fixed_source: ORIGIN, user_agent: AGENT, minimum_request_interval_ms: interval, timeout_ms: 15000, maximum_attempts: 2,
    no_redirects: true, no_server_date_override: true, no_translation_or_commentary_import: true,
    robots_policies: policies, stopped_reason: stopped, records };
  await writeFile(resolve(out, 'manifest.json'), json(manifest), { flag: 'wx' });
  console.log(JSON.stringify({ status: stopped ? 'STOPPED_WITH_EVIDENCE' : 'ACQUIRED_FOR_REVIEW', records: records.length, stopped_reason: stopped }));
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { assert.deepEqual(process.argv.slice(2), ['--fetch']); await collect(); }

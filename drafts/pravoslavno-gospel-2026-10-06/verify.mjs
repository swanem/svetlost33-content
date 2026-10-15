#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, json, sha256, writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';
import { HERE } from './collect.mjs';
import { prepare } from './prepare.mjs';

assert.ok(process.argv.length === 3 && ['--write', '--check'].includes(process.argv[2]));
const startedAt = new Date().toISOString();
const run = await new Promise((done, reject) => {
  const child = spawn(process.execPath, ['--test', '--test-reporter=tap', resolve(HERE, 'verify.test.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = []; let total = 0;
  for (const pipe of [child.stdout, child.stderr]) pipe.on('data', data => { total += data.length; if (total > 1024 * 1024) { child.kill(); reject(new Error('Bounded log exceeded')); } else chunks.push(data); });
  child.on('error', reject); child.on('close', code => done({ code, output: Buffer.concat(chunks) }));
});
process.stdout.write(run.output); assert.equal(run.code, 0, 'Targeted suite must pass');
const p = await prepare();
if (process.argv[2] === '--write') {
  const receipt = { status: 'PASS_DRAFT_REFERENCE_INTAKE_ONLY', started_at: startedAt, completed_at: new Date().toISOString(),
    command: 'node drafts/pravoslavno-gospel-2026-10-06/verify.mjs --check', node: process.version, tests: 9, exit_code: run.code,
    network_during_test: false, summary: p.candidate.summary, protected_source_inputs: p.inputPins,
    test_log_sha256: sha256(run.output), production_imported: false, signed: false, published: false, native_run: false };
  await writeNewTree(resolve(HERE, 'verification'), new Map([['receipt.json', json(receipt)], ['targeted-tests.log', run.output]]));
  const tree = await captureRefreshTree(HERE);
  const handoff = { status: 'STABLE_REFERENCE_INTAKE_READY_FOR_INDEPENDENT_REVIEW_NOT_PRODUCTION_RELEASE',
    path: 'drafts/pravoslavno-gospel-2026-10-06', summary: p.candidate.summary,
    candidate: { path: 'review/candidate.json', sha256: sha256(p.files.get('candidate.json')) },
    delta: { path: 'review/delta.json', sha256: sha256(p.files.get('delta.json')) },
    attribution: 'Prema Pravoslavno.rs / Pravoslavni podsetnik; publisher identification © Mikro knjiga, not asserted SPC endorsement or Slovo ljubve.',
    scope: '31 dated reference observations only. Future combined A+B/calendar release must rebase against published S13 and preserve104 article bodies; not a separate Gospel publication.',
    source_evidence: 'acquisition/raw HTML is PRIVATE LOCAL RESEARCH, not distribution. Candidate contains reference identities/provenance only, renders from already approved local Vuk/eBible Gospel corpus.',
    limitations: ['robots.txt returned404; absence of robots rules is not a licence or church approval',
      'Single-publisher schedule observations; dated evidence does not establish comprehensive SPC service assignment',
      'Four explicit service labels retained in provenance, runtime proposal remains service=unspecified',
      'All33 printed source labels fail existing shared legacyCalendarLabelMatches grammar; reviewed adapter compatibility needed before release, including multiple zachala on14October',
      'No facts imported for6November–31December or2027; unchanged S13 unknowns and existing source observations retained',
      'No independent rights/clergy guarantee; no source translation/commentary imported'],
    followup: { local_date: p.candidate.summary.next_search_local_date, local_time: '09:00', timezone: 'Europe/Belgrade',
      reason: 'Last contiguous validated date2026-11-05 minus10calendar days', automation_created_by_this_agent: false,
      future_collection_requires_new_additive_snapshot: true, end_scope: '2026-12-31', no_automatic_publication: true },
    tests: '9/9 PASS', no_production_mutation: true,
    artifacts: [...tree].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })).sort((a, b) => a.path.localeCompare(b.path, 'en')) };
  await writeFile(resolve(HERE, 'handoff.json'), json(handoff), { flag: 'wx' });
} else {
  const handoff = JSON.parse(await readFile(resolve(HERE, 'handoff.json')));
  for (const item of handoff.artifacts) assert.equal(sha256(await readFile(resolve(HERE, item.path))), item.sha256, item.path);
}
console.log(JSON.stringify({ status: 'PASS_REFERENCE_INTAKE_ONLY', tests: 9, ...p.candidate.summary }));

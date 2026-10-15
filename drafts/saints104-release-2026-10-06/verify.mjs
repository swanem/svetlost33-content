#!/usr/bin/env node
// One targeted finite suite; evidence contains actual captured child-process output.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readRefreshInput } from '../../scripts/prepare-shared-refresh-release-v2.mjs';
import { ROOT, json, sha256, writeNewTree } from '../../scripts/prepare-charity-release-v2.mjs';
import { captureRefreshTree } from '../../scripts/sign-shared-refresh-release-v2.mjs';
import { HERE, createPlan, record, nativeDescriptor } from './prepare.mjs';
import { assertUnsignedCandidate } from './sign.mjs';

assert.ok(process.argv.length === 3 && ['--write', '--check'].includes(process.argv[2]));
const started_at = new Date().toISOString();
const result = await new Promise((done, reject) => {
  const child = spawn(process.execPath, ['--test', '--test-reporter=tap', resolve(HERE, 'verify.test.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = []; let size = 0;
  for (const pipe of [child.stdout, child.stderr]) pipe.on('data', data => { size += data.length; if (size > 1024 * 1024) { child.kill(); reject(new Error('Bounded test output exceeded')); } else chunks.push(data); });
  child.on('error', reject); child.on('close', code => done({ code, output: Buffer.concat(chunks) }));
});
process.stdout.write(result.output);
assert.equal(result.code, 0, 'Targeted shared suite must pass');
const plan = await createPlan(); await assertUnsignedCandidate(resolve(HERE, 'unsigned-s13'), plan);
const evidence = {
  schema_version: 'svetlost33-s13-targeted-verification-1', status: 'PASS_UNSIGNED_CANDIDATE_AND_EPHEMERAL_TEST_GRAPH_ONLY',
  started_at, completed_at: new Date().toISOString(), command: 'node drafts/saints104-release-2026-10-06/verify.mjs --check',
  node: process.version, exit_code: result.code, tests: 9, test_log: record('targeted-tests.log', result.output),
  assertions: ['9 focused tests, 24 actual ephemeral RSA transport profiles + S12 retained predecessor', 'explicit KS01 domain projections, both scripts and exact 62+42 originals', 'old-client, replay, expiry, signature, hash, pending, binding, file-set, source-CAS, immutable-path, symlink, key-location/GO negatives'],
  production_private_key_accessed: false, private_test_key_written: false, production_signed: false, native_executed: false, published: false,
  source_inputs_unchanged: true, source_input_pins: plan.request.protected_inputs,
  base_public_receipt: { path: 'public-baseline-s12.json', sha256: sha256(await readRefreshInput(resolve(HERE, 'public-baseline-s12.json'))) },
  candidate_index_sha256: plan.report.index_sha256, candidate_release_sha256: plan.report.release_sha256,
};
if (process.argv[2] === '--write') {
  await writeNewTree(resolve(HERE, 'verification'), new Map([['targeted-tests.log', result.output], ['receipt.json', json(evidence)], ['protected-inputs-after.json', json(plan.request.protected_inputs)]]));
  const tree = await captureRefreshTree(HERE);
  const descriptorBytes = json(nativeDescriptor(plan));
  tree.set('handoff/native-acceptance.json', descriptorBytes);
  const artifacts = [...tree].map(([path, bytes]) => record(path, bytes)).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  await writeNewTree(resolve(HERE, 'handoff'), new Map([['native-acceptance.json', descriptorBytes], ['handoff.json', json({
    status: 'SHARED_S13_UNSIGNED_READY_FOR_ROOT_REVIEW_NOT_SIGNED_NOT_NATIVE_ACCEPTED', release_set_id: plan.report.release_set_id,
    sequence: 13, candidate: 'unsigned-s13', signer: 'sign.mjs', tests: '9/9 PASS', actual_signature_profiles: 24,
    report: plan.report, candidate_file_count: plan.files.size, signed_file_count_expected: plan.files.size - 1 + 5,
    production_signing_example: 'node drafts/saints104-release-2026-10-06/sign.mjs --candidate <exact unsigned-s13> --out <new isolated signed-s13> --source <current S12 root> --private-key <explicit external existing production key> --coordinator-go',
    no_signing_executed: true, no_native_run: true, no_publication: true,
    native_descriptor: { path: 'handoff/native-acceptance.json', sha256: sha256(descriptorBytes), accepted_at_meaning: 'Fixed harness validation clock anchor; NOT an actual native acceptance event or PASS. Keep descriptor outside the exact signed/public graph; staging adapters may copy it as a test sidecar.' },
    signing_scope: 'Five new RSA-PSS documents only; four unchanged modules and all historical files/signatures remain byte-exact. Signer rechecks exact candidate, owner pins, source and public discovery before key access and output. Public HEAD CAS, exact 15-file allowlist, immutable paths and both native exact-generation acceptance remain publication gates.',
    artifacts,
  })]]));
} else {
  const handoff = JSON.parse(await readRefreshInput(resolve(HERE, 'handoff/handoff.json')));
  for (const item of handoff.artifacts) assert.equal(sha256(await readRefreshInput(resolve(HERE, item.path))), item.sha256, `Frozen handoff: ${item.path}`);
}
console.log(JSON.stringify({ status: 'PASS', tests: 9, production_signed: false, published: false }));

import assert from 'node:assert/strict';
import test from 'node:test';
import { CHANNEL, fetchExactPublicFile } from '../scripts/verify-public-shared-refresh-v2.mjs';

test('ordinary exact URL, bytes and cache metadata are verified', async () => {
  const bytes = Buffer.from('approved\n');
  const result = await fetchExactPublicFile('releases/example/index.json', bytes, async (url, options) => {
    assert.equal(url, `${CHANNEL}releases/example/index.json`);
    assert.equal(options.redirect, 'error');
    assert.equal(new URL(url).search, '');
    return new Response(bytes, { headers: { etag: 'known' } });
  });
  assert.ok(result.bytes.equals(bytes)); assert.equal(result.cache.etag, 'known');
});

test('wrong bytes, short/oversized responses and HTTP errors cannot create success', async () => {
  const bytes = Buffer.from('approved\n');
  for (const bad of ['rejected\n', 'short', 'approved\nextra']) {
    await assert.rejects(fetchExactPublicFile('index.json', bytes, async () => new Response(bad)));
  }
  await assert.rejects(fetchExactPublicFile('index.json', bytes, async () => new Response('missing', { status: 404 })), /HTTP readback/);
});

test('unsafe paths never reach the transport', async () => {
  for (const path of ['../index.json', 'foo/../index.json', '/index.json', 'https://other.test', 'index.json?fresh=1', 'foo%2fbar']) {
    await assert.rejects(fetchExactPublicFile(path, Buffer.from('a'), async () => { assert.fail('must not fetch'); }));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type {AddressInfo} from 'node:net';
import {
  createApp,
  createResetToken,
  hashPasswordScrypt,
  verifyResetToken,
} from '../../server.ts';

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = createApp();
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const {port} = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('POST /api/recovery rejects invalid account payloads with 400', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/recovery`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({account: 'bad@'}),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as {error: string};
    assert.equal(body.error, 'Please enter a valid email address.');
  });
});

test('POST /api/recovery returns 503 when Supabase env vars are not configured', async () => {
  const prevUrl = process.env.SUPABASE_URL;
  const prevProj = process.env.SUPABASE_PROJECT_ID;
  const prevKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const prevAnon = process.env.SUPABASE_ANON_KEY;

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PROJECT_ID;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_ANON_KEY;

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/recovery`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({account: 'user@example.com'}),
      });
      assert.equal(res.status, 503);
      const body = (await res.json()) as {error: string};
      assert.match(body.error, /Supabase backend is not configured/i);
    });
  } finally {
    if (prevUrl !== undefined) process.env.SUPABASE_URL = prevUrl;
    if (prevProj !== undefined) process.env.SUPABASE_PROJECT_ID = prevProj;
    if (prevKey !== undefined) process.env.SUPABASE_PUBLISHABLE_KEY = prevKey;
    if (prevAnon !== undefined) process.env.SUPABASE_ANON_KEY = prevAnon;
  }
});

test('createResetToken and verifyResetToken bind token to account', () => {
  const token = createResetToken('user@example.com');
  assert.equal(verifyResetToken(token, 'user@example.com'), true);
  assert.equal(verifyResetToken(token, 'other@example.com'), false);
  assert.equal(verifyResetToken(`${token}x`, 'user@example.com'), false);
});

test('hashPasswordScrypt produces salted irreversible hash', () => {
  const hash1 = hashPasswordScrypt('secret123');
  const hash2 = hashPasswordScrypt('secret123');
  assert.notEqual(hash1, hash2);
  assert.equal(hash1.includes('secret123'), false);
  assert.match(hash1, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
});

test('POST /api/password-reset rejects mismatched passwords and invalid tokens', async () => {
  await withServer(async (baseUrl) => {
    const mismatchRes = await fetch(`${baseUrl}/api/password-reset`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        account: 'user@example.com',
        verificationCode: '123456',
        newPassword: 'password123',
        confirmPassword: 'password456',
        resetToken: createResetToken('user@example.com'),
      }),
    });
    assert.equal(mismatchRes.status, 400);

    const invalidTokenRes = await fetch(`${baseUrl}/api/password-reset`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        account: 'user@example.com',
        verificationCode: '123456',
        newPassword: 'password123',
        confirmPassword: 'password123',
        resetToken: 'invalid.token',
      }),
    });
    assert.equal(invalidTokenRes.status, 403);
  });
});

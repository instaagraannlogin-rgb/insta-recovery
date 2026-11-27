import test from 'node:test';
import assert from 'node:assert/strict';
import type {AddressInfo} from 'node:net';
import {
  createApp,
  resetFormsparkCacheForTests,
  resolveFormsparkConfig,
  resolvePublicSupabaseConfig,
  validateContactPayloadForFormspark,
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

test('resolvePublicSupabaseConfig normalizes HTTPS URLs and never reads service role keys', () => {
  const keys = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_URL',
    'SUPABASE_PROJECT_ID',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_JWKS_URL',
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  try {
    for (const k of keys) delete process.env[k];
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret_service_role_must_be_ignored';
    process.env.SUPABASE_SECRET_KEY = 'secret_key_must_be_ignored';
    process.env.SUPABASE_JWKS_URL = 'https://example-proj.supabase.co/auth/v1/.well-known/jwks.json';
    assert.equal(resolvePublicSupabaseConfig(), null);

    process.env.VITE_SUPABASE_URL = 'https://example-proj.supabase.co/';
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    assert.deepEqual(resolvePublicSupabaseConfig(), {
      url: 'https://example-proj.supabase.co',
      publishableKey: 'sb_publishable_test',
    });

    process.env.SUPABASE_URL = 'https://preferred-proj.supabase.co/';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_preferred';
    assert.deepEqual(resolvePublicSupabaseConfig(), {
      url: 'https://preferred-proj.supabase.co',
      publishableKey: 'sb_publishable_preferred',
    });

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    process.env.VITE_SUPABASE_URL = 'http://insecure.example.com';
    assert.equal(resolvePublicSupabaseConfig(), null);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('GET /api/supabase-config returns configured: false when unconfigured and public config when configured', async () => {
  const keys = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_URL',
    'SUPABASE_PROJECT_ID',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  try {
    for (const k of keys) delete process.env[k];
    await withServer(async (baseUrl) => {
      const missingRes = await fetch(`${baseUrl}/api/supabase-config`);
      assert.equal(missingRes.status, 200);
      const missingBody = (await missingRes.json()) as {
        configured: boolean;
        url: string | null;
        publishableKey: string | null;
      };
      assert.deepEqual(missingBody, {
        configured: false,
        url: null,
        publishableKey: null,
      });

      process.env.SUPABASE_URL = 'https://example-proj.supabase.co';
      process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
      const okRes = await fetch(`${baseUrl}/api/supabase-config`);
      assert.equal(okRes.status, 200);
      const body = (await okRes.json()) as {
        configured: boolean;
        url: string;
        publishableKey: string;
      };
      assert.deepEqual(body, {
        configured: true,
        url: 'https://example-proj.supabase.co',
        publishableKey: 'sb_publishable_test',
      });
    });
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('GET /api/account/me rejects unauthenticated requests via @supabase/server', async () => {
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://example-proj.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/account/me`);
      assert.equal(res.status, 401);
    });
  } finally {
    if (prevUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = prevKey;
  }
});

test('POST /api/recovery-events rejects passwords, OTPs, verification codes, and tokens', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/recovery-events`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        email: 'alex@example.com',
        eventType: 'recovery_requested',
        password: 'plaintext-should-be-blocked',
        otp: '12345678',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as {error?: string};
    assert.match(body.error || '', /must not be stored/i);
  });
});

test('resolveFormsparkConfig reads server env vars cleanly and validateContactPayloadForFormspark blocks credentials', () => {
  const prevKey = process.env.FORMSPARK_API_KEY;
  const prevFormId = process.env.FORMSPARK_FORM_ID;

  try {
    resetFormsparkCacheForTests();
    delete process.env.FORMSPARK_API_KEY;
    delete process.env.FORMSPARK_FORM_ID;
    assert.deepEqual(resolveFormsparkConfig(), {
      configured: false,
      formId: null,
      hasApiKey: false,
    });

    process.env.FORMSPARK_API_KEY = 'fsk_test_key';
    assert.deepEqual(resolveFormsparkConfig(), {
      configured: true,
      formId: null,
      hasApiKey: true,
    });

    process.env.FORMSPARK_FORM_ID = 'abc123XYZ';
    assert.deepEqual(resolveFormsparkConfig(), {
      configured: true,
      formId: 'abc123XYZ',
      hasApiKey: true,
    });

    const blocked = validateContactPayloadForFormspark({
      name: 'Alex Morgan',
      email: 'alex@example.com',
      message: 'Valid inquiry text',
      password: 'secret-should-not-forward',
    });
    assert.equal(blocked.ok, false);

    const valid = validateContactPayloadForFormspark({
      name: 'Alex Morgan',
      email: 'alex@example.com',
      phoneNumber: '555-0100',
      message: 'Please send my invoice receipt.',
    });
    assert.deepEqual(valid, {
      ok: true,
      data: {
        name: 'Alex Morgan',
        email: 'alex@example.com',
        phoneNumber: '555-0100',
        message: 'Please send my invoice receipt.',
      },
    });
  } finally {
    resetFormsparkCacheForTests();
    if (prevKey === undefined) delete process.env.FORMSPARK_API_KEY;
    else process.env.FORMSPARK_API_KEY = prevKey;
    if (prevFormId === undefined) delete process.env.FORMSPARK_FORM_ID;
    else process.env.FORMSPARK_FORM_ID = prevFormId;
  }
});

test('POST /api/formspark/submit rejects unauthenticated requests', async () => {
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://example-proj.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/formspark/submit`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          name: 'Alex Morgan',
          email: 'alex@example.com',
          message: 'Please send my invoice receipt.',
        }),
      });
      assert.equal(res.status, 401);
    });
  } finally {
    if (prevUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = prevKey;
  }
});

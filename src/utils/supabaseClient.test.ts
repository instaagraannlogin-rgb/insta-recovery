import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPABASE_NOT_CONFIGURED_ERROR,
  clearDisconnectedProjectAuthStorage,
  extractSupabaseProjectId,
  getConnectedSupabaseProject,
  getSupabaseClient,
  getSupabaseInitError,
  resetSupabaseClientForTests,
} from './supabaseClient';

test('extractSupabaseProjectId extracts project ref from HTTPS Supabase URLs', () => {
  assert.equal(
    extractSupabaseProjectId('https://fdedubvppattvgdqiceu.supabase.co'),
    'fdedubvppattvgdqiceu',
  );
  assert.equal(
    extractSupabaseProjectId('https://fdedubvppattvgdqiceu.supabase.co/'),
    'fdedubvppattvgdqiceu',
  );
  assert.equal(
    extractSupabaseProjectId('http://fdedubvppattvgdqiceu.supabase.co'),
    null,
  );
  assert.equal(extractSupabaseProjectId('not-a-url'), null);
});

test('clearDisconnectedProjectAuthStorage removes stale auth keys for other Supabase projects', () => {
  const store = new Map<string, string>([
    ['sb-oldproj123-auth-token', '{"access_token":"old"}'],
    ['sb-oldproj123-auth-token-code-verifier', 'old-verifier'],
    ['sb-fdedubvppattvgdqiceu-auth-token', '{"access_token":"new"}'],
    ['theme', 'dark'],
  ]);

  const fakeStorage = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
  };

  const removed = clearDisconnectedProjectAuthStorage(
    'https://fdedubvppattvgdqiceu.supabase.co',
    fakeStorage,
  );

  assert.deepEqual(removed, [
    'sb-oldproj123-auth-token',
    'sb-oldproj123-auth-token-code-verifier',
  ]);
  assert.equal(store.has('sb-fdedubvppattvgdqiceu-auth-token'), true);
  assert.equal(store.has('theme'), true);
});

test('getSupabaseClient initializes from /api/supabase-config and tracks project info cleanly', async () => {
  const originalFetch = globalThis.fetch;
  resetSupabaseClientForTests();

  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          configured: true,
          url: 'https://fdedubvppattvgdqiceu.supabase.co',
          publishableKey: 'sb_publishable_test_key',
        }),
        {status: 200, headers: {'Content-Type': 'application/json'}},
      )) as typeof fetch;

    const client = await getSupabaseClient();
    assert.ok(client);
    assert.equal(getSupabaseInitError(), null);
    assert.deepEqual(getConnectedSupabaseProject(), {
      url: 'https://fdedubvppattvgdqiceu.supabase.co',
      projectId: 'fdedubvppattvgdqiceu',
    });
  } finally {
    resetSupabaseClientForTests();
    globalThis.fetch = originalFetch;
  }
});

test('getSupabaseClient records SUPABASE_NOT_CONFIGURED_ERROR when /api/supabase-config is unconfigured and no build-time env exists', async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  resetSupabaseClientForTests();

  try {
    console.warn = () => {};
    console.error = () => {};
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({configured: false, url: null, publishableKey: null}),
        {status: 200, headers: {'Content-Type': 'application/json'}},
      )) as typeof fetch;

    const client = await getSupabaseClient();
    assert.equal(client, null);
    assert.equal(getSupabaseInitError(), SUPABASE_NOT_CONFIGURED_ERROR);
    assert.equal(getConnectedSupabaseProject(), null);
  } finally {
    resetSupabaseClientForTests();
    globalThis.fetch = originalFetch;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  }
});

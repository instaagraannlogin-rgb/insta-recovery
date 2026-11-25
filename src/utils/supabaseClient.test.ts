import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearDisconnectedProjectAuthStorage,
  extractSupabaseProjectId,
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

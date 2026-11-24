import test from 'node:test';
import assert from 'node:assert/strict';
import {FirebaseError} from 'firebase/app';
import {
  mapFirebaseAuthError,
  requireEmailForFirebaseAuth,
} from './firebaseAuth';
import {EMPTY_ACCOUNT_ERROR, INVALID_EMAIL_ERROR} from './recovery';

test('requireEmailForFirebaseAuth enforces non-empty valid email addresses', () => {
  assert.equal(requireEmailForFirebaseAuth(''), EMPTY_ACCOUNT_ERROR);
  assert.equal(requireEmailForFirebaseAuth('   '), EMPTY_ACCOUNT_ERROR);
  assert.equal(requireEmailForFirebaseAuth('alex_dev'), INVALID_EMAIL_ERROR);
  assert.equal(requireEmailForFirebaseAuth('bad@'), INVALID_EMAIL_ERROR);
  assert.equal(requireEmailForFirebaseAuth('alex@example.com'), '');
});

test('mapFirebaseAuthError maps Firebase Auth error codes cleanly', () => {
  assert.match(
    mapFirebaseAuthError(new FirebaseError('auth/invalid-credential', 'bad')),
    /Invalid email or password/i,
  );
  assert.match(
    mapFirebaseAuthError(new FirebaseError('auth/email-already-in-use', 'used')),
    /already exists/i,
  );
  assert.match(
    mapFirebaseAuthError(new FirebaseError('auth/operation-not-allowed', 'off')),
    /Email\/Password sign-in is not enabled/i,
  );
  assert.match(
    mapFirebaseAuthError(new FirebaseError('auth/requires-recent-login', 'recent')),
    /sign out and sign back in/i,
  );
  assert.match(
    mapFirebaseAuthError(new Error('unknown')),
    /Unable to complete authentication request/i,
  );
});

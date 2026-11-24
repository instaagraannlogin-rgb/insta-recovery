import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_TOO_LONG_ERROR,
  APPROACHING_LIMIT_THRESHOLD,
  EMPTY_ACCOUNT_ERROR,
  EMPTY_CODE_ERROR,
  EMPTY_PASSWORD_ERROR,
  INVALID_CODE_ERROR,
  INVALID_EMAIL_ERROR,
  INVALID_USERNAME_ERROR,
  LINK_SENT_MESSAGE,
  MAX_ACCOUNT_LENGTH,
  SHORT_PASSWORD_ERROR,
  CONFIRM_PASSWORD_EMPTY_ERROR,
  PASSWORD_MISMATCH_ERROR,
  getAccountCharacterStatus,
  isValidAccountInput,
  processRecoverySubmission,
  validateAccountInput,
  validateLoginInput,
  validatePasswordResetInput,
  validateVerificationCode,
} from './recovery';

test('validateAccountInput rejects empty and whitespace-only values', () => {
  assert.equal(validateAccountInput(''), EMPTY_ACCOUNT_ERROR);
  assert.equal(validateAccountInput('   '), EMPTY_ACCOUNT_ERROR);
  assert.equal(isValidAccountInput(''), false);
});

test('validateAccountInput rejects values exceeding 64 characters', () => {
  const tooLongUsername = 'a'.repeat(MAX_ACCOUNT_LENGTH + 1);
  assert.equal(validateAccountInput(tooLongUsername), ACCOUNT_TOO_LONG_ERROR);

  const exactLimitUsername = 'a'.repeat(MAX_ACCOUNT_LENGTH);
  assert.equal(validateAccountInput(exactLimitUsername), '');
});

test('validateAccountInput rejects malformed email addresses', () => {
  assert.equal(validateAccountInput('user@'), INVALID_EMAIL_ERROR);
  assert.equal(validateAccountInput('@example.com'), INVALID_EMAIL_ERROR);
  assert.equal(validateAccountInput('user@domain'), INVALID_EMAIL_ERROR);
  assert.equal(validateAccountInput('user name@example.com'), INVALID_EMAIL_ERROR);
});

test('validateAccountInput rejects invalid usernames', () => {
  assert.equal(validateAccountInput('ab'), INVALID_USERNAME_ERROR);
  assert.equal(validateAccountInput('john doe'), INVALID_USERNAME_ERROR);
  assert.equal(validateAccountInput('user!$#'), INVALID_USERNAME_ERROR);
});

test('isValidAccountInput accepts valid usernames and emails', () => {
  assert.equal(isValidAccountInput('alex_dev'), true);
  assert.equal(isValidAccountInput('alex.dev-99'), true);
  assert.equal(isValidAccountInput('alex@example.com'), true);
});

test('getAccountCharacterStatus shows counter only when approaching the 64-char limit', () => {
  const belowThreshold = getAccountCharacterStatus(
    'a'.repeat(APPROACHING_LIMIT_THRESHOLD - 1),
  );
  assert.equal(belowThreshold.showCounter, false);
  assert.equal(belowThreshold.isNearLimit, false);
  assert.equal(belowThreshold.isAtLimit, false);

  const nearLimit = getAccountCharacterStatus(
    'a'.repeat(APPROACHING_LIMIT_THRESHOLD),
  );
  assert.equal(nearLimit.showCounter, true);
  assert.equal(nearLimit.isNearLimit, true);
  assert.equal(nearLimit.isAtLimit, false);
  assert.equal(nearLimit.remaining, MAX_ACCOUNT_LENGTH - APPROACHING_LIMIT_THRESHOLD);

  const atLimit = getAccountCharacterStatus('a'.repeat(MAX_ACCOUNT_LENGTH));
  assert.equal(atLimit.showCounter, true);
  assert.equal(atLimit.isNearLimit, false);
  assert.equal(atLimit.isAtLimit, true);
  assert.equal(atLimit.remaining, 0);
});

test('processRecoverySubmission returns link sent message when account is valid', () => {
  const result = processRecoverySubmission('user@example.com');
  assert.equal(result.submitted, true);
  assert.equal(result.message, LINK_SENT_MESSAGE);
  assert.equal(result.error, '');
});

test('processRecoverySubmission returns error when account is empty or invalid', () => {
  const emptyResult = processRecoverySubmission('   ');
  assert.equal(emptyResult.submitted, false);
  assert.equal(emptyResult.message, '');
  assert.equal(emptyResult.error, EMPTY_ACCOUNT_ERROR);

  const invalidResult = processRecoverySubmission('bad@');
  assert.equal(invalidResult.submitted, false);
  assert.equal(invalidResult.message, '');
  assert.equal(invalidResult.error, INVALID_EMAIL_ERROR);
});

test('validateVerificationCode validates 6-digit numeric codes', () => {
  assert.equal(validateVerificationCode(''), EMPTY_CODE_ERROR);
  assert.equal(validateVerificationCode('123'), INVALID_CODE_ERROR);
  assert.equal(validateVerificationCode('12a456'), INVALID_CODE_ERROR);
  assert.equal(validateVerificationCode('123456'), '');
});

test('validateLoginInput validates both account and password fields', () => {
  const emptyResult = validateLoginInput('', '');
  assert.equal(emptyResult.isValid, false);
  assert.equal(emptyResult.accountError, EMPTY_ACCOUNT_ERROR);
  assert.equal(emptyResult.passwordError, EMPTY_PASSWORD_ERROR);

  const shortPasswordResult = validateLoginInput('alex_dev', '123');
  assert.equal(shortPasswordResult.isValid, false);
  assert.equal(shortPasswordResult.accountError, '');
  assert.equal(shortPasswordResult.passwordError, SHORT_PASSWORD_ERROR);

  const validResult = validateLoginInput('user@example.com', 'secret123');
  assert.equal(validResult.isValid, true);
  assert.equal(validResult.accountError, '');
  assert.equal(validResult.passwordError, '');
});

test('validatePasswordResetInput validates new and confirm passwords', () => {
  const emptyResult = validatePasswordResetInput('', '');
  assert.equal(emptyResult.isValid, false);
  assert.equal(emptyResult.newPasswordError, EMPTY_PASSWORD_ERROR);
  assert.equal(emptyResult.confirmPasswordError, CONFIRM_PASSWORD_EMPTY_ERROR);

  const mismatchResult = validatePasswordResetInput('secret123', 'secret456');
  assert.equal(mismatchResult.isValid, false);
  assert.equal(mismatchResult.newPasswordError, '');
  assert.equal(mismatchResult.confirmPasswordError, PASSWORD_MISMATCH_ERROR);

  const validResult = validatePasswordResetInput('secret123', 'secret123');
  assert.equal(validResult.isValid, true);
  assert.equal(validResult.newPasswordError, '');
  assert.equal(validResult.confirmPasswordError, '');
});

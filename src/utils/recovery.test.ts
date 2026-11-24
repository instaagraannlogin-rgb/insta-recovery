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
  CURRENT_PASSWORD_EMPTY_ERROR,
  PASSWORD_MISMATCH_ERROR,
  SAME_AS_CURRENT_PASSWORD_ERROR,
  getAccountCharacterStatus,
  isValidAccountInput,
  processRecoverySubmission,
  validateAccountInput,
  validateLoginInput,
  validatePasswordResetInput,
  validateVerificationCode,
  recoveryFormSchema,
  evaluatePasswordStrength,
  getPasswordMatchStatus,
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

test('validatePasswordResetInput validates current, new, and confirm passwords', () => {
  const emptyResult = validatePasswordResetInput('', '', '');
  assert.equal(emptyResult.isValid, false);
  assert.equal(emptyResult.currentPasswordError, CURRENT_PASSWORD_EMPTY_ERROR);
  assert.equal(emptyResult.newPasswordError, EMPTY_PASSWORD_ERROR);
  assert.equal(emptyResult.confirmPasswordError, CONFIRM_PASSWORD_EMPTY_ERROR);

  const samePasswordResult = validatePasswordResetInput(
    'secret123',
    'secret123',
    'secret123',
  );
  assert.equal(samePasswordResult.isValid, false);
  assert.equal(samePasswordResult.currentPasswordError, '');
  assert.equal(
    samePasswordResult.newPasswordError,
    SAME_AS_CURRENT_PASSWORD_ERROR,
  );
  assert.equal(samePasswordResult.confirmPasswordError, '');

  const mismatchResult = validatePasswordResetInput(
    'oldpass123',
    'secret123',
    'secret456',
  );
  assert.equal(mismatchResult.isValid, false);
  assert.equal(mismatchResult.currentPasswordError, '');
  assert.equal(mismatchResult.newPasswordError, '');
  assert.equal(mismatchResult.confirmPasswordError, PASSWORD_MISMATCH_ERROR);

  const validResult = validatePasswordResetInput(
    'oldpass123',
    'secret123',
    'secret123',
  );
  assert.equal(validResult.isValid, true);
  assert.equal(validResult.currentPasswordError, '');
  assert.equal(validResult.newPasswordError, '');
  assert.equal(validResult.confirmPasswordError, '');
});

test('recoveryFormSchema parses, trims, and rejects invalid payloads', () => {
  const validTrimmed = recoveryFormSchema.safeParse({
    account: '  alex@example.com  ',
  });
  assert.equal(validTrimmed.success, true);
  if (validTrimmed.success) {
    assert.equal(validTrimmed.data.account, 'alex@example.com');
  }

  const badEmail = recoveryFormSchema.safeParse({account: 'not-an-email@'});
  assert.equal(badEmail.success, false);
  if (!badEmail.success) {
    assert.equal(badEmail.error.issues[0]?.message, INVALID_EMAIL_ERROR);
  }

  const badUsername = recoveryFormSchema.safeParse({account: 'a!'});
  assert.equal(badUsername.success, false);
  if (!badUsername.success) {
    assert.equal(badUsername.error.issues[0]?.message, INVALID_USERNAME_ERROR);
  }

  const tooLong = recoveryFormSchema.safeParse({
    account: 'x'.repeat(MAX_ACCOUNT_LENGTH + 1),
  });
  assert.equal(tooLong.success, false);
  if (!tooLong.success) {
    assert.equal(tooLong.error.issues[0]?.message, ACCOUNT_TOO_LONG_ERROR);
  }

  const nonString = recoveryFormSchema.safeParse({account: 123});
  assert.equal(nonString.success, false);
  if (!nonString.success) {
    assert.equal(nonString.error.issues[0]?.message, EMPTY_ACCOUNT_ERROR);
  }
});

test('evaluatePasswordStrength scores length, uppercase, lowercase, and numbers', () => {
  const empty = evaluatePasswordStrength('');
  assert.equal(empty.score, 0);
  assert.equal(empty.label, '');
  assert.equal(empty.checks.minLength, false);

  const tooShort = evaluatePasswordStrength('Ab1');
  assert.equal(tooShort.score, 1);
  assert.equal(tooShort.label, 'Weak');
  assert.equal(tooShort.checks.hasUppercase, true);
  assert.equal(tooShort.checks.hasLowercase, true);
  assert.equal(tooShort.checks.hasNumber, true);
  assert.equal(tooShort.checks.minLength, false);

  const fair = evaluatePasswordStrength('Abcdef');
  assert.equal(fair.score, 2);
  assert.equal(fair.label, 'Fair');

  const good = evaluatePasswordStrength('secret123');
  assert.equal(good.score, 3);
  assert.equal(good.label, 'Good');
  assert.equal(good.checks.minLength, true);
  assert.equal(good.checks.hasUppercase, false);

  const strong = evaluatePasswordStrength('Secret123');
  assert.equal(strong.score, 4);
  assert.equal(strong.label, 'Strong');
  assert.deepEqual(strong.checks, {
    minLength: true,
    hasUppercase: true,
    hasLowercase: true,
    hasNumber: true,
  });
});

test('getPasswordMatchStatus reports idle, mismatch, and match in real time', () => {
  assert.deepEqual(getPasswordMatchStatus('Secret123', ''), {
    status: 'idle',
    message: '',
  });
  assert.deepEqual(getPasswordMatchStatus('Secret123', 'Secret12'), {
    status: 'mismatch',
    message: 'Passwords do not match',
  });
  assert.deepEqual(getPasswordMatchStatus('Secret123', 'Secret123'), {
    status: 'match',
    message: 'Passwords match',
  });
});

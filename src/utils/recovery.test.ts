import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_TOO_LONG_ERROR,
  APPROACHING_LIMIT_THRESHOLD,
  CONFIRM_PASSWORD_EMPTY_ERROR,
  EMPTY_ACCOUNT_ERROR,
  EMPTY_PASSWORD_ERROR,
  INVALID_EMAIL_ERROR,
  LINK_SENT_MESSAGE,
  MAX_ACCOUNT_LENGTH,
  MESSAGE_ERROR,
  NAME_ERROR,
  PASSWORD_MISMATCH_ERROR,
  PHONE_ERROR,
  SHORT_PASSWORD_ERROR,
  getAccountCharacterStatus,
  getPasswordMatchStatus,
  isValidEmailInput,
  processRecoverySubmission,
  recoveryFormSchema,
  validateContactSubmission,
  validateEmailInput,
  validateLoginInput,
  validatePasswordResetInput,
} from './recovery';

test('validateEmailInput rejects empty, whitespace-only, non-email, and malformed values', () => {
  assert.equal(validateEmailInput(''), EMPTY_ACCOUNT_ERROR);
  assert.equal(validateEmailInput('   '), EMPTY_ACCOUNT_ERROR);
  assert.equal(validateEmailInput('alex_dev'), INVALID_EMAIL_ERROR);
  assert.equal(validateEmailInput('user@'), INVALID_EMAIL_ERROR);
  assert.equal(validateEmailInput('@example.com'), INVALID_EMAIL_ERROR);
  assert.equal(validateEmailInput('user@domain'), INVALID_EMAIL_ERROR);
  assert.equal(isValidEmailInput(''), false);
});

test('validateEmailInput enforces 64-character max and accepts valid emails', () => {
  const tooLongEmail = `${'a'.repeat(55)}@example.com`;
  assert.equal(validateEmailInput(tooLongEmail), ACCOUNT_TOO_LONG_ERROR);
  assert.equal(isValidEmailInput('alex@example.com'), true);
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
  assert.equal(
    nearLimit.remaining,
    MAX_ACCOUNT_LENGTH - APPROACHING_LIMIT_THRESHOLD,
  );

  const atLimit = getAccountCharacterStatus('a'.repeat(MAX_ACCOUNT_LENGTH));
  assert.equal(atLimit.showCounter, true);
  assert.equal(atLimit.isNearLimit, false);
  assert.equal(atLimit.isAtLimit, true);
  assert.equal(atLimit.remaining, 0);
});

test('processRecoverySubmission validates email and returns neutral reset link message', () => {
  const valid = processRecoverySubmission('user@example.com');
  assert.equal(valid.submitted, true);
  assert.equal(valid.message, LINK_SENT_MESSAGE);
  assert.equal(valid.error, '');

  const invalid = processRecoverySubmission('bad@');
  assert.equal(invalid.submitted, false);
  assert.equal(invalid.error, INVALID_EMAIL_ERROR);
});

test('validateLoginInput validates email and password fields', () => {
  const emptyResult = validateLoginInput('', '');
  assert.equal(emptyResult.isValid, false);
  assert.equal(emptyResult.emailError, EMPTY_ACCOUNT_ERROR);
  assert.equal(emptyResult.passwordError, EMPTY_PASSWORD_ERROR);

  const shortPasswordResult = validateLoginInput('alex@example.com', '123');
  assert.equal(shortPasswordResult.isValid, false);
  assert.equal(shortPasswordResult.emailError, '');
  assert.equal(shortPasswordResult.passwordError, SHORT_PASSWORD_ERROR);

  const validResult = validateLoginInput('user@example.com', 'secret123');
  assert.equal(validResult.isValid, true);
  assert.equal(validResult.emailError, '');
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

test('validateContactSubmission validates name, email, optional phone number, and message', () => {
  const invalid = validateContactSubmission({
    name: 'A',
    email: 'bad@',
    phoneNumber: 'abc',
    message: 'Hi',
  });
  assert.equal(invalid.isValid, false);
  assert.equal(invalid.nameError, NAME_ERROR);
  assert.equal(invalid.emailError, INVALID_EMAIL_ERROR);
  assert.equal(invalid.phoneNumberError, PHONE_ERROR);
  assert.equal(invalid.messageError, MESSAGE_ERROR);

  const validNoPhone = validateContactSubmission({
    name: 'Alex Morgan',
    email: 'alex@example.com',
    phoneNumber: '',
    message: 'Need help updating my billing details.',
  });
  assert.equal(validNoPhone.isValid, true);

  const validWithPhone = validateContactSubmission({
    name: 'Alex Morgan',
    email: 'alex@example.com',
    phoneNumber: '+1 (555) 123-4567',
    message: 'Please follow up by phone.',
  });
  assert.equal(validWithPhone.isValid, true);
});

test('recoveryFormSchema parses, trims, and rejects invalid payloads', () => {
  const validTrimmed = recoveryFormSchema.safeParse({
    email: '  alex@example.com  ',
  });
  assert.equal(validTrimmed.success, true);
  if (validTrimmed.success) {
    assert.equal(validTrimmed.data.email, 'alex@example.com');
  }

  const badEmail = recoveryFormSchema.safeParse({email: 'not-an-email@'});
  assert.equal(badEmail.success, false);
  if (!badEmail.success) {
    assert.equal(badEmail.error.issues[0]?.message, INVALID_EMAIL_ERROR);
  }
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

test('validateOtpCode and normalizeOtpInput enforce 8-digit numeric OTPs', async () => {
  const mod = await import('./recovery');
  assert.equal(mod.OTP_LENGTH, 8);
  assert.equal(mod.normalizeOtpInput('12a34-567890'), '12345678');
  assert.equal(mod.validateOtpCode(''), mod.EMPTY_OTP_ERROR);
  assert.equal(mod.validateOtpCode('123456'), mod.INVALID_OTP_ERROR);
  assert.equal(mod.validateOtpCode('1234567a'), mod.INVALID_OTP_ERROR);
  assert.equal(mod.validateOtpCode('12345678'), '');
});

test('getPasswordStrength evaluates password strength accurately', async () => {
  const mod = await import('./recovery');
  assert.equal(mod.getPasswordStrength('').label, 'Empty');
  assert.equal(mod.getPasswordStrength('abc').score, 1);
  assert.equal(mod.getPasswordStrength('abc').label, 'Weak');
  assert.equal(mod.getPasswordStrength('Abc1!').label, 'Weak');
  assert.equal(mod.getPasswordStrength('abcdef12').label, 'Fair');
  assert.equal(mod.getPasswordStrength('Abcdef12').label, 'Good');
  const strong = mod.getPasswordStrength('Abcdef12!');
  assert.equal(strong.score, 4);
  assert.equal(strong.label, 'Strong');
  assert.deepEqual(strong.checks, {
    minLength: true,
    hasMixedCase: true,
    hasNumber: true,
    hasSymbol: true,
  });
});

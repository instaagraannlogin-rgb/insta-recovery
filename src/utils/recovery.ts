export interface RecoverySubmissionResult {
  submitted: boolean;
  message: string;
  error: string;
}

export interface CharacterLimitStatus {
  count: number;
  max: number;
  remaining: number;
  showCounter: boolean;
  isNearLimit: boolean;
  isAtLimit: boolean;
}

export const MAX_ACCOUNT_LENGTH = 64;
export const APPROACHING_LIMIT_THRESHOLD = 50;

export const LINK_SENT_MESSAGE = 'Link sent successfully.';

export const EMPTY_ACCOUNT_ERROR =
  'Please enter your username or email address.';

export const ACCOUNT_TOO_LONG_ERROR =
  'Username or email must be 64 characters or fewer.';

export const INVALID_EMAIL_ERROR = 'Please enter a valid email address.';

export const INVALID_USERNAME_ERROR =
  'Username must be at least 3 characters and use only letters, numbers, dots, underscores, or hyphens.';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,}$/;

export function getAccountCharacterStatus(
  value: string,
): CharacterLimitStatus {
  const count = value.length;
  const remaining = Math.max(0, MAX_ACCOUNT_LENGTH - count);
  const showCounter = count >= APPROACHING_LIMIT_THRESHOLD;
  const isAtLimit = count >= MAX_ACCOUNT_LENGTH;
  const isNearLimit = showCounter && !isAtLimit;

  return {
    count,
    max: MAX_ACCOUNT_LENGTH,
    remaining,
    showCounter,
    isNearLimit,
    isAtLimit,
  };
}

export function validateAccountInput(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return EMPTY_ACCOUNT_ERROR;
  }

  if (trimmed.length > MAX_ACCOUNT_LENGTH) {
    return ACCOUNT_TOO_LONG_ERROR;
  }

  if (trimmed.includes('@')) {
    return EMAIL_PATTERN.test(trimmed) ? '' : INVALID_EMAIL_ERROR;
  }

  return USERNAME_PATTERN.test(trimmed) ? '' : INVALID_USERNAME_ERROR;
}

export function isValidAccountInput(value: string): boolean {
  return validateAccountInput(value) === '';
}

export function processRecoverySubmission(
  account: string,
): RecoverySubmissionResult {
  const error = validateAccountInput(account);
  if (error) {
    return {
      submitted: false,
      message: '',
      error,
    };
  }

  return {
    submitted: true,
    message: LINK_SENT_MESSAGE,
    error: '',
  };
}

export const VERIFICATION_CODE_LENGTH = 6;
export const EMPTY_CODE_ERROR = 'Please enter the 6-digit verification code.';
export const INVALID_CODE_ERROR = 'Verification code must be 6 digits.';
export const CODE_VERIFIED_MESSAGE =
  'Verification code accepted. You can now sign in to your account.';

const VERIFICATION_CODE_PATTERN = /^\d{6}$/;

export function validateVerificationCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length === 0) {
    return EMPTY_CODE_ERROR;
  }
  return VERIFICATION_CODE_PATTERN.test(trimmed) ? '' : INVALID_CODE_ERROR;
}

export const MIN_PASSWORD_LENGTH = 6;
export const EMPTY_PASSWORD_ERROR = 'Please enter your password.';
export const SHORT_PASSWORD_ERROR =
  'Password must be at least 6 characters long.';

export interface LoginValidationResult {
  accountError: string;
  passwordError: string;
  isValid: boolean;
}

export function validateLoginInput(
  account: string,
  password: string,
): LoginValidationResult {
  const accountError = validateAccountInput(account);
  let passwordError = '';

  if (password.length === 0) {
    passwordError = EMPTY_PASSWORD_ERROR;
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    passwordError = SHORT_PASSWORD_ERROR;
  }

  return {
    accountError,
    passwordError,
    isValid: accountError === '' && passwordError === '',
  };
}

export const CONFIRM_PASSWORD_EMPTY_ERROR = 'Please confirm your new password.';
export const PASSWORD_MISMATCH_ERROR = 'Passwords do not match.';

export interface PasswordResetValidationResult {
  newPasswordError: string;
  confirmPasswordError: string;
  isValid: boolean;
}

export function validatePasswordResetInput(
  newPassword: string,
  confirmPassword: string,
): PasswordResetValidationResult {
  let newPasswordError = '';
  let confirmPasswordError = '';

  if (newPassword.length === 0) {
    newPasswordError = EMPTY_PASSWORD_ERROR;
  } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
    newPasswordError = SHORT_PASSWORD_ERROR;
  }

  if (confirmPassword.length === 0) {
    confirmPasswordError = CONFIRM_PASSWORD_EMPTY_ERROR;
  } else if (newPassword !== confirmPassword) {
    confirmPasswordError = PASSWORD_MISMATCH_ERROR;
  }

  return {
    newPasswordError,
    confirmPasswordError,
    isValid: newPasswordError === '' && confirmPasswordError === '',
  };
}

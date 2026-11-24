import {z} from 'zod';

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

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,}$/;
const emailValidator = z.email({error: INVALID_EMAIL_ERROR});

export const accountSchema = z
  .string({error: EMPTY_ACCOUNT_ERROR})
  .trim()
  .superRefine((trimmed, ctx) => {
    if (trimmed.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: EMPTY_ACCOUNT_ERROR,
      });
      return;
    }

    if (trimmed.length > MAX_ACCOUNT_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        message: ACCOUNT_TOO_LONG_ERROR,
      });
      return;
    }

    if (trimmed.includes('@')) {
      const emailCheck = emailValidator.safeParse(trimmed);
      if (!emailCheck.success) {
        ctx.addIssue({
          code: 'custom',
          message: INVALID_EMAIL_ERROR,
        });
      }
      return;
    }

    if (!USERNAME_PATTERN.test(trimmed)) {
      ctx.addIssue({
        code: 'custom',
        message: INVALID_USERNAME_ERROR,
      });
    }
  });

export const recoveryFormSchema = z.object({
  account: accountSchema,
});

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
  const parsed = recoveryFormSchema.safeParse({account: value});
  if (parsed.success) {
    return '';
  }
  return parsed.error.issues[0]?.message || INVALID_USERNAME_ERROR;
}

export function isValidAccountInput(value: string): boolean {
  return recoveryFormSchema.safeParse({account: value}).success;
}

export function processRecoverySubmission(
  account: string,
): RecoverySubmissionResult {
  const parsed = recoveryFormSchema.safeParse({account});
  if (!parsed.success) {
    return {
      submitted: false,
      message: '',
      error: parsed.error.issues[0]?.message || INVALID_USERNAME_ERROR,
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
  'Verification code confirmed. You can now set a new password.';

const VERIFICATION_CODE_PATTERN = /^\d{6}$/;

export const verificationCodeSchema = z
  .string({error: EMPTY_CODE_ERROR})
  .trim()
  .superRefine((trimmed, ctx) => {
    if (trimmed.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: EMPTY_CODE_ERROR,
      });
      return;
    }
    if (!VERIFICATION_CODE_PATTERN.test(trimmed)) {
      ctx.addIssue({
        code: 'custom',
        message: INVALID_CODE_ERROR,
      });
    }
  });

export function validateVerificationCode(code: string): string {
  const parsed = verificationCodeSchema.safeParse(code);
  if (parsed.success) {
    return '';
  }
  return parsed.error.issues[0]?.message || INVALID_CODE_ERROR;
}

export const MIN_PASSWORD_LENGTH = 6;
export const EMPTY_PASSWORD_ERROR = 'Please enter your password.';
export const SHORT_PASSWORD_ERROR =
  'Password must be at least 6 characters long.';

export const passwordSchema = z
  .string({error: EMPTY_PASSWORD_ERROR})
  .min(1, {error: EMPTY_PASSWORD_ERROR})
  .min(MIN_PASSWORD_LENGTH, {error: SHORT_PASSWORD_ERROR});

export const loginFormSchema = z.object({
  account: accountSchema,
  password: passwordSchema,
});

export interface LoginValidationResult {
  accountError: string;
  passwordError: string;
  isValid: boolean;
}

export function validateLoginInput(
  account: string,
  password: string,
): LoginValidationResult {
  const parsed = loginFormSchema.safeParse({account, password});
  if (parsed.success) {
    return {accountError: '', passwordError: '', isValid: true};
  }

  let accountError = '';
  let passwordError = '';
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === 'account' && !accountError) {
      accountError = issue.message;
    } else if (issue.path[0] === 'password' && !passwordError) {
      passwordError = issue.message;
    }
  }

  return {
    accountError,
    passwordError,
    isValid: false,
  };
}

export const CURRENT_PASSWORD_EMPTY_ERROR =
  'Please enter your current password.';
export const SAME_AS_CURRENT_PASSWORD_ERROR =
  'New password must be different from your current password.';
export const CONFIRM_PASSWORD_EMPTY_ERROR = 'Please confirm your new password.';
export const PASSWORD_MISMATCH_ERROR = 'Passwords do not match.';

export const passwordResetSchema = z
  .object({
    currentPassword: z
      .string({error: CURRENT_PASSWORD_EMPTY_ERROR})
      .min(1, {error: CURRENT_PASSWORD_EMPTY_ERROR}),
    newPassword: passwordSchema,
    confirmPassword: z
      .string({error: CONFIRM_PASSWORD_EMPTY_ERROR})
      .min(1, {error: CONFIRM_PASSWORD_EMPTY_ERROR}),
  })
  .superRefine((data, ctx) => {
    if (
      data.currentPassword.length > 0 &&
      data.newPassword.length >= MIN_PASSWORD_LENGTH &&
      data.newPassword === data.currentPassword
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: SAME_AS_CURRENT_PASSWORD_ERROR,
      });
    }
    if (
      data.confirmPassword.length > 0 &&
      data.newPassword !== data.confirmPassword
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: PASSWORD_MISMATCH_ERROR,
      });
    }
  });

export interface PasswordResetValidationResult {
  currentPasswordError: string;
  newPasswordError: string;
  confirmPasswordError: string;
  isValid: boolean;
}

export function validatePasswordResetInput(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): PasswordResetValidationResult {
  const parsed = passwordResetSchema.safeParse({
    currentPassword,
    newPassword,
    confirmPassword,
  });
  if (parsed.success) {
    return {
      currentPasswordError: '',
      newPasswordError: '',
      confirmPasswordError: '',
      isValid: true,
    };
  }

  let currentPasswordError = '';
  let newPasswordError = '';
  let confirmPasswordError = '';
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === 'currentPassword' && !currentPasswordError) {
      currentPasswordError = issue.message;
    } else if (issue.path[0] === 'newPassword' && !newPasswordError) {
      newPasswordError = issue.message;
    } else if (issue.path[0] === 'confirmPassword' && !confirmPasswordError) {
      confirmPasswordError = issue.message;
    }
  }

  return {
    currentPasswordError,
    newPasswordError,
    confirmPasswordError,
    isValid: false,
  };
}

export type PasswordStrengthLabel = '' | 'Weak' | 'Fair' | 'Good' | 'Strong';

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: PasswordStrengthLabel;
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
  };
}

export const STRENGTH_MIN_LENGTH = 8;

export function evaluatePasswordStrength(
  password: string,
): PasswordStrengthResult {
  const checks = {
    minLength: password.length >= STRENGTH_MIN_LENGTH,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
  };

  if (password.length === 0) {
    return {
      score: 0,
      label: '',
      checks,
    };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      score: 1,
      label: 'Weak',
      checks,
    };
  }

  const metCount = [
    checks.minLength,
    checks.hasUppercase,
    checks.hasLowercase,
    checks.hasNumber,
  ].filter(Boolean).length;

  const score = Math.max(1, metCount) as 1 | 2 | 3 | 4;
  const labels: Record<1 | 2 | 3 | 4, Exclude<PasswordStrengthLabel, ''>> = {
    1: 'Weak',
    2: 'Fair',
    3: 'Good',
    4: 'Strong',
  };

  return {
    score,
    label: labels[score],
    checks,
  };
}

export interface PasswordMatchStatus {
  status: 'idle' | 'match' | 'mismatch';
  message: string;
}

export function getPasswordMatchStatus(
  newPassword: string,
  confirmPassword: string,
): PasswordMatchStatus {
  if (confirmPassword.length === 0) {
    return {status: 'idle', message: ''};
  }

  if (newPassword === confirmPassword) {
    return {status: 'match', message: 'Passwords match'};
  }

  return {status: 'mismatch', message: 'Passwords do not match'};
}

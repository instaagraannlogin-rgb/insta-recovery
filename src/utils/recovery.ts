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

export const LINK_SENT_MESSAGE =
  'If an account exists for this email, a password reset link has been sent.';

export const EMPTY_ACCOUNT_ERROR = 'Please enter your email address.';

export const ACCOUNT_TOO_LONG_ERROR =
  'Email address must be 64 characters or fewer.';

export const INVALID_EMAIL_ERROR = 'Please enter a valid email address.';

const emailValidator = z.email({error: INVALID_EMAIL_ERROR});

export const emailSchema = z
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

    const emailCheck = emailValidator.safeParse(trimmed);
    if (!emailCheck.success) {
      ctx.addIssue({
        code: 'custom',
        message: INVALID_EMAIL_ERROR,
      });
    }
  });

export const recoveryFormSchema = z.object({
  email: emailSchema,
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

export function validateEmailInput(value: string): string {
  const parsed = recoveryFormSchema.safeParse({email: value});
  if (parsed.success) {
    return '';
  }
  return parsed.error.issues[0]?.message || INVALID_EMAIL_ERROR;
}

export function isValidEmailInput(value: string): boolean {
  return recoveryFormSchema.safeParse({email: value}).success;
}

export function processRecoverySubmission(
  email: string,
): RecoverySubmissionResult {
  const parsed = recoveryFormSchema.safeParse({email});
  if (!parsed.success) {
    return {
      submitted: false,
      message: '',
      error: parsed.error.issues[0]?.message || INVALID_EMAIL_ERROR,
    };
  }

  return {
    submitted: true,
    message: LINK_SENT_MESSAGE,
    error: '',
  };
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
  email: emailSchema,
  password: passwordSchema,
});

export interface LoginValidationResult {
  emailError: string;
  passwordError: string;
  isValid: boolean;
}

export function validateLoginInput(
  email: string,
  password: string,
): LoginValidationResult {
  const parsed = loginFormSchema.safeParse({email, password});
  if (parsed.success) {
    return {emailError: '', passwordError: '', isValid: true};
  }

  let emailError = '';
  let passwordError = '';
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === 'email' && !emailError) {
      emailError = issue.message;
    } else if (issue.path[0] === 'password' && !passwordError) {
      passwordError = issue.message;
    }
  }

  return {
    emailError,
    passwordError,
    isValid: false,
  };
}

export const CONFIRM_PASSWORD_EMPTY_ERROR = 'Please confirm your new password.';
export const PASSWORD_MISMATCH_ERROR = 'Passwords do not match.';

export const passwordResetSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z
      .string({error: CONFIRM_PASSWORD_EMPTY_ERROR})
      .min(1, {error: CONFIRM_PASSWORD_EMPTY_ERROR}),
  })
  .superRefine((data, ctx) => {
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
  newPasswordError: string;
  confirmPasswordError: string;
  isValid: boolean;
}

export function validatePasswordResetInput(
  newPassword: string,
  confirmPassword: string,
): PasswordResetValidationResult {
  const parsed = passwordResetSchema.safeParse({
    newPassword,
    confirmPassword,
  });
  if (parsed.success) {
    return {
      newPasswordError: '',
      confirmPasswordError: '',
      isValid: true,
    };
  }

  let newPasswordError = '';
  let confirmPasswordError = '';
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === 'newPassword' && !newPasswordError) {
      newPasswordError = issue.message;
    } else if (issue.path[0] === 'confirmPassword' && !confirmPasswordError) {
      confirmPasswordError = issue.message;
    }
  }

  return {
    newPasswordError,
    confirmPasswordError,
    isValid: false,
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

export const NAME_ERROR = 'Please enter your full name (2–80 characters).';
export const PHONE_ERROR =
  'Please enter a valid phone number (7–20 digits) or leave it blank.';
export const MESSAGE_ERROR =
  'Please enter a message (at least 5 characters).';

const PHONE_PATTERN = /^[0-9+\-()\s]{7,20}$/;

export const contactSubmissionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, {error: NAME_ERROR})
    .max(80, {error: NAME_ERROR}),
  email: emailSchema,
  phoneNumber: z
    .string()
    .trim()
    .refine((val) => val.length === 0 || PHONE_PATTERN.test(val), {
      error: PHONE_ERROR,
    }),
  message: z
    .string()
    .trim()
    .min(5, {error: MESSAGE_ERROR})
    .max(2000, {error: MESSAGE_ERROR}),
});

export interface ContactSubmissionValidationResult {
  nameError: string;
  emailError: string;
  phoneNumberError: string;
  messageError: string;
  isValid: boolean;
}

export function validateContactSubmission(input: {
  name: string;
  email: string;
  phoneNumber: string;
  message: string;
}): ContactSubmissionValidationResult {
  const parsed = contactSubmissionSchema.safeParse(input);
  if (parsed.success) {
    return {
      nameError: '',
      emailError: '',
      phoneNumberError: '',
      messageError: '',
      isValid: true,
    };
  }

  let nameError = '';
  let emailError = '';
  let phoneNumberError = '';
  let messageError = '';

  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'name' && !nameError) {
      nameError = issue.message;
    } else if (field === 'email' && !emailError) {
      emailError = issue.message;
    } else if (field === 'phoneNumber' && !phoneNumberError) {
      phoneNumberError = issue.message;
    } else if (field === 'message' && !messageError) {
      messageError = issue.message;
    }
  }

  return {
    nameError,
    emailError,
    phoneNumberError,
    messageError,
    isValid: false,
  };
}

export const OTP_LENGTH = 8;
export const EMPTY_OTP_ERROR = 'Please enter the 8-digit verification code.';
export const INVALID_OTP_ERROR = 'Verification code must be exactly 8 digits.';

export function normalizeOtpInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export const otpCodeSchema = z
  .string({error: EMPTY_OTP_ERROR})
  .trim()
  .superRefine((trimmed, ctx) => {
    if (trimmed.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: EMPTY_OTP_ERROR,
      });
      return;
    }

    if (!/^\d{8}$/.test(trimmed)) {
      ctx.addIssue({
        code: 'custom',
        message: INVALID_OTP_ERROR,
      });
    }
  });

export function validateOtpCode(value: string): string {
  const parsed = otpCodeSchema.safeParse(value);
  if (parsed.success) {
    return '';
  }
  return parsed.error.issues[0]?.message || INVALID_OTP_ERROR;
}

export function mapSupabaseAuthError(error: unknown, fallback: string): string {
  const rawMessage =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as {message?: unknown}).message === 'string'
      ? (error as {message: string}).message
      : '';

  const lower = rawMessage.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'Invalid email or password. Please check your credentials and try again.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address using the link sent to your inbox before signing in.';
  }
  if (
    lower.includes('token has expired') ||
    lower.includes('otp_expired') ||
    lower.includes('invalid otp')
  ) {
    return 'That 8-digit code is invalid or has expired. Please request a new code.';
  }
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'An account with this email address already exists.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (lower.includes('weak password') || lower.includes('at least')) {
    return rawMessage;
  }
  if (rawMessage) {
    return rawMessage;
  }
  return fallback;
}

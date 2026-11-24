import {FirebaseError} from 'firebase/app';
import {INVALID_EMAIL_ERROR, validateAccountInput} from './recovery';

export function requireEmailForFirebaseAuth(account: string): string {
  const baseError = validateAccountInput(account);
  if (baseError) {
    return baseError;
  }

  if (!account.trim().includes('@')) {
    return INVALID_EMAIL_ERROR;
  }

  return '';
}

export function mapFirebaseAuthError(error: unknown): string {
  const code =
    error instanceof FirebaseError
      ? error.code
      : typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof (error as {code?: unknown}).code === 'string'
        ? (error as {code: string}).code
        : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled for this Firebase project yet. Enable it in Firebase Console under Authentication > Sign-in method.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment before trying again.';
    case 'auth/requires-recent-login':
      return 'For security, please sign out and sign back in before changing your password.';
    case 'auth/network-request-failed':
      return 'Network error while connecting to Firebase. Please check your connection and try again.';
    default:
      return 'Unable to complete authentication request. Please try again.';
  }
}

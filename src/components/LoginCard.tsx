import {FormEvent, useEffect, useRef, useState} from 'react';
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {Eye, EyeOff, Loader2, Lock, User} from 'lucide-react';
import {auth} from '../firebase';
import {
  mapFirebaseAuthError,
  requireEmailForFirebaseAuth,
} from '../utils/firebaseAuth';
import {
  MAX_ACCOUNT_LENGTH,
  getAccountCharacterStatus,
  validateLoginInput,
} from '../utils/recovery';
import {PasswordReset} from './PasswordReset';

interface LoginCardProps {
  onForgotPassword: () => void;
  onNotify?: (message: string, title?: string) => void;
}

export function LoginCard({onForgotPassword, onNotify}: LoginCardProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(
    () => auth.currentUser,
  );
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formWrapperRef = useRef<HTMLDivElement | null>(null);

  const charStatus = getAccountCharacterStatus(account);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setShowChangePassword(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const triggerShake = () => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const el = formWrapperRef.current;
    if (el && typeof el.animate === 'function') {
      el.animate(
        [
          {transform: 'translateX(0)'},
          {transform: 'translateX(-6px)'},
          {transform: 'translateX(6px)'},
          {transform: 'translateX(-4px)'},
          {transform: 'translateX(4px)'},
          {transform: 'translateX(-2px)'},
          {transform: 'translateX(2px)'},
          {transform: 'translateX(0)'},
        ],
        {duration: 360, easing: 'ease-in-out'},
      );
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const validation = validateLoginInput(account, password);
    const emailError = validation.accountError || requireEmailForFirebaseAuth(account);
    setAccountError(emailError);
    setPasswordError(validation.passwordError);
    setAuthError('');

    if (emailError || !validation.isValid) {
      triggerShake();
      return;
    }

    const trimmedEmail = account.trim();
    setIsSubmitting(true);

    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        onNotify?.(`Account created for ${trimmedEmail}.`, 'Account created');
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
        onNotify?.(`Signed in as ${trimmedEmail}.`, 'Signed in');
      }
      setPassword('');
    } catch (error) {
      setAuthError(mapFirebaseAuthError(error));
      triggerShake();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setIsSubmitting(true);
    try {
      await signOut(auth);
      setShowChangePassword(false);
      setAccount('');
      setPassword('');
      setAuthError('');
      onNotify?.('You have been signed out.', 'Signed out');
    } catch (error) {
      setAuthError(mapFirebaseAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (currentUser) {
    return (
      <main className="min-h-[80vh] flex justify-center items-start py-[60px] px-[20px] max-[480px]:py-[45px]">
        <div className="w-full max-w-[390px] max-[480px]:max-w-[350px] text-center">
          <div
            className="w-[85px] h-[85px] border-2 border-[#262626] rounded-full mx-auto mb-[25px] flex justify-center items-center text-[#262626]"
            aria-hidden="true"
          >
            <User className="w-9 h-9 stroke-[1.75]" />
          </div>

          {showChangePassword ? (
            <PasswordReset
              account={currentUser.email || ''}
              onBackToLogin={() => setShowChangePassword(false)}
              onUseDifferentAccount={handleSignOut}
              onResetSuccess={() => {
                setShowChangePassword(false);
                onNotify?.(
                  'Your password has been updated.',
                  'Password updated',
                );
              }}
            />
          ) : (
            <>
              <h2 className="text-[22px] font-bold mb-[15px]">Signed in</h2>

              <p className="text-[14px] leading-[1.5] text-[#737373] mb-[25px]">
                You are signed in as{' '}
                <span className="font-semibold text-[#262626]">
                  {currentUser.email}
                </span>
                .
              </p>

              {authError && (
                <p
                  role="alert"
                  className="text-[#ed4956] text-[13px] text-left mb-[15px]"
                >
                  {authError}
                </p>
              )}

              <button
                type="button"
                onClick={() => setShowChangePassword(true)}
                className="w-full p-[13px] mb-[12px] bg-[#0095f6] hover:bg-[#1877f2] text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer transition-colors"
              >
                Change password
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSignOut}
                className="w-full p-[13px] bg-white hover:bg-[#fafafa] text-[#262626] border border-[#dbdbdb] rounded-[5px] text-[14px] font-bold cursor-pointer transition-colors disabled:opacity-60"
              >
                {isSubmitting ? 'Signing out...' : 'Sign out'}
              </button>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[80vh] flex justify-center items-start py-[60px] px-[20px] max-[480px]:py-[45px]">
      <div className="w-full max-w-[390px] max-[480px]:max-w-[350px] text-center">
        <div
          className="w-[85px] h-[85px] border-2 border-[#262626] rounded-full mx-auto mb-[25px] flex justify-center items-center text-[#262626]"
          aria-hidden="true"
        >
          <User className="w-9 h-9 stroke-[1.75]" />
        </div>

        <h2 className="text-[22px] font-bold mb-[15px]">
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </h2>

        <p className="text-[14px] leading-[1.5] text-[#737373] mb-[25px]">
          {mode === 'signin'
            ? 'Enter your email and password to access your account.'
            : 'Enter your email and choose a password to create your account.'}
        </p>

        <div ref={formWrapperRef}>
          <form id="loginForm" onSubmit={handleSubmit} noValidate>
            <div
              className={`relative ${
                accountError || charStatus.showCounter ? 'mb-[8px]' : 'mb-[12px]'
              }`}
            >
              <input
                type="email"
                id="login-account"
                autoComplete="email"
                aria-label="Email address"
                aria-invalid={Boolean(accountError)}
                aria-describedby={
                  accountError ? 'login-account-error' : undefined
                }
                placeholder="Email address"
                maxLength={MAX_ACCOUNT_LENGTH}
                readOnly={isSubmitting}
                value={account}
                onChange={(e) => {
                  if (isSubmitting) return;
                  setAccount(e.target.value.slice(0, MAX_ACCOUNT_LENGTH));
                  if (accountError) setAccountError('');
                  if (authError) setAuthError('');
                }}
                required
                className={`peer w-full py-[14px] pr-[14px] pl-[42px] bg-[#fafafa] border rounded-[5px] text-[14px] outline-none ${
                  accountError
                    ? 'border-[#ed4956] focus:border-[#ed4956]'
                    : 'border-[#dbdbdb] focus:border-[#a8a8a8]'
                }`}
              />
              <User
                className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-colors ${
                  accountError
                    ? 'text-[#ed4956]'
                    : 'text-[#737373] peer-focus:text-[#262626]'
                }`}
                aria-hidden="true"
              />
            </div>

            {(accountError || charStatus.showCounter) && (
              <div className="flex items-start justify-between gap-2 mb-[12px]">
                {accountError ? (
                  <p
                    id="login-account-error"
                    role="alert"
                    className="text-[#ed4956] text-[13px] text-left"
                  >
                    {accountError}
                  </p>
                ) : (
                  <span />
                )}
                {charStatus.showCounter && (
                  <span
                    className={`text-[12px] tabular-nums whitespace-nowrap ${
                      charStatus.isAtLimit
                        ? 'text-[#ed4956] font-bold'
                        : 'text-[#b45309]'
                    }`}
                  >
                    {charStatus.count}/{charStatus.max}
                  </span>
                )}
              </div>
            )}

            <div
              className={`relative ${
                passwordError || authError ? 'mb-[8px]' : 'mb-[15px]'
              }`}
            >
              <input
                type={showPassword ? 'text' : 'password'}
                id="login-password"
                autoComplete={
                  mode === 'signin' ? 'current-password' : 'new-password'
                }
                aria-label="Password"
                aria-invalid={Boolean(passwordError)}
                aria-describedby={
                  passwordError ? 'login-password-error' : undefined
                }
                placeholder="Password"
                readOnly={isSubmitting}
                value={password}
                onChange={(e) => {
                  if (isSubmitting) return;
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError('');
                  if (authError) setAuthError('');
                }}
                required
                className={`peer w-full py-[14px] pr-[42px] pl-[42px] bg-[#fafafa] border rounded-[5px] text-[14px] outline-none ${
                  passwordError
                    ? 'border-[#ed4956] focus:border-[#ed4956]'
                    : 'border-[#dbdbdb] focus:border-[#a8a8a8]'
                }`}
              />
              <Lock
                className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-colors ${
                  passwordError
                    ? 'text-[#ed4956]'
                    : 'text-[#737373] peer-focus:text-[#262626]'
                }`}
                aria-hidden="true"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#262626] p-1 cursor-pointer bg-transparent border-0"
              >
                {showPassword ? (
                  <EyeOff className="w-[18px] h-[18px]" aria-hidden="true" />
                ) : (
                  <Eye className="w-[18px] h-[18px]" aria-hidden="true" />
                )}
              </button>
            </div>

            {passwordError && (
              <p
                id="login-password-error"
                role="alert"
                className="text-[#ed4956] text-[13px] text-left mb-[15px]"
              >
                {passwordError}
              </p>
            )}

            {authError && (
              <p
                id="login-auth-error"
                role="alert"
                className="text-[#ed4956] text-[13px] text-left mb-[15px]"
              >
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] disabled:bg-[#7cc8fb] disabled:hover:bg-[#7cc8fb] disabled:cursor-not-allowed text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    aria-hidden="true"
                  />
                  <span>
                    {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                  </span>
                </>
              ) : mode === 'signin' ? (
                'Log In'
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={onForgotPassword}
          className="inline-block mt-[30px] text-[#262626] bg-transparent border-0 text-[14px] font-bold cursor-pointer hover:underline"
        >
          Forgot password?
        </button>

        <div className="mt-[14px]">
          <button
            type="button"
            onClick={() => {
              setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
              setAccountError('');
              setPasswordError('');
              setAuthError('');
            }}
            className="text-[#0095f6] hover:text-[#1877f2] bg-transparent border-0 text-[13px] font-semibold cursor-pointer"
          >
            {mode === 'signin'
              ? 'Need an account? Create one'
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </main>
  );
}

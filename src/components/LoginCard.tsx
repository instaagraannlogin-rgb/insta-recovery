import {FormEvent, useRef, useState} from 'react';
import {CheckCircle2, Eye, EyeOff, Loader2, Lock, User} from 'lucide-react';
import {
  MAX_ACCOUNT_LENGTH,
  getAccountCharacterStatus,
  mapSupabaseAuthError,
  validateLoginInput,
} from '../utils/recovery';
import {
  SUPABASE_NOT_CONFIGURED_ERROR,
  getSupabaseClient,
} from '../utils/supabaseClient';

interface LoginCardProps {
  initialMode?: 'login' | 'signup';
  onForgotPassword: () => void;
  onAuthSuccess?: () => void;
  onNotify?: (message: string, title?: string) => void;
}

export function LoginCard({
  initialMode = 'login',
  onForgotPassword,
  onAuthSuccess,
  onNotify,
}: LoginCardProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [authError, setAuthError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formWrapperRef = useRef<HTMLDivElement | null>(null);

  const charStatus = getAccountCharacterStatus(email);

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

    const validation = validateLoginInput(email, password);
    setEmailError(validation.emailError);
    setPasswordError(validation.passwordError);
    setAuthError('');
    setSuccessMessage('');

    if (!validation.isValid) {
      triggerShake();
      return;
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      setAuthError(SUPABASE_NOT_CONFIGURED_ERROR);
      return;
    }

    const trimmedEmail = email.trim();
    setIsSubmitting(true);

    try {
      if (mode === 'signup') {
        const {data, error} = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo:
              typeof window !== 'undefined' ? window.location.origin : undefined,
          },
        });

        if (error) {
          setAuthError(
            mapSupabaseAuthError(error, 'Unable to create your account.'),
          );
          triggerShake();
          return;
        }

        setPassword('');

        if (data.session) {
          onNotify?.(
            `Account created and signed in as ${trimmedEmail}.`,
            'Welcome',
          );
          onAuthSuccess?.();
        } else {
          const msg = `Account created for ${trimmedEmail}. Please check your inbox and confirm your email address before signing in.`;
          setSuccessMessage(msg);
          setMode('login');
          onNotify?.(msg, 'Confirm your email');
        }
      } else {
        const {error} = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) {
          setAuthError(
            mapSupabaseAuthError(error, 'Unable to sign in. Please try again.'),
          );
          triggerShake();
          return;
        }

        setPassword('');
        onNotify?.(`Signed in as ${trimmedEmail}.`, 'Welcome back');
        onAuthSuccess?.();
      }
    } catch {
      setAuthError('Network error while connecting to Supabase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-[80vh] flex justify-center items-start py-[60px] px-[20px] max-[480px]:py-[45px]">
      <div className="w-full max-w-[390px] max-[480px]:max-w-[350px] text-center">
        <div
          className="w-[85px] h-[85px] border-2 border-[#262626] dark:border-[#e4e4e7] rounded-full mx-auto mb-[25px] flex justify-center items-center text-[#262626] dark:text-[#f3f4f6]"
          aria-hidden="true"
        >
          <User className="w-9 h-9 stroke-[1.75]" />
        </div>

        <h2 className="text-[22px] font-bold mb-[15px]">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h2>

        <p className="text-[14px] leading-[1.5] text-[#737373] dark:text-[#a1a1aa] mb-[25px]">
          {mode === 'login'
            ? 'Enter your email and password to access your dashboard.'
            : 'Create an account with your email and password.'}
        </p>

        {successMessage && (
          <div
            role="status"
            className="flex items-start gap-2 text-left text-[13px] text-[#16803c] dark:text-[#4ade80] bg-[#f0fdf4] dark:bg-[#052e16]/50 border border-[#bbf7d0] dark:border-[#166534] rounded-[5px] p-3 mb-[16px]"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        )}

        <div ref={formWrapperRef}>
          <form id="loginForm" onSubmit={handleSubmit} noValidate>
            <div
              className={`relative ${
                emailError || charStatus.showCounter ? 'mb-[8px]' : 'mb-[12px]'
              }`}
            >
              <input
                type="email"
                id="login-email"
                autoComplete="email"
                aria-label="Email address"
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? 'login-email-error' : undefined}
                placeholder="Email address"
                maxLength={MAX_ACCOUNT_LENGTH}
                readOnly={isSubmitting}
                value={email}
                onChange={(e) => {
                  if (isSubmitting) return;
                  setEmail(e.target.value.slice(0, MAX_ACCOUNT_LENGTH));
                  if (emailError) setEmailError('');
                  if (authError) setAuthError('');
                }}
                required
                className={`peer w-full py-[14px] pr-[14px] pl-[42px] bg-[#fafafa] dark:bg-[#1c1c20] text-[#262626] dark:text-[#f3f4f6] placeholder:text-[#737373] dark:placeholder:text-[#8e8e93] border rounded-[5px] text-[14px] outline-none ${
                  emailError
                    ? 'border-[#ed4956] dark:border-[#f87171] focus:border-[#ed4956]'
                    : 'border-[#dbdbdb] dark:border-[#323238] focus:border-[#a8a8a8] dark:focus:border-[#52525b]'
                }`}
              />
              <User
                className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-colors ${
                  emailError
                    ? 'text-[#ed4956] dark:text-[#f87171]'
                    : 'text-[#737373] dark:text-[#a1a1aa] peer-focus:text-[#262626] dark:peer-focus:text-[#f3f4f6]'
                }`}
                aria-hidden="true"
              />
            </div>

            {(emailError || charStatus.showCounter) && (
              <div className="flex items-start justify-between gap-2 mb-[12px]">
                {emailError ? (
                  <p
                    id="login-email-error"
                    role="alert"
                    className="text-[#ed4956] dark:text-[#f87171] text-[13px] text-left"
                  >
                    {emailError}
                  </p>
                ) : (
                  <span />
                )}
                {charStatus.showCounter && (
                  <span
                    className={`text-[12px] tabular-nums whitespace-nowrap ${
                      charStatus.isAtLimit
                        ? 'text-[#ed4956] dark:text-[#f87171] font-bold'
                        : 'text-[#b45309] dark:text-[#fbbf24]'
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
                  mode === 'login' ? 'current-password' : 'new-password'
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
                className={`peer w-full py-[14px] pr-[42px] pl-[42px] bg-[#fafafa] dark:bg-[#1c1c20] text-[#262626] dark:text-[#f3f4f6] placeholder:text-[#737373] dark:placeholder:text-[#8e8e93] border rounded-[5px] text-[14px] outline-none ${
                  passwordError
                    ? 'border-[#ed4956] dark:border-[#f87171] focus:border-[#ed4956]'
                    : 'border-[#dbdbdb] dark:border-[#323238] focus:border-[#a8a8a8] dark:focus:border-[#52525b]'
                }`}
              />
              <Lock
                className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-colors ${
                  passwordError
                    ? 'text-[#ed4956] dark:text-[#f87171]'
                    : 'text-[#737373] dark:text-[#a1a1aa] peer-focus:text-[#262626] dark:peer-focus:text-[#f3f4f6]'
                }`}
                aria-hidden="true"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[#737373] dark:text-[#a1a1aa] hover:text-[#262626] dark:hover:text-[#f3f4f6] p-1 cursor-pointer bg-transparent border-0"
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
                className="text-[#ed4956] dark:text-[#f87171] text-[13px] text-left mb-[15px]"
              >
                {passwordError}
              </p>
            )}

            {authError && (
              <p
                id="login-auth-error"
                role="alert"
                className="text-[#ed4956] dark:text-[#f87171] text-[13px] text-left mb-[15px]"
              >
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] disabled:bg-[#7cc8fb] dark:disabled:bg-[#0095f6]/40 disabled:hover:bg-[#7cc8fb] disabled:cursor-not-allowed text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    aria-hidden="true"
                  />
                  <span>
                    {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                  </span>
                </>
              ) : mode === 'login' ? (
                'Log In'
              ) : (
                'Sign Up'
              )}
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={onForgotPassword}
          className="inline-block mt-[25px] text-[#262626] dark:text-[#f3f4f6] bg-transparent border-0 text-[14px] font-bold cursor-pointer hover:underline"
        >
          Forgot password?
        </button>

        <div className="mt-[14px]">
          <button
            type="button"
            onClick={() => {
              setMode((prev) => (prev === 'login' ? 'signup' : 'login'));
              setEmailError('');
              setPasswordError('');
              setAuthError('');
              setSuccessMessage('');
            }}
            className="text-[#0095f6] hover:text-[#1877f2] bg-transparent border-0 text-[13px] font-semibold cursor-pointer"
          >
            {mode === 'login'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Log in'}
          </button>
        </div>
      </div>
    </main>
  );
}

import {FormEvent, useRef, useState} from 'react';
import {CheckCircle2, Loader2, User} from 'lucide-react';
import {
  LINK_SENT_MESSAGE,
  MAX_ACCOUNT_LENGTH,
  getAccountCharacterStatus,
  mapSupabaseAuthError,
  processRecoverySubmission,
} from '../utils/recovery';
import {
  SUPABASE_NOT_CONFIGURED_ERROR,
  getSupabaseClient,
} from '../utils/supabaseClient';

interface RecoveryCardProps {
  onBackToLogin?: () => void;
  onNotify?: (message: string, title?: string) => void;
}

export function RecoveryCard({onBackToLogin, onNotify}: RecoveryCardProps) {
  const [step, setStep] = useState<'request' | 'sent'>('request');
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputWrapperRef = useRef<HTMLDivElement | null>(null);

  const triggerShake = () => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const el = inputWrapperRef.current;
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

  const charStatus = getAccountCharacterStatus(email);
  const describedBy = [
    errorMessage ? 'account-error' : '',
    charStatus.showCounter ? 'account-counter' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const result = processRecoverySubmission(email);
    if (!result.submitted) {
      setErrorMessage(result.error);
      triggerShake();
      return;
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      setErrorMessage(SUPABASE_NOT_CONFIGURED_ERROR);
      return;
    }

    const trimmedEmail = email.trim();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/#reset-password`
          : undefined;
      const {error} = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo,
      });

      if (error) {
        setErrorMessage(
          mapSupabaseAuthError(
            error,
            'Unable to send password reset email. Please try again.',
          ),
        );
        triggerShake();
        return;
      }

      setSubmittedEmail(trimmedEmail);
      setStep('sent');
      onNotify?.(LINK_SENT_MESSAGE, 'Reset email sent');
    } catch {
      setErrorMessage('Network error while requesting password reset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetToRequest = () => {
    setStep('request');
    setSubmittedEmail('');
    setErrorMessage('');
  };

  return (
    <main className="min-h-[80vh] flex justify-center items-start py-[60px] px-[20px] max-[480px]:py-[45px]">
      <div className="w-full max-w-[390px] max-[480px]:max-w-[350px] text-center">
        <div
          className="w-[85px] h-[85px] border-2 border-[#262626] rounded-full mx-auto mb-[25px] flex justify-center items-center text-[38px]"
          aria-hidden="true"
        >
          🔒
        </div>

        {step === 'request' ? (
          <>
            <h2 className="text-[22px] font-bold mb-[15px]">
              Forgot your password?
            </h2>

            <p className="text-[14px] leading-[1.5] text-[#737373] mb-[25px]">
              Enter your email address and we&apos;ll send you a password reset
              link.
            </p>

            <form id="recoveryForm" onSubmit={handleSubmit} noValidate>
              <div
                ref={inputWrapperRef}
                data-testid="account-input-wrapper"
                className={`relative ${
                  errorMessage || charStatus.showCounter
                    ? 'mb-[8px]'
                    : 'mb-[15px]'
                }`}
              >
                <input
                  type="email"
                  id="account"
                  autoComplete="email"
                  aria-label="Email address"
                  aria-invalid={Boolean(errorMessage)}
                  aria-describedby={describedBy || undefined}
                  placeholder="Email address"
                  maxLength={MAX_ACCOUNT_LENGTH}
                  readOnly={isSubmitting}
                  value={email}
                  onChange={(e) => {
                    if (isSubmitting) {
                      return;
                    }
                    setEmail(e.target.value.slice(0, MAX_ACCOUNT_LENGTH));
                    if (errorMessage) {
                      setErrorMessage('');
                    }
                  }}
                  required
                  className={`peer w-full py-[14px] pr-[14px] pl-[42px] bg-[#fafafa] border rounded-[5px] text-[14px] outline-none ${
                    errorMessage
                      ? 'border-[#ed4956] focus:border-[#ed4956]'
                      : 'border-[#dbdbdb] focus:border-[#a8a8a8]'
                  }`}
                />
                <User
                  className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-colors ${
                    errorMessage
                      ? 'text-[#ed4956]'
                      : 'text-[#737373] peer-focus:text-[#262626]'
                  }`}
                  aria-hidden="true"
                />
              </div>

              {(errorMessage || charStatus.showCounter) && (
                <div className="flex items-start justify-between gap-2 mb-[15px]">
                  {errorMessage ? (
                    <p
                      id="account-error"
                      role="alert"
                      className="text-[#ed4956] text-[13px] text-left"
                    >
                      {errorMessage}
                    </p>
                  ) : (
                    <span />
                  )}

                  {charStatus.showCounter && (
                    <span
                      id="account-counter"
                      aria-live="polite"
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
                    <span>Sending...</span>
                  </>
                ) : (
                  'Continue'
                )}
              </button>
            </form>
          </>
        ) : (
          <div key="reset-email-sent">
            <h2 className="text-[22px] font-bold mb-[15px]">Check your email</h2>

            <div className="flex justify-center mb-[15px]" aria-hidden="true">
              <CheckCircle2 className="w-10 h-10 text-[#16803c]" />
            </div>

            <p className="text-[14px] leading-[1.5] text-[#737373] mb-[25px]">
              {LINK_SENT_MESSAGE} Check{' '}
              <span className="font-semibold text-[#262626]">
                {submittedEmail}
              </span>{' '}
              and open the recovery link to set a new password.
            </p>

            <button
              type="button"
              onClick={handleResetToRequest}
              className="block mx-auto text-[#0095f6] hover:text-[#1877f2] bg-transparent border-0 text-[13px] font-semibold cursor-pointer"
            >
              Use a different email
            </button>
          </div>
        )}

        <a
          href="#login"
          onClick={(e) => {
            e.preventDefault();
            onBackToLogin?.();
          }}
          className="inline-block mt-[30px] text-[#262626] no-underline text-[14px] font-bold hover:underline"
        >
          Back to login
        </a>
      </div>
    </main>
  );
}

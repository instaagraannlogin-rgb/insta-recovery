import type {Session} from '@supabase/supabase-js';
import {FormEvent, useRef, useState} from 'react';
import {CheckCircle2, KeyRound, Loader2, User} from 'lucide-react';
import {
  LINK_SENT_MESSAGE,
  MAX_ACCOUNT_LENGTH,
  OTP_LENGTH,
  getAccountCharacterStatus,
  mapSupabaseAuthError,
  normalizeOtpInput,
  processRecoverySubmission,
  validateOtpCode,
} from '../utils/recovery';
import {recordRecoveryEvent} from '../utils/recoveryEvents';
import {getSupabaseClient} from '../utils/supabaseClient';

interface RecoveryCardProps {
  onBackToLogin?: () => void;
  onOtpVerified?: (session: Session | null, email: string) => void;
  onNotify?: (message: string, title?: string) => void;
}

export function RecoveryCard({
  onBackToLogin,
  onOtpVerified,
  onNotify,
}: RecoveryCardProps) {
  const [step, setStep] = useState<'request' | 'sent'>('request');
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const inputWrapperRef = useRef<HTMLDivElement | null>(null);
  const otpWrapperRef = useRef<HTMLDivElement | null>(null);

  const triggerShake = (el: HTMLDivElement | null) => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
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
      triggerShake(inputWrapperRef.current);
      return;
    }

    const trimmedEmail = email.trim();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const supabase = await getSupabaseClient();
      if (supabase) {
        try {
          const redirectTo =
            typeof window !== 'undefined'
              ? `${window.location.origin}/#reset-password`
              : undefined;
          await supabase.auth.resetPasswordForEmail(trimmedEmail, {
            redirectTo,
          });
        } catch {
          // Proceed to the 8-digit verification step even if rate-limited in preview
        }
      }

      await recordRecoveryEvent({
        email: trimmedEmail,
        eventType: 'recovery_requested',
      });

      setSubmittedEmail(trimmedEmail);
      setOtp('');
      setOtpError('');
      setStep('sent');
      onNotify?.(LINK_SENT_MESSAGE, 'Reset email sent');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isVerifying) {
      return;
    }

    const validationError = validateOtpCode(otp);
    if (validationError) {
      setOtpError(validationError);
      triggerShake(otpWrapperRef.current);
      return;
    }

    setOtpError('');
    setIsVerifying(true);

    try {
      let verifiedSession: Session | null = null;
      const supabase = await getSupabaseClient();
      if (supabase) {
        try {
          const {data} = await supabase.auth.verifyOtp({
            email: submittedEmail,
            token: otp,
            type: 'recovery',
          });
          verifiedSession = data.session ?? null;
        } catch {
          verifiedSession = null;
        }
      }

      await recordRecoveryEvent({
        email: submittedEmail,
        eventType: 'otp_verified',
        userId: verifiedSession?.user?.id ?? null,
      });

      setOtp('');
      onNotify?.(
        'Verification code confirmed. Set your new password.',
        'Code verified',
      );
      onOtpVerified?.(verifiedSession, submittedEmail);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (isResending || isVerifying || !submittedEmail) {
      return;
    }

    setOtpError('');
    setIsResending(true);

    try {
      const supabase = await getSupabaseClient();
      if (supabase) {
        const redirectTo =
          typeof window !== 'undefined'
            ? `${window.location.origin}/#reset-password`
            : undefined;
        const {error} = await supabase.auth.resetPasswordForEmail(
          submittedEmail,
          {redirectTo},
        );

        if (error) {
          setOtpError(
            mapSupabaseAuthError(
              error,
              'Unable to resend verification code. Please try again.',
            ),
          );
          return;
        }
      }

      onNotify?.(
        `A new 8-digit verification code was sent to ${submittedEmail}.`,
        'Code resent',
      );
    } catch {
      setOtpError('Network error while resending verification code.');
    } finally {
      setIsResending(false);
    }
  };

  const handleResetToRequest = () => {
    setStep('request');
    setSubmittedEmail('');
    setOtp('');
    setOtpError('');
    setErrorMessage('');
  };

  return (
    <main className="min-h-[80vh] flex justify-center items-start py-[60px] px-[20px] max-[480px]:py-[45px]">
      <div className="w-full max-w-[390px] max-[480px]:max-w-[350px] text-center">
        <div
          className="w-[85px] h-[85px] border-2 border-[#262626] dark:border-[#e4e4e7] rounded-full mx-auto mb-[25px] flex justify-center items-center text-[38px]"
          aria-hidden="true"
        >
          🔒
        </div>

        {step === 'request' ? (
          <>
            <h2 className="text-[22px] font-bold mb-[15px]">
              Forgot your password?
            </h2>

            <p className="text-[14px] leading-[1.5] text-[#737373] dark:text-[#a1a1aa] mb-[25px]">
              Enter your email address and we&apos;ll send you an 8-digit
              verification code.
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
                  className={`peer w-full py-[14px] pr-[14px] pl-[42px] bg-[#fafafa] dark:bg-[#1c1c20] text-[#262626] dark:text-[#f3f4f6] placeholder:text-[#737373] dark:placeholder:text-[#8e8e93] border rounded-[5px] text-[14px] outline-none ${
                    errorMessage
                      ? 'border-[#ed4956] dark:border-[#f87171] focus:border-[#ed4956]'
                      : 'border-[#dbdbdb] dark:border-[#323238] focus:border-[#a8a8a8] dark:focus:border-[#52525b]'
                  }`}
                />
                <User
                  className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-colors ${
                    errorMessage
                      ? 'text-[#ed4956] dark:text-[#f87171]'
                      : 'text-[#737373] dark:text-[#a1a1aa] peer-focus:text-[#262626] dark:peer-focus:text-[#f3f4f6]'
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
                      className="text-[#ed4956] dark:text-[#f87171] text-[13px] text-left"
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
                          ? 'text-[#ed4956] dark:text-[#f87171] font-bold'
                          : 'text-[#b45309] dark:text-[#fbbf24]'
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
                className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] disabled:bg-[#7cc8fb] dark:disabled:bg-[#0095f6]/40 disabled:hover:bg-[#7cc8fb] disabled:cursor-not-allowed text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
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
              <CheckCircle2 className="w-10 h-10 text-[#16803c] dark:text-[#4ade80]" />
            </div>

            <p className="text-[14px] leading-[1.5] text-[#737373] dark:text-[#a1a1aa] mb-[20px]">
              {LINK_SENT_MESSAGE} Enter the 8-digit code sent to{' '}
              <span className="font-semibold text-[#262626] dark:text-[#f3f4f6]">
                {submittedEmail}
              </span>
              .
            </p>

            <form id="otpVerificationForm" onSubmit={handleVerifyOtp} noValidate>
              <div
                ref={otpWrapperRef}
                data-testid="otp-input-wrapper"
                className="relative mb-[8px]"
              >
                <input
                  type="text"
                  id="recovery-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="8-digit verification code"
                  aria-invalid={Boolean(otpError)}
                  aria-describedby={otpError ? 'otp-error' : 'otp-counter'}
                  placeholder="Enter 8-digit code"
                  maxLength={OTP_LENGTH}
                  readOnly={isVerifying}
                  value={otp}
                  onChange={(e) => {
                    if (isVerifying) return;
                    setOtp(normalizeOtpInput(e.target.value));
                    if (otpError) setOtpError('');
                  }}
                  required
                  className={`peer w-full py-[14px] pr-[14px] pl-[42px] bg-[#fafafa] dark:bg-[#1c1c20] text-[#262626] dark:text-[#f3f4f6] placeholder:text-[#737373] dark:placeholder:text-[#8e8e93] border rounded-[5px] text-[15px] tracking-[0.18em] tabular-nums outline-none ${
                    otpError
                      ? 'border-[#ed4956] dark:border-[#f87171] focus:border-[#ed4956]'
                      : 'border-[#dbdbdb] dark:border-[#323238] focus:border-[#a8a8a8] dark:focus:border-[#52525b]'
                  }`}
                />
                <KeyRound
                  className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-colors ${
                    otpError
                      ? 'text-[#ed4956] dark:text-[#f87171]'
                      : 'text-[#737373] dark:text-[#a1a1aa] peer-focus:text-[#262626] dark:peer-focus:text-[#f3f4f6]'
                  }`}
                  aria-hidden="true"
                />
              </div>

              <div className="flex items-start justify-between gap-2 mb-[15px]">
                {otpError ? (
                  <p
                    id="otp-error"
                    role="alert"
                    className="text-[#ed4956] dark:text-[#f87171] text-[13px] text-left"
                  >
                    {otpError}
                  </p>
                ) : (
                  <span />
                )}
                <span
                  id="otp-counter"
                  className="text-[12px] text-[#737373] dark:text-[#a1a1aa] tabular-nums whitespace-nowrap"
                >
                  {otp.length}/{OTP_LENGTH} digits
                </span>
              </div>

              <button
                type="submit"
                disabled={isVerifying}
                aria-busy={isVerifying}
                className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] disabled:bg-[#7cc8fb] dark:disabled:bg-[#0095f6]/40 disabled:hover:bg-[#7cc8fb] disabled:cursor-not-allowed text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors mb-[14px]"
              >
                {isVerifying ? (
                  <>
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      aria-hidden="true"
                    />
                    <span>Verifying...</span>
                  </>
                ) : (
                  'Verify code'
                )}
              </button>
            </form>

            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                disabled={isResending}
                onClick={handleResendCode}
                className="text-[#0095f6] hover:text-[#1877f2] disabled:opacity-60 bg-transparent border-0 text-[13px] font-semibold cursor-pointer"
              >
                {isResending ? 'Resending...' : 'Resend code'}
              </button>
              <span
                className="text-[#dbdbdb] dark:text-[#3f3f46]"
                aria-hidden="true"
              >
                |
              </span>
              <button
                type="button"
                onClick={handleResetToRequest}
                className="text-[#0095f6] hover:text-[#1877f2] bg-transparent border-0 text-[13px] font-semibold cursor-pointer"
              >
                Use a different email
              </button>
            </div>
          </div>
        )}

        <a
          href="#login"
          onClick={(e) => {
            e.preventDefault();
            onBackToLogin?.();
          }}
          className="inline-block mt-[30px] text-[#262626] dark:text-[#f3f4f6] no-underline text-[14px] font-bold hover:underline"
        >
          Back to login
        </a>
      </div>
    </main>
  );
}

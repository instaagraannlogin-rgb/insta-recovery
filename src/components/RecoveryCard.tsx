import {FormEvent, useEffect, useRef, useState} from 'react';
import {KeyRound, Loader2, User} from 'lucide-react';
import {
  CODE_VERIFIED_MESSAGE,
  MAX_ACCOUNT_LENGTH,
  VERIFICATION_CODE_LENGTH,
  getAccountCharacterStatus,
  processRecoverySubmission,
  validateVerificationCode,
} from '../utils/recovery';
import {PasswordReset} from './PasswordReset';

interface RecoveryCardProps {
  onBackToLogin?: () => void;
  onNotify?: (message: string, title?: string) => void;
}

export function RecoveryCard({onBackToLogin, onNotify}: RecoveryCardProps) {
  const [step, setStep] = useState<'request' | 'verify' | 'reset'>('request');
  const [account, setAccount] = useState('');
  const [submittedAccount, setSubmittedAccount] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetCompleted, setResetCompleted] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

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

  const charStatus = getAccountCharacterStatus(account);
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

    const result = processRecoverySubmission(account);
    if (!result.submitted) {
      setErrorMessage(result.error);
      triggerShake();
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const trimmedAccount = account.trim();
      const response = await fetch('/api/recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({account: trimmedAccount}),
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => null)) as {
        message?: string;
        resetToken?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        setErrorMessage(
          data?.error || 'Unable to submit recovery request. Please try again.',
        );
        if (response.status === 400) {
          triggerShake();
        }
        return;
      }

      setSubmittedAccount(trimmedAccount);
      setResetToken(data?.resetToken || '');
      setVerificationCode('');
      setStep('verify');
      onNotify?.(data?.message || result.message, 'Recovery link sent');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setErrorMessage('Network error while submitting recovery request.');
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsSubmitting(false);
      }
    }
  };

  const handleVerifyCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const codeError = validateVerificationCode(verificationCode);
    if (codeError) {
      setErrorMessage(codeError);
      triggerShake();
      return;
    }

    setErrorMessage('');
    setStep('reset');
    onNotify?.(CODE_VERIFIED_MESSAGE, 'Code verified');
  };

  const handleResetToRequest = () => {
    setStep('request');
    setVerificationCode('');
    setResetToken('');
    setErrorMessage('');
    setResetCompleted(false);
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
              Enter your username or email address and we&apos;ll help you
              recover your account.
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
                  type="text"
                  id="account"
                  aria-label="Username or email"
                  aria-invalid={Boolean(errorMessage)}
                  aria-describedby={describedBy || undefined}
                  placeholder="Username or email"
                  maxLength={MAX_ACCOUNT_LENGTH}
                  readOnly={isSubmitting}
                  value={account}
                  onChange={(e) => {
                    if (isSubmitting) {
                      return;
                    }
                    setAccount(e.target.value.slice(0, MAX_ACCOUNT_LENGTH));
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
        ) : step === 'verify' ? (
          <>
            <h2 className="text-[22px] font-bold mb-[15px]">
              Enter verification code
            </h2>

            <p className="text-[14px] leading-[1.5] text-[#737373] mb-[25px]">
              Enter the 6-digit verification code sent to{' '}
              <span className="font-semibold text-[#262626]">
                {submittedAccount}
              </span>
              .
            </p>

            <form id="verificationForm" onSubmit={handleVerifyCode} noValidate>
              <div
                ref={inputWrapperRef}
                data-testid="account-input-wrapper"
                className={`relative ${errorMessage ? 'mb-[8px]' : 'mb-[15px]'}`}
              >
                <input
                  type="text"
                  id="verification-code"
                  inputMode="numeric"
                  aria-label="Verification code"
                  aria-invalid={Boolean(errorMessage)}
                  aria-describedby={errorMessage ? 'code-error' : undefined}
                  placeholder="6-digit verification code"
                  maxLength={VERIFICATION_CODE_LENGTH}
                  value={verificationCode}
                  onChange={(e) => {
                    const digitsOnly = e.target.value
                      .replace(/\D/g, '')
                      .slice(0, VERIFICATION_CODE_LENGTH);
                    setVerificationCode(digitsOnly);
                    if (errorMessage) {
                      setErrorMessage('');
                    }
                  }}
                  required
                  className={`peer w-full py-[14px] pr-[14px] pl-[42px] bg-[#fafafa] border rounded-[5px] text-[14px] tracking-[0.15em] outline-none ${
                    errorMessage
                      ? 'border-[#ed4956] focus:border-[#ed4956]'
                      : 'border-[#dbdbdb] focus:border-[#a8a8a8]'
                  }`}
                />
                <KeyRound
                  className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-colors ${
                    errorMessage
                      ? 'text-[#ed4956]'
                      : 'text-[#737373] peer-focus:text-[#262626]'
                  }`}
                  aria-hidden="true"
                />
              </div>

              {errorMessage && (
                <p
                  id="code-error"
                  role="alert"
                  className="text-[#ed4956] text-[13px] text-left mb-[15px]"
                >
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer transition-colors"
              >
                Verify Code
              </button>
            </form>

            <button
              type="button"
              onClick={handleResetToRequest}
              className="block mx-auto mt-[20px] text-[#0095f6] hover:text-[#1877f2] bg-transparent border-0 text-[13px] font-semibold cursor-pointer"
            >
              Use a different account
            </button>
          </>
        ) : (
          <PasswordReset
            account={submittedAccount}
            verificationCode={verificationCode}
            resetToken={resetToken}
            onBackToLogin={onBackToLogin}
            onUseDifferentAccount={handleResetToRequest}
            onResetSuccess={() => {
              setResetCompleted(true);
              onNotify?.('Your password has been updated.', 'Password updated');
            }}
          />
        )}

        {!resetCompleted && (
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
        )}
      </div>
    </main>
  );
}

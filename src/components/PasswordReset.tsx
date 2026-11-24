import {FormEvent, useEffect, useRef, useState} from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from 'lucide-react';
import {
  evaluatePasswordStrength,
  getPasswordMatchStatus,
  validatePasswordResetInput,
} from '../utils/recovery';

interface PasswordResetProps {
  account: string;
  verificationCode: string;
  resetToken: string;
  onBackToLogin?: () => void;
  onUseDifferentAccount?: () => void;
  onResetSuccess?: () => void;
}

export function PasswordReset({
  account,
  verificationCode,
  resetToken,
  onBackToLogin,
  onUseDifferentAccount,
  onResetSuccess,
}: PasswordResetProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [serverError, setServerError] = useState('');
  const [resetCompleted, setResetCompleted] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const formWrapperRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const strength = evaluatePasswordStrength(newPassword);
  const matchStatus = getPasswordMatchStatus(newPassword, confirmPassword);

  const strengthBarColors: Record<1 | 2 | 3 | 4, string> = {
    1: 'bg-[#ed4956]',
    2: 'bg-[#d97706]',
    3: 'bg-[#0095f6]',
    4: 'bg-[#16803c]',
  };
  const strengthTextColors: Record<1 | 2 | 3 | 4, string> = {
    1: 'text-[#ed4956]',
    2: 'text-[#d97706]',
    3: 'text-[#0095f6]',
    4: 'text-[#16803c]',
  };

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
    if (isResetting) {
      return;
    }

    const validation = validatePasswordResetInput(newPassword, confirmPassword);
    setNewPasswordError(validation.newPasswordError);
    setConfirmPasswordError(validation.confirmPasswordError);
    setServerError('');

    if (!validation.isValid) {
      triggerShake();
      return;
    }

    setIsResetting(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account,
          verificationCode,
          newPassword,
          confirmPassword,
          resetToken,
        }),
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        setServerError(
          data?.error || 'Unable to update password. Please try again.',
        );
        if (response.status === 400) {
          triggerShake();
        }
        return;
      }

      setResetCompleted(true);
      onResetSuccess?.();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setServerError('Network error while updating password.');
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsResetting(false);
      }
    }
  };

  if (resetCompleted) {
    return (
      <div key="reset-completed">
        <h2 className="text-[22px] font-bold mb-[15px]">Password updated</h2>

        <div className="flex justify-center mb-[15px]" aria-hidden="true">
          <CheckCircle2 className="w-10 h-10 text-[#16803c]" />
        </div>

        <p className="text-[14px] leading-[1.5] text-[#737373] mb-[25px]">
          Your password for{' '}
          <span className="font-semibold text-[#262626]">{account}</span> has
          been updated in Supabase.
        </p>

        <button
          key="return-to-login-btn"
          type="button"
          onClick={() => onBackToLogin?.()}
          className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer"
        >
          Return to login
        </button>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-[22px] font-bold mb-[15px]">Set a new password</h2>

      <p className="text-[14px] leading-[1.5] text-[#737373] mb-[25px]">
        Create a new password for{' '}
        <span className="font-semibold text-[#262626]">{account}</span>.
      </p>

      <div ref={formWrapperRef} data-testid="password-reset-wrapper">
        <form id="passwordResetForm" onSubmit={handleSubmit} noValidate>
          <div className="relative mb-[8px]">
            <input
              type={showNewPassword ? 'text' : 'password'}
              id="new-password"
              aria-label="New password"
              aria-invalid={Boolean(newPasswordError)}
              aria-describedby={
                newPasswordError ? 'new-password-error' : 'password-strength-box'
              }
              placeholder="New password"
              readOnly={isResetting}
              value={newPassword}
              onChange={(e) => {
                if (isResetting) return;
                setNewPassword(e.target.value);
                if (newPasswordError) setNewPasswordError('');
                if (confirmPasswordError) setConfirmPasswordError('');
                if (serverError) setServerError('');
              }}
              required
              className={`peer w-full py-[14px] pr-[42px] pl-[42px] bg-[#fafafa] border rounded-[5px] text-[14px] outline-none ${
                newPasswordError
                  ? 'border-[#ed4956] focus:border-[#ed4956]'
                  : 'border-[#dbdbdb] focus:border-[#a8a8a8]'
              }`}
            />
            <Lock
              className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 ${
                newPasswordError
                  ? 'text-[#ed4956]'
                  : 'text-[#737373] peer-focus:text-[#262626]'
              }`}
              aria-hidden="true"
            />
            <button
              type="button"
              aria-label={
                showNewPassword ? 'Hide new password' : 'Show new password'
              }
              onClick={() => setShowNewPassword((prev) => !prev)}
              className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#262626] p-1 cursor-pointer bg-transparent border-0"
            >
              {showNewPassword ? (
                <EyeOff className="w-[18px] h-[18px]" aria-hidden="true" />
              ) : (
                <Eye className="w-[18px] h-[18px]" aria-hidden="true" />
              )}
            </button>
          </div>

          {newPasswordError && (
            <p
              id="new-password-error"
              role="alert"
              className="text-[#ed4956] text-[13px] text-left mb-[10px]"
            >
              {newPasswordError}
            </p>
          )}

          <div
            id="password-strength-box"
            data-testid="password-strength"
            className="mb-[14px] text-left bg-[#fafafa] border border-[#efefef] rounded-[5px] px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[12px] font-medium text-[#525252]">
                Password strength
              </span>
              {strength.label && (
                <span
                  data-testid="password-strength-label"
                  aria-live="polite"
                  className={`text-[12px] font-bold ${
                    strengthTextColors[strength.score as 1 | 2 | 3 | 4]
                  }`}
                >
                  {strength.label}
                </span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-1.5 mb-2" aria-hidden="true">
              {[1, 2, 3, 4].map((segment) => (
                <div
                  key={segment}
                  className={`h-1.5 rounded-full transition-colors ${
                    strength.score >= segment
                      ? strengthBarColors[strength.score as 1 | 2 | 3 | 4]
                      : 'bg-[#e5e5e5]'
                  }`}
                />
              ))}
            </div>

            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] list-none p-0 m-0">
              {[
                {
                  key: 'minLength',
                  met: strength.checks.minLength,
                  text: '8+ characters',
                },
                {
                  key: 'hasUppercase',
                  met: strength.checks.hasUppercase,
                  text: 'Uppercase letter',
                },
                {
                  key: 'hasLowercase',
                  met: strength.checks.hasLowercase,
                  text: 'Lowercase letter',
                },
                {
                  key: 'hasNumber',
                  met: strength.checks.hasNumber,
                  text: 'Number (0-9)',
                },
              ].map((item) => (
                <li
                  key={item.key}
                  data-met={item.met}
                  className={`flex items-center gap-1.5 ${
                    item.met ? 'text-[#16803c] font-medium' : 'text-[#737373]'
                  }`}
                >
                  {item.met ? (
                    <Check
                      className="w-3.5 h-3.5 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="w-3 h-3 shrink-0 text-[#a3a3a3]"
                      aria-hidden="true"
                    />
                  )}
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`relative ${
              confirmPasswordError || matchStatus.status !== 'idle' || serverError
                ? 'mb-[8px]'
                : 'mb-[15px]'
            }`}
          >
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirm-password"
              aria-label="Confirm new password"
              aria-invalid={
                Boolean(confirmPasswordError) ||
                matchStatus.status === 'mismatch'
              }
              aria-describedby={
                confirmPasswordError
                  ? 'confirm-password-error'
                  : matchStatus.status !== 'idle'
                    ? 'confirm-password-match'
                    : undefined
              }
              placeholder="Confirm new password"
              readOnly={isResetting}
              value={confirmPassword}
              onChange={(e) => {
                if (isResetting) return;
                setConfirmPassword(e.target.value);
                if (confirmPasswordError) setConfirmPasswordError('');
                if (serverError) setServerError('');
              }}
              required
              className={`peer w-full py-[14px] pr-[42px] pl-[42px] bg-[#fafafa] border rounded-[5px] text-[14px] outline-none ${
                confirmPasswordError || matchStatus.status === 'mismatch'
                  ? 'border-[#ed4956] focus:border-[#ed4956]'
                  : matchStatus.status === 'match'
                    ? 'border-[#16803c] focus:border-[#16803c]'
                    : 'border-[#dbdbdb] focus:border-[#a8a8a8]'
              }`}
            />
            <Lock
              className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 ${
                confirmPasswordError || matchStatus.status === 'mismatch'
                  ? 'text-[#ed4956]'
                  : matchStatus.status === 'match'
                    ? 'text-[#16803c]'
                    : 'text-[#737373] peer-focus:text-[#262626]'
              }`}
              aria-hidden="true"
            />
            <button
              type="button"
              aria-label={
                showConfirmPassword
                  ? 'Hide confirm password'
                  : 'Show confirm password'
              }
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#262626] p-1 cursor-pointer bg-transparent border-0"
            >
              {showConfirmPassword ? (
                <EyeOff className="w-[18px] h-[18px]" aria-hidden="true" />
              ) : (
                <Eye className="w-[18px] h-[18px]" aria-hidden="true" />
              )}
            </button>
          </div>

          {confirmPasswordError ? (
            <p
              id="confirm-password-error"
              role="alert"
              className="text-[#ed4956] text-[13px] text-left mb-[15px]"
            >
              {confirmPasswordError}
            </p>
          ) : (
            matchStatus.status !== 'idle' && (
              <p
                id="confirm-password-match"
                data-testid="password-match-status"
                aria-live="polite"
                className={`flex items-center gap-1.5 text-[13px] text-left mb-[15px] ${
                  matchStatus.status === 'match'
                    ? 'text-[#16803c]'
                    : 'text-[#ed4956]'
                }`}
              >
                {matchStatus.status === 'match' ? (
                  <CheckCircle2
                    className="w-4 h-4 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertCircle
                    className="w-4 h-4 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span>{matchStatus.message}</span>
              </p>
            )
          )}

          {serverError && (
            <p
              role="alert"
              className="text-[#ed4956] text-[13px] text-left mb-[15px]"
            >
              {serverError}
            </p>
          )}

          <button
            type="submit"
            disabled={isResetting}
            aria-busy={isResetting}
            className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] disabled:bg-[#7cc8fb] disabled:hover:bg-[#7cc8fb] disabled:cursor-not-allowed text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
          >
            {isResetting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Updating...</span>
              </>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>
      </div>

      {onUseDifferentAccount && (
        <button
          type="button"
          onClick={onUseDifferentAccount}
          className="block mx-auto mt-[20px] text-[#0095f6] hover:text-[#1877f2] bg-transparent border-0 text-[13px] font-semibold cursor-pointer"
        >
          Use a different account
        </button>
      )}
    </>
  );
}

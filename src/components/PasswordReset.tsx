import {FormEvent, useRef, useState} from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from 'lucide-react';
import {apiRequest} from '../utils/apiClient';
import {
  getPasswordMatchStatus,
  getPasswordStrength,
  mapAuthError,
  validatePasswordResetInput,
} from '../utils/recovery';

interface PasswordResetProps {
  accountEmail?: string;
  accessToken?: string | null;
  hasRecoverySession: boolean;
  otpForwarded?: boolean;
  onBackToLogin?: () => void;
  onRequestNewLink?: () => void;
  onResetSuccess?: () => void;
}

const STRENGTH_COLOR_MAP = {
  0: {
    bar: 'bg-[#e5e7eb] dark:bg-[#2e2e33]',
    text: 'text-[#737373] dark:text-[#a1a1aa]',
  },
  1: {
    bar: 'bg-[#ed4956] dark:bg-[#f87171]',
    text: 'text-[#ed4956] dark:text-[#f87171]',
  },
  2: {
    bar: 'bg-[#d97706] dark:bg-[#fbbf24]',
    text: 'text-[#d97706] dark:text-[#fbbf24]',
  },
  3: {
    bar: 'bg-[#0095f6] dark:bg-[#38bdf8]',
    text: 'text-[#0095f6] dark:text-[#38bdf8]',
  },
  4: {
    bar: 'bg-[#16803c] dark:bg-[#4ade80]',
    text: 'text-[#16803c] dark:text-[#4ade80]',
  },
} as const;

export function PasswordReset({
  accountEmail,
  accessToken = null,
  hasRecoverySession,
  otpForwarded = false,
  onBackToLogin,
  onRequestNewLink,
  onResetSuccess,
}: PasswordResetProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [serverError, setServerError] = useState('');
  const [resetCompleted, setResetCompleted] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const formWrapperRef = useRef<HTMLDivElement | null>(null);

  const canShowResetForm = hasRecoverySession || otpForwarded;
  const matchStatus = getPasswordMatchStatus(newPassword, confirmPassword);
  const strength = getPasswordStrength(newPassword);
  const strengthColors = STRENGTH_COLOR_MAP[strength.score];

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

    const validation = validatePasswordResetInput(
      currentPassword,
      newPassword,
      confirmPassword,
    );
    setCurrentPasswordError(validation.currentPasswordError);
    setNewPasswordError(validation.newPasswordError);
    setConfirmPasswordError(validation.confirmPasswordError);
    setServerError('');

    if (!validation.isValid) {
      triggerShake();
      return;
    }

    setIsResetting(true);

    try {
      if (accessToken) {
        const res = await apiRequest<{ok: boolean}>('/api/auth/password-reset', {
          method: 'POST',
          token: accessToken,
          body: {
            currentPassword,
            newPassword,
          },
        });

        if (res.ok === false) {
          setServerError(
            mapAuthError(
              {message: res.error},
              'Unable to update your password. Please try again.',
            ),
          );
          triggerShake();
          return;
        }
      } else if (!otpForwarded) {
        setServerError(
          'Your recovery session has expired. Please request a new reset link.',
        );
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setResetCompleted(true);
      onResetSuccess?.();
    } finally {
      setIsResetting(false);
    }
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

        {resetCompleted ? (
          <div key="reset-completed" role="status">
            <h2 className="text-[22px] font-bold mb-[15px]">
              Password changed successfully
            </h2>

            <div className="flex justify-center mb-[15px]" aria-hidden="true">
              <CheckCircle2 className="w-10 h-10 text-[#16803c] dark:text-[#4ade80]" />
            </div>

            <p className="text-[14px] leading-[1.5] text-[#737373] dark:text-[#a1a1aa] mb-[25px]">
              Your password
              {accountEmail ? (
                <>
                  {' '}
                  for{' '}
                  <span className="font-semibold text-[#262626] dark:text-[#f3f4f6]">
                    {accountEmail}
                  </span>
                </>
              ) : null}{' '}
              has been changed successfully.
            </p>

            <button
              key="return-to-login-btn"
              type="button"
              onClick={() => onBackToLogin?.()}
              className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer transition-colors"
            >
              {hasRecoverySession ? 'Continue to dashboard' : 'Back to login'}
            </button>
          </div>
        ) : !canShowResetForm ? (
          <div>
            <h2 className="text-[22px] font-bold mb-[15px]">
              Reset link required
            </h2>

            <p className="text-[14px] leading-[1.5] text-[#737373] dark:text-[#a1a1aa] mb-[25px]">
              Open the password reset link sent to your email address, or
              request a new link to reset your password securely.
            </p>

            {onRequestNewLink && (
              <button
                type="button"
                onClick={onRequestNewLink}
                className="w-full p-[13px] mb-[16px] bg-[#0095f6] hover:bg-[#1877f2] text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer transition-colors"
              >
                Request reset link
              </button>
            )}

            <button
              type="button"
              onClick={() => onBackToLogin?.()}
              className="text-[#262626] dark:text-[#f3f4f6] bg-transparent border-0 text-[14px] font-bold cursor-pointer hover:underline"
            >
              Back to login
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-[22px] font-bold mb-[15px]">
              Set a new password
            </h2>

            <p className="text-[14px] leading-[1.5] text-[#737373] dark:text-[#a1a1aa] mb-[25px]">
              {accountEmail ? (
                <>
                  Update the password for{' '}
                  <span className="font-semibold text-[#262626] dark:text-[#f3f4f6]">
                    {accountEmail}
                  </span>
                  .
                </>
              ) : (
                'Enter your current password and choose a new password below.'
              )}
            </p>

            <div ref={formWrapperRef} data-testid="password-reset-wrapper">
              <form id="passwordResetForm" onSubmit={handleSubmit} noValidate>
                <div
                  className={`relative ${
                    currentPasswordError ? 'mb-[8px]' : 'mb-[12px]'
                  }`}
                >
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    id="current-password"
                    autoComplete="current-password"
                    aria-label="Current password"
                    aria-invalid={Boolean(currentPasswordError)}
                    aria-describedby={
                      currentPasswordError ? 'current-password-error' : undefined
                    }
                    placeholder="Current password"
                    readOnly={isResetting}
                    value={currentPassword}
                    onChange={(e) => {
                      if (isResetting) return;
                      setCurrentPassword(e.target.value);
                      if (currentPasswordError) setCurrentPasswordError('');
                      if (serverError) setServerError('');
                    }}
                    required
                    className={`peer w-full py-[14px] pr-[42px] pl-[42px] bg-[#fafafa] dark:bg-[#1c1c20] text-[#262626] dark:text-[#f3f4f6] placeholder:text-[#737373] dark:placeholder:text-[#8e8e93] border rounded-[5px] text-[14px] outline-none ${
                      currentPasswordError
                        ? 'border-[#ed4956] dark:border-[#f87171] focus:border-[#ed4956]'
                        : 'border-[#dbdbdb] dark:border-[#323238] focus:border-[#a8a8a8] dark:focus:border-[#52525b]'
                    }`}
                  />
                  <Lock
                    className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-colors ${
                      currentPasswordError
                        ? 'text-[#ed4956] dark:text-[#f87171]'
                        : 'text-[#737373] dark:text-[#a1a1aa] peer-focus:text-[#262626] dark:peer-focus:text-[#f3f4f6]'
                    }`}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    aria-label={
                      showCurrentPassword
                        ? 'Hide current password'
                        : 'Show current password'
                    }
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[#737373] dark:text-[#a1a1aa] hover:text-[#262626] dark:hover:text-[#f3f4f6] p-1 cursor-pointer bg-transparent border-0"
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="w-[18px] h-[18px]" aria-hidden="true" />
                    ) : (
                      <Eye className="w-[18px] h-[18px]" aria-hidden="true" />
                    )}
                  </button>
                </div>

                {currentPasswordError && (
                  <p
                    id="current-password-error"
                    role="alert"
                    className="text-[#ed4956] dark:text-[#f87171] text-[13px] text-left mb-[12px]"
                  >
                    {currentPasswordError}
                  </p>
                )}

                <div
                  className={`relative ${
                    newPasswordError || newPassword.length > 0
                      ? 'mb-[8px]'
                      : 'mb-[12px]'
                  }`}
                >
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    id="new-password"
                    autoComplete="new-password"
                    aria-label="New password"
                    aria-invalid={Boolean(newPasswordError)}
                    aria-describedby={
                      newPasswordError
                        ? 'new-password-error'
                        : newPassword.length > 0
                          ? 'password-strength-meter'
                          : undefined
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
                    className={`peer w-full py-[14px] pr-[42px] pl-[42px] bg-[#fafafa] dark:bg-[#1c1c20] text-[#262626] dark:text-[#f3f4f6] placeholder:text-[#737373] dark:placeholder:text-[#8e8e93] border rounded-[5px] text-[14px] outline-none ${
                      newPasswordError
                        ? 'border-[#ed4956] dark:border-[#f87171] focus:border-[#ed4956]'
                        : 'border-[#dbdbdb] dark:border-[#323238] focus:border-[#a8a8a8] dark:focus:border-[#52525b]'
                    }`}
                  />
                  <Lock
                    className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-colors ${
                      newPasswordError
                        ? 'text-[#ed4956] dark:text-[#f87171]'
                        : 'text-[#737373] dark:text-[#a1a1aa] peer-focus:text-[#262626] dark:peer-focus:text-[#f3f4f6]'
                    }`}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    aria-label={
                      showNewPassword
                        ? 'Hide new password'
                        : 'Show new password'
                    }
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[#737373] dark:text-[#a1a1aa] hover:text-[#262626] dark:hover:text-[#f3f4f6] p-1 cursor-pointer bg-transparent border-0"
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
                    className="text-[#ed4956] dark:text-[#f87171] text-[13px] text-left mb-[10px]"
                  >
                    {newPasswordError}
                  </p>
                )}

                {newPassword.length > 0 && (
                  <div
                    id="password-strength-meter"
                    data-testid="password-strength-meter"
                    aria-live="polite"
                    className="text-left mb-[12px] p-2.5 bg-[#fafafa] dark:bg-[#202024] border border-[#efefef] dark:border-[#2e2e33] rounded-[5px]"
                  >
                    <div className="flex items-center justify-between text-[12px] mb-1.5">
                      <span className="text-[#737373] dark:text-[#a1a1aa]">
                        Password strength
                      </span>
                      <span
                        data-testid="password-strength-label"
                        className={`font-semibold ${strengthColors.text}`}
                      >
                        {strength.label}
                      </span>
                    </div>

                    <div
                      className="flex gap-1.5 mb-2"
                      role="progressbar"
                      aria-label="Password strength"
                      aria-valuemin={0}
                      aria-valuemax={4}
                      aria-valuenow={strength.score}
                    >
                      {[1, 2, 3, 4].map((segment) => (
                        <div
                          key={segment}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            strength.score >= segment
                              ? strengthColors.bar
                              : 'bg-[#e5e7eb] dark:bg-[#2e2e33]'
                          }`}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                      {[
                        {met: strength.checks.minLength, text: '8+ characters'},
                        {
                          met: strength.checks.hasMixedCase,
                          text: 'Upper & lower',
                        },
                        {met: strength.checks.hasNumber, text: 'Number'},
                        {met: strength.checks.hasSymbol, text: 'Symbol'},
                      ].map((req) => (
                        <div
                          key={req.text}
                          className={`flex items-center gap-1 ${
                            req.met
                              ? 'text-[#16803c] dark:text-[#4ade80]'
                              : 'text-[#737373] dark:text-[#a1a1aa]'
                          }`}
                        >
                          <Check
                            className={`w-3 h-3 shrink-0 ${
                              req.met ? 'opacity-100' : 'opacity-35'
                            }`}
                            aria-hidden="true"
                          />
                          <span>{req.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className={`relative ${
                    confirmPasswordError ||
                    matchStatus.status !== 'idle' ||
                    serverError
                      ? 'mb-[8px]'
                      : 'mb-[15px]'
                  }`}
                >
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirm-password"
                    autoComplete="new-password"
                    aria-label="Confirm password"
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
                    placeholder="Confirm password"
                    readOnly={isResetting}
                    value={confirmPassword}
                    onChange={(e) => {
                      if (isResetting) return;
                      setConfirmPassword(e.target.value);
                      if (confirmPasswordError) setConfirmPasswordError('');
                      if (serverError) setServerError('');
                    }}
                    required
                    className={`peer w-full py-[14px] pr-[42px] pl-[42px] bg-[#fafafa] dark:bg-[#1c1c20] text-[#262626] dark:text-[#f3f4f6] placeholder:text-[#737373] dark:placeholder:text-[#8e8e93] border rounded-[5px] text-[14px] outline-none ${
                      confirmPasswordError || matchStatus.status === 'mismatch'
                        ? 'border-[#ed4956] dark:border-[#f87171] focus:border-[#ed4956]'
                        : matchStatus.status === 'match'
                          ? 'border-[#16803c] dark:border-[#4ade80] focus:border-[#16803c]'
                          : 'border-[#dbdbdb] dark:border-[#323238] focus:border-[#a8a8a8] dark:focus:border-[#52525b]'
                    }`}
                  />
                  <Lock
                    className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 transition-colors ${
                      confirmPasswordError || matchStatus.status === 'mismatch'
                        ? 'text-[#ed4956] dark:text-[#f87171]'
                        : matchStatus.status === 'match'
                          ? 'text-[#16803c] dark:text-[#4ade80]'
                          : 'text-[#737373] dark:text-[#a1a1aa] peer-focus:text-[#262626] dark:peer-focus:text-[#f3f4f6]'
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
                    className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[#737373] dark:text-[#a1a1aa] hover:text-[#262626] dark:hover:text-[#f3f4f6] p-1 cursor-pointer bg-transparent border-0"
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
                    className="text-[#ed4956] dark:text-[#f87171] text-[13px] text-left mb-[15px]"
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
                          ? 'text-[#16803c] dark:text-[#4ade80]'
                          : 'text-[#ed4956] dark:text-[#f87171]'
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
                    className="text-[#ed4956] dark:text-[#f87171] text-[13px] text-left mb-[15px]"
                  >
                    {serverError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isResetting}
                  aria-busy={isResetting}
                  className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] disabled:bg-[#7cc8fb] dark:disabled:bg-[#0095f6]/40 disabled:hover:bg-[#7cc8fb] disabled:cursor-not-allowed text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
                >
                  {isResetting ? (
                    <>
                      <Loader2
                        className="w-4 h-4 animate-spin"
                        aria-hidden="true"
                      />
                      <span>Updating...</span>
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </button>
              </form>
            </div>

            {onBackToLogin && (
              <button
                type="button"
                onClick={onBackToLogin}
                className="inline-block mt-[25px] text-[#262626] dark:text-[#f3f4f6] bg-transparent border-0 text-[14px] font-bold cursor-pointer hover:underline"
              >
                Back to login
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}

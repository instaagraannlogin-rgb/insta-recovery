import {FormEvent, useRef, useState} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from 'lucide-react';
import {
  getPasswordMatchStatus,
  mapSupabaseAuthError,
  validatePasswordResetInput,
} from '../utils/recovery';
import {
  SUPABASE_NOT_CONFIGURED_ERROR,
  getSupabaseClient,
} from '../utils/supabaseClient';

interface PasswordResetProps {
  accountEmail?: string;
  hasRecoverySession: boolean;
  onBackToLogin?: () => void;
  onRequestNewLink?: () => void;
  onResetSuccess?: () => void;
}

export function PasswordReset({
  accountEmail,
  hasRecoverySession,
  onBackToLogin,
  onRequestNewLink,
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

  const matchStatus = getPasswordMatchStatus(newPassword, confirmPassword);

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

    const supabase = await getSupabaseClient();
    if (!supabase) {
      setServerError(SUPABASE_NOT_CONFIGURED_ERROR);
      return;
    }

    setIsResetting(true);

    try {
      const {data: sessionData} = await supabase.auth.getSession();
      if (!sessionData.session) {
        setServerError(
          'Your recovery link is missing or has expired. Please request a new password reset link.',
        );
        return;
      }

      const {error} = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setServerError(
          mapSupabaseAuthError(
            error,
            'Unable to update your password. Please try again.',
          ),
        );
        triggerShake();
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      setResetCompleted(true);
      onResetSuccess?.();
    } catch {
      setServerError('Network error while updating password.');
    } finally {
      setIsResetting(false);
    }
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

        {resetCompleted ? (
          <div key="reset-completed">
            <h2 className="text-[22px] font-bold mb-[15px]">Password updated</h2>

            <div className="flex justify-center mb-[15px]" aria-hidden="true">
              <CheckCircle2 className="w-10 h-10 text-[#16803c]" />
            </div>

            <p className="text-[14px] leading-[1.5] text-[#737373] mb-[25px]">
              Your password
              {accountEmail ? (
                <>
                  {' '}
                  for{' '}
                  <span className="font-semibold text-[#262626]">
                    {accountEmail}
                  </span>
                </>
              ) : null}{' '}
              has been updated securely via Supabase Auth.
            </p>

            <button
              key="return-to-login-btn"
              type="button"
              onClick={() => onBackToLogin?.()}
              className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer"
            >
              Continue to dashboard
            </button>
          </div>
        ) : !hasRecoverySession ? (
          <div>
            <h2 className="text-[22px] font-bold mb-[15px]">
              Reset link required
            </h2>

            <p className="text-[14px] leading-[1.5] text-[#737373] mb-[25px]">
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
              className="text-[#262626] bg-transparent border-0 text-[14px] font-bold cursor-pointer hover:underline"
            >
              Back to login
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-[22px] font-bold mb-[15px]">
              Set a new password
            </h2>

            <p className="text-[14px] leading-[1.5] text-[#737373] mb-[25px]">
              {accountEmail ? (
                <>
                  Create a new password for{' '}
                  <span className="font-semibold text-[#262626]">
                    {accountEmail}
                  </span>
                  .
                </>
              ) : (
                'Enter your new password below.'
              )}
            </p>

            <div ref={formWrapperRef} data-testid="password-reset-wrapper">
              <form id="passwordResetForm" onSubmit={handleSubmit} noValidate>
                <div
                  className={`relative ${newPasswordError ? 'mb-[8px]' : 'mb-[12px]'}`}
                >
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    id="new-password"
                    autoComplete="new-password"
                    aria-label="New password"
                    aria-invalid={Boolean(newPasswordError)}
                    aria-describedby={
                      newPasswordError ? 'new-password-error' : undefined
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
                      showNewPassword
                        ? 'Hide new password'
                        : 'Show new password'
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
                    className="text-[#ed4956] text-[13px] text-left mb-[12px]"
                  >
                    {newPasswordError}
                  </p>
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
                      if (isSubmittingReset(isResetting)) return;
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
                className="inline-block mt-[25px] text-[#262626] bg-transparent border-0 text-[14px] font-bold cursor-pointer hover:underline"
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

function isSubmittingReset(flag: boolean): boolean {
  return flag;
}

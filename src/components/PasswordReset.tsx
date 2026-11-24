import {FormEvent, useState, useRef} from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from 'lucide-react';
import {auth} from '../firebase';
import {mapFirebaseAuthError} from '../utils/firebaseAuth';
import {
  getPasswordMatchStatus,
  validatePasswordResetInput,
} from '../utils/recovery';

interface PasswordResetProps {
  account: string;
  onBackToLogin?: () => void;
  onUseDifferentAccount?: () => void;
  onResetSuccess?: () => void;
}

export function PasswordReset({
  account,
  onBackToLogin,
  onUseDifferentAccount,
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

    const currentUser = auth.currentUser;
    const userEmail = currentUser?.email || account;
    if (!currentUser || !userEmail) {
      setServerError('Please sign in with your email and password first.');
      triggerShake();
      return;
    }

    setIsResetting(true);

    try {
      const credential = EmailAuthProvider.credential(
        userEmail,
        currentPassword,
      );
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setResetCompleted(true);
      onResetSuccess?.();
    } catch (error) {
      setServerError(mapFirebaseAuthError(error));
      triggerShake();
    } finally {
      setIsResetting(false);
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
          been updated.
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
          <div
            className={`relative ${currentPasswordError ? 'mb-[8px]' : 'mb-[12px]'}`}
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
                if (newPasswordError) setNewPasswordError('');
                if (serverError) setServerError('');
              }}
              required
              className={`peer w-full py-[14px] pr-[42px] pl-[42px] bg-[#fafafa] border rounded-[5px] text-[14px] outline-none ${
                currentPasswordError
                  ? 'border-[#ed4956] focus:border-[#ed4956]'
                  : 'border-[#dbdbdb] focus:border-[#a8a8a8]'
              }`}
            />
            <Lock
              className={`w-[18px] h-[18px] pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 ${
                currentPasswordError
                  ? 'text-[#ed4956]'
                  : 'text-[#737373] peer-focus:text-[#262626]'
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
              className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#262626] p-1 cursor-pointer bg-transparent border-0"
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
              className="text-[#ed4956] text-[13px] text-left mb-[12px]"
            >
              {currentPasswordError}
            </p>
          )}

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
              className="text-[#ed4956] text-[13px] text-left mb-[12px]"
            >
              {newPasswordError}
            </p>
          )}

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

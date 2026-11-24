import {FormEvent, useRef, useState} from 'react';
import {Eye, EyeOff, Lock, User} from 'lucide-react';
import {
  MAX_ACCOUNT_LENGTH,
  getAccountCharacterStatus,
  validateLoginInput,
} from '../utils/recovery';

interface LoginCardProps {
  onForgotPassword: () => void;
}

export function LoginCard({onForgotPassword}: LoginCardProps) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const formWrapperRef = useRef<HTMLDivElement | null>(null);

  const charStatus = getAccountCharacterStatus(account);

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateLoginInput(account, password);
    setAccountError(validation.accountError);
    setPasswordError(validation.passwordError);

    if (!validation.isValid) {
      triggerShake();
    }
  };

  return (
    <main className="min-h-[80vh] flex justify-center items-start py-[60px] px-[20px] max-[480px]:py-[45px]">
      <div className="w-full max-w-[390px] max-[480px]:max-w-[350px] text-center">
        <div
          className="w-[85px] h-[85px] border-2 border-[#262626] rounded-full mx-auto mb-[25px] flex justify-center items-center text-[#262626]"
          aria-hidden="true"
        >
          <User className="w-9 h-9 stroke-[1.75]" />
        </div>

        <h2 className="text-[22px] font-bold mb-[15px]">Sign in</h2>

        <p className="text-[14px] leading-[1.5] text-[#737373] mb-[25px]">
          Enter your username or email and password to access your account.
        </p>

        <div ref={formWrapperRef}>
          <form id="loginForm" onSubmit={handleSubmit} noValidate>
            <div
              className={`relative ${
                accountError || charStatus.showCounter ? 'mb-[8px]' : 'mb-[12px]'
              }`}
            >
              <input
                type="text"
                id="login-account"
                aria-label="Username or email"
                aria-invalid={Boolean(accountError)}
                aria-describedby={accountError ? 'login-account-error' : undefined}
                placeholder="Username or email"
                maxLength={MAX_ACCOUNT_LENGTH}
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value.slice(0, MAX_ACCOUNT_LENGTH));
                  if (accountError) setAccountError('');
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

            <div className={`relative ${passwordError ? 'mb-[8px]' : 'mb-[15px]'}`}>
              <input
                type={showPassword ? 'text' : 'password'}
                id="login-password"
                aria-label="Password"
                aria-invalid={Boolean(passwordError)}
                aria-describedby={
                  passwordError ? 'login-password-error' : undefined
                }
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError('');
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

            <button
              type="submit"
              className="w-full p-[13px] bg-[#0095f6] hover:bg-[#1877f2] text-white border-0 rounded-[5px] text-[14px] font-bold cursor-pointer transition-colors"
            >
              Log In
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
      </div>
    </main>
  );
}

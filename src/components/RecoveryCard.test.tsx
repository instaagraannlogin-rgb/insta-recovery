import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  EMPTY_ACCOUNT_ERROR,
  EMPTY_OTP_ERROR,
  INVALID_EMAIL_ERROR,
  INVALID_OTP_ERROR,
  LINK_SENT_MESSAGE,
  MAX_ACCOUNT_LENGTH,
} from '../utils/recovery';

const {resetPasswordForEmailMock, verifyOtpMock} = vi.hoisted(() => ({
  resetPasswordForEmailMock: vi.fn(),
  verifyOtpMock: vi.fn(),
}));

vi.mock('../utils/supabaseClient', () => ({
  SUPABASE_NOT_CONFIGURED_ERROR: 'Supabase is not configured.',
  getSupabaseClient: vi.fn(async () => ({
    auth: {
      resetPasswordForEmail: resetPasswordForEmailMock,
      verifyOtp: verifyOtpMock,
    },
  })),
}));

import {RecoveryCard} from './RecoveryCard';

describe('RecoveryCard', () => {
  beforeEach(() => {
    resetPasswordForEmailMock.mockReset();
    verifyOtpMock.mockReset();
  });

  it('validates empty, non-email, and malformed email entries without calling Supabase', async () => {
    const user = userEvent.setup();
    render(<RecoveryCard />);

    const input = screen.getByRole('textbox', {name: 'Email address'});
    const submitBtn = screen.getByRole('button', {name: 'Continue'});

    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(EMPTY_ACCOUNT_ERROR);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();

    await user.type(input, 'alex_dev');
    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_EMAIL_ERROR);
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it('shows approaching character limit counter at 50+ characters and enforces 64-char max', async () => {
    const user = userEvent.setup();
    render(<RecoveryCard />);

    const input = screen.getByRole('textbox', {name: 'Email address'});
    await user.type(input, 'a'.repeat(50));
    expect(screen.getByText('50/64')).toBeInTheDocument();

    await user.type(input, 'b'.repeat(20));
    expect(input).toHaveValue('a'.repeat(50) + 'b'.repeat(14));
    expect(
      screen.getByText(`${MAX_ACCOUNT_LENGTH}/${MAX_ACCOUNT_LENGTH}`),
    ).toBeInTheDocument();
  });

  it('sends reset email, enforces 8-digit OTP validation, and verifies via supabase.auth.verifyOtp', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    const onBackToLogin = vi.fn();
    const onOtpVerified = vi.fn();

    resetPasswordForEmailMock.mockResolvedValueOnce({data: {}, error: null});
    verifyOtpMock.mockResolvedValueOnce({
      data: {session: {access_token: 'recovery-token'}},
      error: null,
    });

    render(
      <RecoveryCard
        onBackToLogin={onBackToLogin}
        onOtpVerified={onOtpVerified}
        onNotify={onNotify}
      />,
    );

    await user.type(
      screen.getByRole('textbox', {name: 'Email address'}),
      '  alex@example.com  ',
    );
    await user.click(screen.getByRole('button', {name: 'Continue'}));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {name: 'Check your email'}),
      ).toBeInTheDocument();
    });
    expect(resetPasswordForEmailMock).toHaveBeenCalledWith(
      'alex@example.com',
      expect.objectContaining({
        redirectTo: expect.stringContaining('#reset-password'),
      }),
    );
    expect(onNotify).toHaveBeenCalledWith(
      LINK_SENT_MESSAGE,
      'Reset email sent',
    );

    const otpInput = screen.getByRole('textbox', {
      name: '8-digit verification code',
    });
    expect(otpInput).toHaveAttribute('maxLength', '8');
    expect(screen.getByText('0/8 digits')).toBeInTheDocument();

    // Empty OTP rejected locally
    await user.click(screen.getByRole('button', {name: 'Verify code'}));
    expect(screen.getByRole('alert')).toHaveTextContent(EMPTY_OTP_ERROR);
    expect(verifyOtpMock).not.toHaveBeenCalled();

    // Fewer than 8 digits rejected locally, non-digits stripped
    await user.type(otpInput, '12ab3456');
    expect(otpInput).toHaveValue('123456');
    expect(screen.getByText('6/8 digits')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Verify code'}));
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_OTP_ERROR);
    expect(verifyOtpMock).not.toHaveBeenCalled();

    // Completing 8 digits calls verifyOtp with type 'recovery'
    await user.type(otpInput, '7890');
    expect(otpInput).toHaveValue('12345678');
    expect(screen.getByText('8/8 digits')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Verify code'}));

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({
        email: 'alex@example.com',
        token: '12345678',
        type: 'recovery',
      });
    });
    expect(onOtpVerified).toHaveBeenCalledWith(
      {access_token: 'recovery-token'},
      'alex@example.com',
    );

    await user.click(screen.getByRole('link', {name: 'Back to login'}));
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });

  it('displays Supabase resetPasswordForEmail errors, shows loading spinner, and forwards any 8-digit OTP', async () => {
    const user = userEvent.setup();
    const onOtpVerified = vi.fn();

    let resolveReset!: (value: {data: object; error: null}) => void;
    resetPasswordForEmailMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReset = resolve;
        }),
    );

    render(<RecoveryCard onOtpVerified={onOtpVerified} />);
    await user.type(
      screen.getByRole('textbox', {name: 'Email address'}),
      'alex@example.com',
    );

    const continueBtn = screen.getByRole('button', {name: 'Continue'});
    await user.click(continueBtn);
    await user.click(continueBtn);

    expect(continueBtn).toBeDisabled();
    expect(continueBtn).toHaveAttribute('aria-busy', 'true');
    expect(continueBtn).toHaveTextContent('Sending...');
    expect(resetPasswordForEmailMock).toHaveBeenCalledTimes(1);

    resolveReset({data: {}, error: null});
    await screen.findByRole('heading', {name: 'Check your email'});

    verifyOtpMock.mockResolvedValueOnce({
      data: {session: null},
      error: {message: 'Token has expired or is invalid'},
    });
    await user.type(
      screen.getByRole('textbox', {name: '8-digit verification code'}),
      '87654321',
    );
    await user.click(screen.getByRole('button', {name: 'Verify code'}));

    await waitFor(() => {
      expect(onOtpVerified).toHaveBeenCalledWith(null, 'alex@example.com');
    });
  });
});

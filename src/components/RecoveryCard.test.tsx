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

const {apiRequestMock} = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('../utils/apiClient', () => ({
  apiRequest: apiRequestMock,
}));

import {RecoveryCard} from './RecoveryCard';

describe('RecoveryCard', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('validates empty, non-email, and malformed email entries without calling API', async () => {
    const user = userEvent.setup();
    render(<RecoveryCard />);

    const input = screen.getByRole('textbox', {name: 'Email address'});
    const submitBtn = screen.getByRole('button', {name: 'Continue'});

    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(EMPTY_ACCOUNT_ERROR);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(apiRequestMock).not.toHaveBeenCalled();

    await user.type(input, 'alex_dev');
    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_EMAIL_ERROR);
    expect(apiRequestMock).not.toHaveBeenCalled();
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

  it('submits recovery request, enforces 8-digit OTP validation, and verifies via backend API', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    const onBackToLogin = vi.fn();
    const onOtpVerified = vi.fn();

    apiRequestMock.mockResolvedValueOnce({
      ok: true,
      data: {ok: true, message: LINK_SENT_MESSAGE},
    });
    apiRequestMock.mockResolvedValueOnce({
      ok: true,
      data: {verified: true, email: 'alex@example.com'},
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
    expect(apiRequestMock).toHaveBeenCalledWith('/api/auth/recovery/request', {
      method: 'POST',
      body: {email: 'alex@example.com'},
    });
    expect(onNotify).toHaveBeenCalledWith(
      LINK_SENT_MESSAGE,
      'Reset email sent',
    );

    const otpInput = screen.getByRole('textbox', {
      name: '8-digit verification code',
    });
    expect(otpInput).toHaveAttribute('maxLength', '8');
    expect(screen.getByText('0/8 digits')).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Verify code'}));
    expect(screen.getByRole('alert')).toHaveTextContent(EMPTY_OTP_ERROR);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    await user.type(otpInput, '12ab3456');
    expect(otpInput).toHaveValue('123456');
    expect(screen.getByText('6/8 digits')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Verify code'}));
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_OTP_ERROR);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    await user.type(otpInput, '7890');
    expect(otpInput).toHaveValue('12345678');
    expect(screen.getByText('8/8 digits')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Verify code'}));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/api/auth/recovery/verify', {
        method: 'POST',
        body: {
          email: 'alex@example.com',
          otp: '12345678',
        },
      });
    });
    expect(onOtpVerified).toHaveBeenCalledWith(null, 'alex@example.com');

    await user.click(screen.getByRole('link', {name: 'Back to login'}));
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });

  it('shows loading spinner and forwards 8-digit OTP cleanly', async () => {
    const user = userEvent.setup();
    const onOtpVerified = vi.fn();

    let resolveReset!: (value: {ok: true; data: {ok: boolean}}) => void;
    apiRequestMock.mockImplementationOnce(
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
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    resolveReset({ok: true, data: {ok: true}});
    await screen.findByRole('heading', {name: 'Check your email'});

    apiRequestMock.mockResolvedValueOnce({
      ok: true,
      data: {verified: true, email: 'alex@example.com'},
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

import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  CONFIRM_PASSWORD_EMPTY_ERROR,
  EMPTY_CURRENT_PASSWORD_ERROR,
  EMPTY_PASSWORD_ERROR,
  PASSWORD_MISMATCH_ERROR,
  SHORT_PASSWORD_ERROR,
} from '../utils/recovery';

const {getSessionMock, updateUserMock} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  updateUserMock: vi.fn(),
}));

vi.mock('../utils/supabaseClient', () => ({
  SUPABASE_NOT_CONFIGURED_ERROR: 'Supabase is not configured.',
  getSupabaseClient: vi.fn(async () => ({
    auth: {
      getSession: getSessionMock,
      updateUser: updateUserMock,
    },
  })),
}));

import {PasswordReset} from './PasswordReset';

describe('PasswordReset', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    updateUserMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: {session: {user: {email: 'alex@example.com'}}},
    });
  });

  it('blocks reset form when no recovery session is active', async () => {
    const user = userEvent.setup();
    const onRequestNewLink = vi.fn();

    render(
      <PasswordReset
        hasRecoverySession={false}
        onRequestNewLink={onRequestNewLink}
      />,
    );

    expect(
      screen.getByRole('heading', {name: 'Reset link required'}),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Request reset link'}));
    expect(onRequestNewLink).toHaveBeenCalledTimes(1);
  });

  it('validates current, new, and confirm passwords and supports real-time match feedback', async () => {
    const user = userEvent.setup();
    render(
      <PasswordReset accountEmail="alex@example.com" hasRecoverySession={true} />,
    );

    await user.click(screen.getByRole('button', {name: 'Reset Password'}));
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(EMPTY_CURRENT_PASSWORD_ERROR);
    expect(alerts[1]).toHaveTextContent(EMPTY_PASSWORD_ERROR);
    expect(alerts[2]).toHaveTextContent(CONFIRM_PASSWORD_EMPTY_ERROR);
    expect(updateUserMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Current password'), 'OldPass123');
    const newPwd = screen.getByLabelText('New password');
    const confirmPwd = screen.getByLabelText('Confirm password');
    await user.type(newPwd, '123');
    await user.type(confirmPwd, '456');
    expect(screen.getByTestId('password-match-status')).toHaveTextContent(
      'Passwords do not match',
    );

    await user.click(screen.getByRole('button', {name: 'Reset Password'}));
    const updatedAlerts = screen.getAllByRole('alert');
    expect(updatedAlerts[0]).toHaveTextContent(SHORT_PASSWORD_ERROR);
    expect(updatedAlerts[1]).toHaveTextContent(PASSWORD_MISMATCH_ERROR);
  });

  it('updates password via supabase.auth.updateUser and displays Password changed successfully', async () => {
    const user = userEvent.setup();
    const onResetSuccess = vi.fn();
    const onBackToLogin = vi.fn();
    updateUserMock.mockResolvedValueOnce({data: {}, error: null});

    render(
      <PasswordReset
        accountEmail="alex@example.com"
        hasRecoverySession={true}
        onResetSuccess={onResetSuccess}
        onBackToLogin={onBackToLogin}
      />,
    );

    await user.type(screen.getByLabelText('Current password'), 'OldPass123');
    await user.type(screen.getByLabelText('New password'), 'StrongPass123');
    await user.type(screen.getByLabelText('Confirm password'), 'StrongPass123');
    expect(screen.getByTestId('password-match-status')).toHaveTextContent(
      'Passwords match',
    );

    await user.click(screen.getByRole('button', {name: 'Reset Password'}));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {name: 'Password changed successfully'}),
      ).toBeInTheDocument();
    });
    expect(updateUserMock).toHaveBeenCalledWith({password: 'StrongPass123'});
    expect(onResetSuccess).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', {name: 'Continue to dashboard'}),
    );
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });

  it('displays password strength meter progression and Password changed successfully for otpForwarded flow', async () => {
    const user = userEvent.setup();
    getSessionMock.mockResolvedValueOnce({data: {session: null}});

    render(
      <PasswordReset
        accountEmail="alex@example.com"
        hasRecoverySession={false}
        otpForwarded={true}
      />,
    );

    expect(
      screen.getByRole('heading', {name: 'Set a new password'}),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('password-strength-meter'),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Current password'), 'OldPass123');
    const newPwd = screen.getByLabelText('New password');
    await user.type(newPwd, 'abc');
    expect(screen.getByTestId('password-strength-meter')).toBeInTheDocument();
    expect(screen.getByTestId('password-strength-label')).toHaveTextContent(
      'Weak',
    );

    await user.clear(newPwd);
    await user.type(newPwd, 'Abcdef12!');
    expect(screen.getByTestId('password-strength-label')).toHaveTextContent(
      'Strong',
    );
    expect(
      screen.getByRole('progressbar', {name: 'Password strength'}),
    ).toHaveAttribute('aria-valuenow', '4');

    await user.type(screen.getByLabelText('Confirm password'), 'Abcdef12!');
    await user.click(screen.getByRole('button', {name: 'Reset Password'}));
    expect(
      await screen.findByRole('heading', {
        name: 'Password changed successfully',
      }),
    ).toBeInTheDocument();
  });
});

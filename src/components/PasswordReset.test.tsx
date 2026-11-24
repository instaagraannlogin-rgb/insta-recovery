import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {FirebaseError} from 'firebase/app';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  CONFIRM_PASSWORD_EMPTY_ERROR,
  CURRENT_PASSWORD_EMPTY_ERROR,
  EMPTY_PASSWORD_ERROR,
  PASSWORD_MISMATCH_ERROR,
  SAME_AS_CURRENT_PASSWORD_ERROR,
  SHORT_PASSWORD_ERROR,
} from '../utils/recovery';

const {
  mockAuth,
  credentialMock,
  reauthenticateWithCredentialMock,
  updatePasswordMock,
} = vi.hoisted(() => ({
  mockAuth: {
    currentUser: {email: 'alex@example.com'} as {email: string} | null,
  },
  credentialMock: vi.fn((email: string, password: string) => ({
    email,
    password,
  })),
  reauthenticateWithCredentialMock: vi.fn(),
  updatePasswordMock: vi.fn(),
}));

vi.mock('../firebase', () => ({
  auth: mockAuth,
}));

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>();
  return {
    ...actual,
    EmailAuthProvider: {
      credential: credentialMock,
    },
    reauthenticateWithCredential: reauthenticateWithCredentialMock,
    updatePassword: updatePasswordMock,
  };
});

import {PasswordReset} from './PasswordReset';

describe('PasswordReset', () => {
  beforeEach(() => {
    mockAuth.currentUser = {email: 'alex@example.com'};
    credentialMock.mockClear();
    reauthenticateWithCredentialMock.mockReset();
    updatePasswordMock.mockReset();
  });

  it('provides real-time password matching feedback and visibility toggles across all three fields', async () => {
    const user = userEvent.setup();
    render(<PasswordReset account="alex@example.com" />);

    const currentPwd = screen.getByLabelText('Current password');
    const newPwd = screen.getByLabelText('New password');
    const confirmPwd = screen.getByLabelText('Confirm password');

    expect(
      screen.queryByTestId('password-match-status'),
    ).not.toBeInTheDocument();

    await user.type(newPwd, 'Secret123');
    await user.type(confirmPwd, 'Secret12');
    expect(screen.getByTestId('password-match-status')).toHaveTextContent(
      'Passwords do not match',
    );
    expect(confirmPwd).toHaveAttribute('aria-invalid', 'true');

    await user.type(confirmPwd, '3');
    expect(screen.getByTestId('password-match-status')).toHaveTextContent(
      'Passwords match',
    );
    expect(confirmPwd).toHaveAttribute('aria-invalid', 'false');

    expect(currentPwd).toHaveAttribute('type', 'password');
    await user.click(
      screen.getByRole('button', {name: 'Show current password'}),
    );
    expect(currentPwd).toHaveAttribute('type', 'text');

    expect(newPwd).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', {name: 'Show new password'}));
    expect(newPwd).toHaveAttribute('type', 'text');

    expect(confirmPwd).toHaveAttribute('type', 'password');
    await user.click(
      screen.getByRole('button', {name: 'Show confirm password'}),
    );
    expect(confirmPwd).toHaveAttribute('type', 'text');
  });

  it('validates current, new, and confirm passwords before calling Firebase Auth', async () => {
    const user = userEvent.setup();
    render(<PasswordReset account="alex@example.com" />);

    await user.click(screen.getByRole('button', {name: 'Reset Password'}));
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(CURRENT_PASSWORD_EMPTY_ERROR);
    expect(alerts[1]).toHaveTextContent(EMPTY_PASSWORD_ERROR);
    expect(alerts[2]).toHaveTextContent(CONFIRM_PASSWORD_EMPTY_ERROR);
    expect(reauthenticateWithCredentialMock).not.toHaveBeenCalled();

    const currentPwd = screen.getByLabelText('Current password');
    const newPwd = screen.getByLabelText('New password');
    const confirmPwd = screen.getByLabelText('Confirm password');

    await user.type(currentPwd, 'OldPass123');
    await user.type(newPwd, '123');
    await user.type(confirmPwd, '456');
    await user.click(screen.getByRole('button', {name: 'Reset Password'}));

    const updatedAlerts = screen.getAllByRole('alert');
    expect(updatedAlerts[0]).toHaveTextContent(SHORT_PASSWORD_ERROR);
    expect(updatedAlerts[1]).toHaveTextContent(PASSWORD_MISMATCH_ERROR);

    await user.clear(newPwd);
    await user.clear(confirmPwd);
    await user.type(newPwd, 'OldPass123');
    await user.type(confirmPwd, 'OldPass123');
    await user.click(screen.getByRole('button', {name: 'Reset Password'}));
    expect(screen.getByRole('alert')).toHaveTextContent(
      SAME_AS_CURRENT_PASSWORD_ERROR,
    );
    expect(reauthenticateWithCredentialMock).not.toHaveBeenCalled();
  });

  it('reauthenticates and calls updatePassword on Firebase user, then renders completion view', async () => {
    const user = userEvent.setup();
    const onResetSuccess = vi.fn();
    const onBackToLogin = vi.fn();

    let resolveReauth: () => void = () => {};
    reauthenticateWithCredentialMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveReauth = resolve;
      }),
    );
    updatePasswordMock.mockResolvedValueOnce(undefined);

    render(
      <PasswordReset
        account="alex@example.com"
        onResetSuccess={onResetSuccess}
        onBackToLogin={onBackToLogin}
      />,
    );

    await user.type(screen.getByLabelText('Current password'), 'OldPass123');
    await user.type(screen.getByLabelText('New password'), 'NewStrong99');
    await user.type(screen.getByLabelText('Confirm password'), 'NewStrong99');
    await user.click(screen.getByRole('button', {name: 'Reset Password'}));

    const updatingBtn = screen.getByRole('button', {name: 'Updating...'});
    expect(updatingBtn).toBeDisabled();
    expect(updatingBtn).toHaveAttribute('aria-busy', 'true');
    expect(credentialMock).toHaveBeenCalledWith(
      'alex@example.com',
      'OldPass123',
    );
    expect(reauthenticateWithCredentialMock).toHaveBeenCalledTimes(1);

    resolveReauth();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {name: 'Password updated'}),
      ).toBeInTheDocument();
    });
    expect(updatePasswordMock).toHaveBeenCalledWith(
      mockAuth.currentUser,
      'NewStrong99',
    );
    expect(onResetSuccess).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', {name: 'Return to login'}));
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });

  it('surfaces Firebase reauthentication errors without completing reset', async () => {
    const user = userEvent.setup();
    reauthenticateWithCredentialMock.mockRejectedValueOnce(
      new FirebaseError('auth/invalid-credential', 'Invalid credential'),
    );

    render(<PasswordReset account="alex@example.com" />);

    await user.type(screen.getByLabelText('Current password'), 'WrongPass123');
    await user.type(screen.getByLabelText('New password'), 'NewStrong99');
    await user.type(screen.getByLabelText('Confirm password'), 'NewStrong99');
    await user.click(screen.getByRole('button', {name: 'Reset Password'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Invalid email or password/i,
    );
    expect(updatePasswordMock).not.toHaveBeenCalled();
  });
});

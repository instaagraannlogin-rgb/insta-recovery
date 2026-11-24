import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {
  CONFIRM_PASSWORD_EMPTY_ERROR,
  EMPTY_PASSWORD_ERROR,
  PASSWORD_MISMATCH_ERROR,
  SHORT_PASSWORD_ERROR,
} from '../utils/recovery';
import {PasswordReset} from './PasswordReset';

describe('PasswordReset', () => {
  const defaultProps = {
    account: 'alex@example.com',
    verificationCode: '123456',
    resetToken: 'signed.reset.token',
  };

  it('updates password strength indicators for length, uppercase, lowercase, and numbers', async () => {
    const user = userEvent.setup();
    render(<PasswordReset {...defaultProps} />);

    const newPwd = screen.getByLabelText('New password');
    expect(
      screen.queryByTestId('password-strength-label'),
    ).not.toBeInTheDocument();

    await user.type(newPwd, 'abc');
    expect(screen.getByTestId('password-strength-label')).toHaveTextContent(
      'Weak',
    );
    expect(screen.getByText('Lowercase letter').closest('li')).toHaveAttribute(
      'data-met',
      'true',
    );
    expect(screen.getByText('8+ characters').closest('li')).toHaveAttribute(
      'data-met',
      'false',
    );

    await user.clear(newPwd);
    await user.type(newPwd, 'Abcdef');
    expect(screen.getByTestId('password-strength-label')).toHaveTextContent(
      'Fair',
    );
    expect(screen.getByText('Uppercase letter').closest('li')).toHaveAttribute(
      'data-met',
      'true',
    );

    await user.clear(newPwd);
    await user.type(newPwd, 'secret123');
    expect(screen.getByTestId('password-strength-label')).toHaveTextContent(
      'Good',
    );
    expect(screen.getByText('8+ characters').closest('li')).toHaveAttribute(
      'data-met',
      'true',
    );
    expect(screen.getByText('Number (0-9)').closest('li')).toHaveAttribute(
      'data-met',
      'true',
    );

    await user.clear(newPwd);
    await user.type(newPwd, 'Secret123');
    expect(screen.getByTestId('password-strength-label')).toHaveTextContent(
      'Strong',
    );
  });

  it('provides real-time password matching feedback and supports visibility toggles', async () => {
    const user = userEvent.setup();
    render(<PasswordReset {...defaultProps} />);

    const newPwd = screen.getByLabelText('New password');
    const confirmPwd = screen.getByLabelText('Confirm new password');

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

    await user.type(newPwd, '!');
    expect(screen.getByTestId('password-match-status')).toHaveTextContent(
      'Passwords do not match',
    );

    expect(newPwd).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', {name: 'Show new password'}));
    expect(newPwd).toHaveAttribute('type', 'text');

    expect(confirmPwd).toHaveAttribute('type', 'password');
    await user.click(
      screen.getByRole('button', {name: 'Show confirm password'}),
    );
    expect(confirmPwd).toHaveAttribute('type', 'text');
  });

  it('validates fields on submit and blocks fetch when invalid', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<PasswordReset {...defaultProps} />);

    await user.click(screen.getByRole('button', {name: 'Reset Password'}));
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(EMPTY_PASSWORD_ERROR);
    expect(alerts[1]).toHaveTextContent(CONFIRM_PASSWORD_EMPTY_ERROR);
    expect(fetchSpy).not.toHaveBeenCalled();

    const newPwd = screen.getByLabelText('New password');
    const confirmPwd = screen.getByLabelText('Confirm new password');

    await user.type(newPwd, '123');
    await user.type(confirmPwd, '456');
    await user.click(screen.getByRole('button', {name: 'Reset Password'}));

    const updatedAlerts = screen.getAllByRole('alert');
    expect(updatedAlerts[0]).toHaveTextContent(SHORT_PASSWORD_ERROR);
    expect(updatedAlerts[1]).toHaveTextContent(PASSWORD_MISMATCH_ERROR);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submits new password to /api/password-reset, handles loading, and renders completion view', async () => {
    const user = userEvent.setup();
    const onResetSuccess = vi.fn();
    const onBackToLogin = vi.fn();

    let resolveFetch: (value: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

    render(
      <PasswordReset
        {...defaultProps}
        onResetSuccess={onResetSuccess}
        onBackToLogin={onBackToLogin}
      />,
    );

    await user.type(screen.getByLabelText('New password'), 'Secret123');
    await user.type(screen.getByLabelText('Confirm new password'), 'Secret123');
    await user.click(screen.getByRole('button', {name: 'Reset Password'}));

    const updatingBtn = screen.getByRole('button', {name: 'Updating...'});
    expect(updatingBtn).toBeDisabled();
    expect(updatingBtn).toHaveAttribute('aria-busy', 'true');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/password-reset',
      expect.objectContaining({
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          account: 'alex@example.com',
          verificationCode: '123456',
          newPassword: 'Secret123',
          confirmPassword: 'Secret123',
          resetToken: 'signed.reset.token',
        }),
      }),
    );

    resolveFetch(
      new Response(JSON.stringify({message: 'Password updated successfully.'}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {name: 'Password updated'}),
      ).toBeInTheDocument();
    });
    expect(onResetSuccess).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', {name: 'Return to login'}));
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });

  it('surfaces Supabase update errors and network failures without completing reset', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'No matching recovery record found in Supabase.',
          }),
          {status: 404, headers: {'Content-Type': 'application/json'}},
        ),
      )
      .mockRejectedValueOnce(new Error('network failure'));

    render(<PasswordReset {...defaultProps} />);

    await user.type(screen.getByLabelText('New password'), 'Secret123');
    await user.type(screen.getByLabelText('Confirm new password'), 'Secret123');
    await user.click(screen.getByRole('button', {name: 'Reset Password'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No matching recovery record found in Supabase.',
    );
    expect(
      screen.getByRole('heading', {name: 'Set a new password'}),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Reset Password'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network error while updating password.',
    );
  });
});

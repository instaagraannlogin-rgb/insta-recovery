import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {FirebaseError} from 'firebase/app';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  EMPTY_ACCOUNT_ERROR,
  INVALID_EMAIL_ERROR,
  MAX_ACCOUNT_LENGTH,
} from '../utils/recovery';

const {sendPasswordResetEmailMock} = vi.hoisted(() => ({
  sendPasswordResetEmailMock: vi.fn(),
}));

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>();
  return {
    ...actual,
    sendPasswordResetEmail: sendPasswordResetEmailMock,
  };
});

import {auth} from '../firebase';
import {RecoveryCard} from './RecoveryCard';

describe('RecoveryCard', () => {
  beforeEach(() => {
    sendPasswordResetEmailMock.mockReset();
  });

  it('validates empty, non-email, and malformed email entries without calling sendPasswordResetEmail', async () => {
    const user = userEvent.setup();
    render(<RecoveryCard />);

    const input = screen.getByRole('textbox', {name: 'Email address'});
    const submitBtn = screen.getByRole('button', {name: 'Continue'});

    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(EMPTY_ACCOUNT_ERROR);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();

    await user.type(input, 'alex_dev');
    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_EMAIL_ERROR);
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, 'bad@');
    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_EMAIL_ERROR);
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();

    await user.type(input, 'example.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows approaching character limit counter at 50+ characters and enforces 64-char max', async () => {
    const user = userEvent.setup();
    render(<RecoveryCard />);

    const input = screen.getByRole('textbox', {name: 'Email address'});
    expect(screen.queryByText(/\/64$/)).not.toBeInTheDocument();

    await user.type(input, 'a'.repeat(50));
    expect(screen.getByText('50/64')).toBeInTheDocument();

    await user.type(input, 'b'.repeat(20));
    expect(input).toHaveValue('a'.repeat(50) + 'b'.repeat(14));
    expect(
      screen.getByText(`${MAX_ACCOUNT_LENGTH}/${MAX_ACCOUNT_LENGTH}`),
    ).toBeInTheDocument();
  });

  it('triggers shake animation on invalid submission when Element.animate is available', async () => {
    const user = userEvent.setup();
    render(<RecoveryCard />);

    const wrapper = screen.getByTestId('account-input-wrapper');
    const animateSpy = vi.fn();
    wrapper.animate = animateSpy;

    await user.click(screen.getByRole('button', {name: 'Continue'}));
    expect(animateSpy).toHaveBeenCalledTimes(1);
  });

  it('calls Firebase sendPasswordResetEmail with trimmed email, shows loading state, and renders email-sent confirmation', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    const onBackToLogin = vi.fn();

    let resolveReset: () => void = () => {};
    sendPasswordResetEmailMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveReset = resolve;
      }),
    );

    render(<RecoveryCard onBackToLogin={onBackToLogin} onNotify={onNotify} />);

    const input = screen.getByRole('textbox', {name: 'Email address'});
    await user.type(input, '  alex@example.com  ');
    await user.click(screen.getByRole('button', {name: 'Continue'}));

    const loadingBtn = screen.getByRole('button', {name: 'Sending...'});
    expect(loadingBtn).toBeDisabled();
    expect(loadingBtn).toHaveAttribute('aria-busy', 'true');
    expect(input).toHaveAttribute('readonly');
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(
      auth,
      'alex@example.com',
    );

    resolveReset();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {name: 'Check your email'}),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith(
      'Password reset email sent. Check your inbox to reset your password.',
      'Recovery link sent',
    );

    await user.click(screen.getByRole('button', {name: 'Use a different email'}));
    expect(
      screen.getByRole('heading', {name: 'Forgot your password?'}),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', {name: 'Back to login'}));
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });

  it('displays Firebase Auth errors cleanly without advancing', async () => {
    const user = userEvent.setup();
    sendPasswordResetEmailMock.mockRejectedValueOnce(
      new FirebaseError('auth/too-many-requests', 'Too many requests'),
    );

    render(<RecoveryCard />);

    await user.type(
      screen.getByRole('textbox', {name: 'Email address'}),
      'alex@example.com',
    );
    await user.click(screen.getByRole('button', {name: 'Continue'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Too many attempts/i,
    );
    expect(
      screen.getByRole('heading', {name: 'Forgot your password?'}),
    ).toBeInTheDocument();
  });
});

import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  EMPTY_ACCOUNT_ERROR,
  INVALID_EMAIL_ERROR,
  LINK_SENT_MESSAGE,
  MAX_ACCOUNT_LENGTH,
} from '../utils/recovery';

const {resetPasswordForEmailMock} = vi.hoisted(() => ({
  resetPasswordForEmailMock: vi.fn(),
}));

vi.mock('../utils/supabaseClient', () => ({
  SUPABASE_NOT_CONFIGURED_ERROR: 'Supabase is not configured.',
  getSupabaseClient: vi.fn(async () => ({
    auth: {
      resetPasswordForEmail: resetPasswordForEmailMock,
    },
  })),
}));

import {RecoveryCard} from './RecoveryCard';

describe('RecoveryCard', () => {
  beforeEach(() => {
    resetPasswordForEmailMock.mockReset();
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

  it('calls supabase.auth.resetPasswordForEmail and renders confirmation view', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    const onBackToLogin = vi.fn();

    resetPasswordForEmailMock.mockResolvedValueOnce({data: {}, error: null});

    render(<RecoveryCard onBackToLogin={onBackToLogin} onNotify={onNotify} />);

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

    await user.click(screen.getByRole('link', {name: 'Back to login'}));
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });

  it('displays Supabase resetPasswordForEmail errors cleanly', async () => {
    const user = userEvent.setup();
    resetPasswordForEmailMock.mockResolvedValueOnce({
      data: null,
      error: {message: 'Email rate limit exceeded'},
    });

    render(<RecoveryCard />);
    await user.type(
      screen.getByRole('textbox', {name: 'Email address'}),
      'alex@example.com',
    );
    await user.click(screen.getByRole('button', {name: 'Continue'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Too many requests/i,
    );
  });
});

import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {
  CODE_VERIFIED_MESSAGE,
  EMPTY_ACCOUNT_ERROR,
  EMPTY_CODE_ERROR,
  INVALID_CODE_ERROR,
  INVALID_EMAIL_ERROR,
  INVALID_USERNAME_ERROR,
  MAX_ACCOUNT_LENGTH,
} from '../utils/recovery';
import {RecoveryCard} from './RecoveryCard';

describe('RecoveryCard', () => {
  it('validates empty, malformed email, and invalid username entries without calling fetch', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<RecoveryCard />);

    const input = screen.getByRole('textbox', {name: 'Username or email'});
    const submitBtn = screen.getByRole('button', {name: 'Continue'});

    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(EMPTY_ACCOUNT_ERROR);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(fetchSpy).not.toHaveBeenCalled();

    await user.type(input, 'bad@');
    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_EMAIL_ERROR);
    expect(fetchSpy).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, 'a!');
    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_USERNAME_ERROR);
    expect(fetchSpy).not.toHaveBeenCalled();

    await user.type(input, 'valid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows approaching character limit counter at 50+ characters and enforces 64-char max', async () => {
    const user = userEvent.setup();
    render(<RecoveryCard />);

    const input = screen.getByRole('textbox', {name: 'Username or email'});
    expect(screen.queryByText(/\/64$/)).not.toBeInTheDocument();

    await user.type(input, 'a'.repeat(50));
    expect(screen.getByText('50/64')).toBeInTheDocument();

    await user.type(input, 'b'.repeat(20));
    expect(input).toHaveValue('a'.repeat(50) + 'b'.repeat(14));
    expect(screen.getByText(`${MAX_ACCOUNT_LENGTH}/${MAX_ACCOUNT_LENGTH}`)).toBeInTheDocument();
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

  it('submits trimmed account to /api/recovery, shows loading state, and advances to verification step', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();

    let resolveFetch: (value: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

    render(<RecoveryCard onNotify={onNotify} />);

    const input = screen.getByRole('textbox', {name: 'Username or email'});
    await user.type(input, '  alex@example.com  ');
    await user.click(screen.getByRole('button', {name: 'Continue'}));

    const loadingBtn = screen.getByRole('button', {name: 'Sending...'});
    expect(loadingBtn).toBeDisabled();
    expect(loadingBtn).toHaveAttribute('aria-busy', 'true');
    expect(input).toHaveAttribute('readonly');

    await user.click(loadingBtn);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/recovery',
      expect.objectContaining({
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({account: 'alex@example.com'}),
      }),
    );

    resolveFetch(
      new Response(
        JSON.stringify({
          message: 'Link sent successfully.',
          resetToken: 'signed.reset.token',
        }),
        {status: 201, headers: {'Content-Type': 'application/json'}},
      ),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {name: 'Enter verification code'}),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(document.getElementById('message')).toBeNull();
    expect(onNotify).toHaveBeenCalledWith(
      'Link sent successfully.',
      'Recovery link sent',
    );
  });

  it('displays Supabase backend errors and network errors cleanly', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error:
              'Unable to save recovery request to Supabase. Ensure the recovery_requests table and insert policy exist.',
          }),
          {status: 502, headers: {'Content-Type': 'application/json'}},
        ),
      )
      .mockRejectedValueOnce(new Error('offline'));

    render(<RecoveryCard />);

    const input = screen.getByRole('textbox', {name: 'Username or email'});
    await user.type(input, 'alex_dev');
    await user.click(screen.getByRole('button', {name: 'Continue'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Unable to save recovery request to Supabase/i,
    );
    expect(
      screen.getByRole('heading', {name: 'Forgot your password?'}),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Continue'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network error while submitting recovery request.',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('validates 6-digit verification code and transitions to PasswordReset or back to request/login', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    const onBackToLogin = vi.fn();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Link sent successfully.',
          resetToken: 'signed.token',
        }),
        {status: 201, headers: {'Content-Type': 'application/json'}},
      ),
    );

    render(<RecoveryCard onBackToLogin={onBackToLogin} onNotify={onNotify} />);

    await user.type(
      screen.getByRole('textbox', {name: 'Username or email'}),
      'alex@example.com',
    );
    await user.click(screen.getByRole('button', {name: 'Continue'}));

    const codeInput = await screen.findByRole('textbox', {
      name: 'Verification code',
    });

    await user.click(screen.getByRole('button', {name: 'Verify Code'}));
    expect(screen.getByRole('alert')).toHaveTextContent(EMPTY_CODE_ERROR);

    await user.type(codeInput, '12ab3');
    expect(codeInput).toHaveValue('123');

    await user.click(screen.getByRole('button', {name: 'Verify Code'}));
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CODE_ERROR);

    await user.type(codeInput, '456');
    expect(codeInput).toHaveValue('123456');

    await user.click(screen.getByRole('button', {name: 'Verify Code'}));
    expect(
      screen.getByRole('heading', {name: 'Set a new password'}),
    ).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith(CODE_VERIFIED_MESSAGE, 'Code verified');

    await user.click(
      screen.getByRole('button', {name: 'Use a different account'}),
    );
    expect(
      screen.getByRole('heading', {name: 'Forgot your password?'}),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', {name: 'Back to login'}));
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });
});

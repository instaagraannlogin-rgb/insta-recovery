import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  EMPTY_ACCOUNT_ERROR,
  EMPTY_PASSWORD_ERROR,
  INVALID_EMAIL_ERROR,
} from '../utils/recovery';

const {signInWithPasswordMock, signUpMock} = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  signUpMock: vi.fn(),
}));

vi.mock('../utils/supabaseClient', () => ({
  SUPABASE_NOT_CONFIGURED_ERROR: 'Supabase is not configured.',
  getSupabaseClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
    },
  })),
}));

import {LoginCard} from './LoginCard';

describe('LoginCard', () => {
  beforeEach(() => {
    signInWithPasswordMock.mockReset();
    signUpMock.mockReset();
  });

  it('validates email and password before calling Supabase Auth', async () => {
    const user = userEvent.setup();
    render(<LoginCard onForgotPassword={vi.fn()} />);

    await user.click(screen.getByRole('button', {name: 'Log In'}));
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(EMPTY_ACCOUNT_ERROR);
    expect(alerts[1]).toHaveTextContent(EMPTY_PASSWORD_ERROR);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Email address'), 'bad@');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.click(screen.getByRole('button', {name: 'Log In'}));
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_EMAIL_ERROR);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('signs in with Supabase Auth and calls onAuthSuccess', async () => {
    const user = userEvent.setup();
    const onAuthSuccess = vi.fn();
    const onNotify = vi.fn();
    signInWithPasswordMock.mockResolvedValueOnce({data: {}, error: null});

    render(
      <LoginCard
        onForgotPassword={vi.fn()}
        onAuthSuccess={onAuthSuccess}
        onNotify={onNotify}
      />,
    );

    await user.type(
      screen.getByLabelText('Email address'),
      '  alex@example.com  ',
    );
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.click(screen.getByRole('button', {name: 'Log In'}));

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: 'alex@example.com',
        password: 'Secret123',
      });
    });
    expect(onAuthSuccess).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith(
      'Signed in as alex@example.com.',
      'Welcome back',
    );
  });

  it('supports Sign Up with email confirmation feedback and error messages', async () => {
    const user = userEvent.setup();
    signUpMock.mockResolvedValueOnce({
      data: {user: {id: 'u1'}, session: null},
      error: null,
    });

    render(<LoginCard onForgotPassword={vi.fn()} />);

    await user.click(
      screen.getByRole('button', {name: "Don't have an account? Sign up"}),
    );
    expect(
      screen.getByRole('heading', {name: 'Create account'}),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email address'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.click(screen.getByRole('button', {name: 'Sign Up'}));

    expect(await screen.findByRole('status')).toHaveTextContent(
      /Please check your inbox and confirm your email address/i,
    );
    expect(screen.getByRole('heading', {name: 'Sign in'})).toBeInTheDocument();

    signInWithPasswordMock.mockResolvedValueOnce({
      data: {},
      error: {message: 'Invalid login credentials'},
    });
    await user.type(screen.getByLabelText('Password'), 'Wrong123');
    await user.click(screen.getByRole('button', {name: 'Log In'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Invalid email or password/i,
    );
  });

  it('shows loading spinner and prevents duplicate submissions while signing in', async () => {
    const user = userEvent.setup();
    let resolveLogin!: (value: {data: object; error: null}) => void;
    signInWithPasswordMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );

    render(<LoginCard onForgotPassword={vi.fn()} />);
    await user.type(
      screen.getByLabelText('Email address'),
      'alex@example.com',
    );
    await user.type(screen.getByLabelText('Password'), 'Secret123');

    const submitBtn = screen.getByRole('button', {name: 'Log In'});
    await user.click(submitBtn);
    await user.click(submitBtn);

    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveAttribute('aria-busy', 'true');
    expect(submitBtn).toHaveTextContent('Signing in...');
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(1);

    resolveLogin({data: {}, error: null});
    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
    });
  });
});

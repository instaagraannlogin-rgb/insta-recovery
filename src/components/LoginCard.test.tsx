import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  EMPTY_ACCOUNT_ERROR,
  EMPTY_PASSWORD_ERROR,
  INVALID_EMAIL_ERROR,
} from '../utils/recovery';

const {apiRequestMock} = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('../utils/apiClient', () => ({
  apiRequest: apiRequestMock,
}));

import {LoginCard} from './LoginCard';

describe('LoginCard', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('validates email and password before calling backend login API', async () => {
    const user = userEvent.setup();
    render(<LoginCard onForgotPassword={vi.fn()} />);

    await user.click(screen.getByRole('button', {name: 'Log In'}));
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(EMPTY_ACCOUNT_ERROR);
    expect(alerts[1]).toHaveTextContent(EMPTY_PASSWORD_ERROR);
    expect(apiRequestMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Email address'), 'bad@');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.click(screen.getByRole('button', {name: 'Log In'}));
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_EMAIL_ERROR);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('signs in with backend /api/auth/login and passes session to onAuthSuccess', async () => {
    const user = userEvent.setup();
    const onAuthSuccess = vi.fn();
    const onNotify = vi.fn();
    const session = {
      user: {id: 'u-1', email: 'alex@example.com'},
      token: 'jwt-token',
    };
    apiRequestMock.mockResolvedValueOnce({ok: true, data: session});

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
      expect(apiRequestMock).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        body: {
          email: 'alex@example.com',
          password: 'Secret123',
        },
      });
    });
    expect(onAuthSuccess).toHaveBeenCalledWith(session);
    expect(onNotify).toHaveBeenCalledWith(
      'Signed in as alex@example.com.',
      'Welcome back',
    );
  });

  it('supports Sign Up via /api/auth/signup and surfaces auth error messages', async () => {
    const user = userEvent.setup();
    const onAuthSuccess = vi.fn();
    const session = {
      user: {id: 'u-new', email: 'new@example.com'},
      token: 'signup-token',
    };
    apiRequestMock.mockResolvedValueOnce({ok: true, data: session});

    render(
      <LoginCard onForgotPassword={vi.fn()} onAuthSuccess={onAuthSuccess} />,
    );

    await user.click(
      screen.getByRole('button', {name: "Don't have an account? Sign up"}),
    );
    expect(
      screen.getByRole('heading', {name: 'Create account'}),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email address'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.click(screen.getByRole('button', {name: 'Sign Up'}));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/api/auth/signup', {
        method: 'POST',
        body: {
          email: 'new@example.com',
          password: 'Secret123',
        },
      });
    });
    expect(onAuthSuccess).toHaveBeenCalledWith(session);

    await user.click(
      screen.getByRole('button', {name: 'Already have an account? Log in'}),
    );
    apiRequestMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: 'Invalid login credentials',
    });
    await user.type(screen.getByLabelText('Password'), 'Wrong123');
    await user.click(screen.getByRole('button', {name: 'Log In'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Invalid email or password/i,
    );
  });

  it('shows loading spinner and prevents duplicate submissions while signing in', async () => {
    const user = userEvent.setup();
    let resolveLogin!: (value: {
      ok: true;
      data: {user: {id: string; email: string}; token: string};
    }) => void;
    apiRequestMock.mockImplementationOnce(
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
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    resolveLogin({
      ok: true,
      data: {user: {id: 'u1', email: 'alex@example.com'}, token: 'tok'},
    });
    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
    });
  });
});

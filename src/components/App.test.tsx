import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const {getSessionMock, onAuthStateChangeMock} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
}));

vi.mock('../utils/supabaseClient', () => ({
  SUPABASE_NOT_CONFIGURED_ERROR: 'Supabase is not configured.',
  getSupabaseClient: vi.fn(async () => ({
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  })),
}));

import App from '../App';

describe('App navigation and default route', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    getSessionMock.mockResolvedValue({data: {session: null}});
    onAuthStateChangeMock.mockReturnValue({
      data: {subscription: {unsubscribe: vi.fn()}},
    });
  });

  it('opens Forgot your password? by default and navigates to Sign in on Back to login', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByRole('heading', {name: 'Forgot your password?'}),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/powered by meta/i);

    await user.click(screen.getByRole('link', {name: 'Back to login'}));
    expect(screen.getByRole('heading', {name: 'Sign in'})).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Forgot password?'}));
    expect(
      screen.getByRole('heading', {name: 'Forgot your password?'}),
    ).toBeInTheDocument();
  });
});

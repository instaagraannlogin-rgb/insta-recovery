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
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
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

  it('toggles dark mode class on documentElement and persists preference in localStorage', async () => {
    const user = userEvent.setup();
    render(<App />);

    const toggleButton = await screen.findByTestId('theme-toggle');
    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
    expect(toggleButton).toHaveTextContent('Dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-pressed', 'true');
    expect(toggleButton).toHaveTextContent('Light');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('theme')).toBe('dark');

    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
    expect(toggleButton).toHaveTextContent('Dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('theme')).toBe('light');
  });
});

import {act, render, screen, waitFor} from '@testing-library/react';
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

  it('supports Device (system), Light, and Dark custom theme modes and persists choice', async () => {
    let prefersDark = false;
    const changeListeners = new Set<(e: MediaQueryListEvent) => void>();
    const matchMediaSpy = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
        media: query,
        onchange: null,
        addListener: (cb: (e: MediaQueryListEvent) => void) =>
          changeListeners.add(cb),
        removeListener: (cb: (e: MediaQueryListEvent) => void) =>
          changeListeners.delete(cb),
        addEventListener: (
          _type: string,
          cb: EventListenerOrEventListenerObject,
        ) => {
          if (typeof cb === 'function') {
            changeListeners.add(cb as (e: MediaQueryListEvent) => void);
          }
        },
        removeEventListener: (
          _type: string,
          cb: EventListenerOrEventListenerObject,
        ) => {
          if (typeof cb === 'function') {
            changeListeners.delete(cb as (e: MediaQueryListEvent) => void);
          }
        },
        dispatchEvent: () => true,
      }));

    try {
      const user = userEvent.setup();
      render(<App />);

      const lightBtn = await screen.findByTestId('theme-mode-light');
      const darkBtn = screen.getByTestId('theme-mode-dark');

      expect(screen.queryByTestId('theme-mode-system')).not.toBeInTheDocument();
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      // Device switches to dark mode dynamically while no custom override is selected
      prefersDark = true;
      act(() => {
        for (const listener of changeListeners) {
          listener({matches: true} as MediaQueryListEvent);
        }
      });
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
      });

      // User overrides with custom Light mode
      await user.click(lightBtn);
      expect(lightBtn).toHaveAttribute('aria-pressed', 'true');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(window.localStorage.getItem('theme')).toBe('light');

      // User overrides with custom Dark mode
      await user.click(darkBtn);
      expect(darkBtn).toHaveAttribute('aria-pressed', 'true');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(window.localStorage.getItem('theme')).toBe('dark');
    } finally {
      matchMediaSpy.mockRestore();
    }
  });
});

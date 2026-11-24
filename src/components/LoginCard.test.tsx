import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {FirebaseError} from 'firebase/app';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EMPTY_PASSWORD_ERROR, INVALID_EMAIL_ERROR} from '../utils/recovery';

const {
  mockAuth,
  authListeners,
  signInWithEmailAndPasswordMock,
  createUserWithEmailAndPasswordMock,
  signOutMock,
  onAuthStateChangedMock,
} = vi.hoisted(() => {
  const listeners = new Set<(user: {email: string} | null) => void>();
  const authObj = {currentUser: null as {email: string} | null};
  return {
    mockAuth: authObj,
    authListeners: listeners,
    signInWithEmailAndPasswordMock: vi.fn(),
    createUserWithEmailAndPasswordMock: vi.fn(),
    signOutMock: vi.fn(),
    onAuthStateChangedMock: vi.fn(
      (_auth: unknown, cb: (user: {email: string} | null) => void) => {
        listeners.add(cb);
        cb(authObj.currentUser);
        return () => {
          listeners.delete(cb);
        };
      },
    ),
  };
});

vi.mock('../firebase', () => ({
  auth: mockAuth,
}));

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>();
  return {
    ...actual,
    signInWithEmailAndPassword: signInWithEmailAndPasswordMock,
    createUserWithEmailAndPassword: createUserWithEmailAndPasswordMock,
    signOut: signOutMock,
    onAuthStateChanged: onAuthStateChangedMock,
  };
});

import {LoginCard} from './LoginCard';

describe('LoginCard', () => {
  beforeEach(() => {
    mockAuth.currentUser = null;
    authListeners.clear();
    signInWithEmailAndPasswordMock.mockReset();
    createUserWithEmailAndPasswordMock.mockReset();
    signOutMock.mockReset();
    onAuthStateChangedMock.mockClear();
  });

  it('validates email and password fields before calling Firebase Auth', async () => {
    const user = userEvent.setup();
    render(<LoginCard onForgotPassword={vi.fn()} />);

    await user.type(screen.getByLabelText('Email address'), 'alex_dev');
    await user.click(screen.getByRole('button', {name: 'Log In'}));

    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(INVALID_EMAIL_ERROR);
    expect(alerts[1]).toHaveTextContent(EMPTY_PASSWORD_ERROR);
    expect(signInWithEmailAndPasswordMock).not.toHaveBeenCalled();
  });

  it('signs in with Firebase Email/Password, displays signed-in state, and signs out', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();

    signInWithEmailAndPasswordMock.mockImplementation(
      async (_auth, email: string) => {
        mockAuth.currentUser = {email};
        for (const cb of authListeners) {
          cb({email});
        }
        return {user: {email}};
      },
    );
    signOutMock.mockImplementation(async () => {
      mockAuth.currentUser = null;
      for (const cb of authListeners) {
        cb(null);
      }
    });

    render(<LoginCard onForgotPassword={vi.fn()} onNotify={onNotify} />);

    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.click(screen.getByRole('button', {name: 'Log In'}));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {name: 'Signed in'}),
      ).toBeInTheDocument();
    });
    expect(signInWithEmailAndPasswordMock).toHaveBeenCalledWith(
      mockAuth,
      'alex@example.com',
      'Secret123',
    );
    expect(onNotify).toHaveBeenCalledWith(
      'Signed in as alex@example.com.',
      'Signed in',
    );

    await user.click(screen.getByRole('button', {name: 'Sign out'}));
    await waitFor(() => {
      expect(screen.getByRole('heading', {name: 'Sign in'})).toBeInTheDocument();
    });
  });

  it('supports creating a new account and surfaces Firebase Auth errors', async () => {
    const user = userEvent.setup();
    createUserWithEmailAndPasswordMock.mockRejectedValueOnce(
      new FirebaseError('auth/email-already-in-use', 'Already in use'),
    );

    render(<LoginCard onForgotPassword={vi.fn()} />);

    await user.click(
      screen.getByRole('button', {name: 'Need an account? Create one'}),
    );
    expect(
      screen.getByRole('heading', {name: 'Create account'}),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.click(screen.getByRole('button', {name: 'Create Account'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /already exists/i,
    );

    await act(async () => {
      await user.click(
        screen.getByRole('button', {name: 'Already have an account? Sign in'}),
      );
    });
    expect(screen.getByRole('heading', {name: 'Sign in'})).toBeInTheDocument();
  });
});

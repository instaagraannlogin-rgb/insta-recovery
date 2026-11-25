/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Session} from '@supabase/supabase-js';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Loader2} from 'lucide-react';
import {DashboardCard} from './components/DashboardCard';
import {LoginCard} from './components/LoginCard';
import {PasswordReset} from './components/PasswordReset';
import {RecoveryCard} from './components/RecoveryCard';
import {
  RecoveryFooter,
} from './components/RecoveryFooter';
import {RecoveryHeader, ThemeMode} from './components/RecoveryHeader';
import {Toast, ToastData} from './components/Toast';
import {syncUserProfile} from './utils/recoveryEvents';
import {getSupabaseClient} from './utils/supabaseClient';

type AppView = 'login' | 'recovery' | 'reset' | 'dashboard';

const RECOVERY_EMAIL_STORAGE_KEY = 'recovery_email';

function isRecoveryUrl(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return (
    window.location.hash.includes('type=recovery') ||
    window.location.hash.includes('reset-password') ||
    window.location.search.includes('type=recovery')
  );
}

function getInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system';
  }
  try {
    const stored = window.localStorage?.getItem('theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Ignore storage access failures
  }
  return 'system';
}

function readDevicePrefersDark(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredRecoveryEmail(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return window.sessionStorage?.getItem(RECOVERY_EMAIL_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredRecoveryEmail(email: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (email) {
      window.sessionStorage?.setItem(RECOVERY_EMAIL_STORAGE_KEY, email);
    } else {
      window.sessionStorage?.removeItem(RECOVERY_EMAIL_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access failures
  }
}

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);
  const [devicePrefersDark, setDevicePrefersDark] = useState<boolean>(
    readDevicePrefersDark,
  );
  const isDark =
    themeMode === 'dark' || (themeMode === 'system' && devicePrefersDark);

  const [view, setView] = useState<AppView>(() =>
    isRecoveryUrl() ? 'reset' : 'recovery',
  );
  const viewRef = useRef<AppView>(view);
  viewRef.current = view;
  const [session, setSession] = useState<Session | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState<string>(
    readStoredRecoveryEmail,
  );
  const [otpForwarded, setOtpForwarded] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [toast, setToast] = useState<ToastData | null>(null);
  const nextToastIdRef = useRef(1);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setDevicePrefersDark(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setDevicePrefersDark(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
    }
  }, [isDark]);

  useEffect(() => {
    try {
      window.localStorage?.setItem('theme', themeMode);
    } catch {
      // Ignore storage access failures
    }
  }, [themeMode]);

  const showToast = useCallback((message: string, title?: string) => {
    setToast({
      id: nextToastIdRef.current++,
      title,
      message,
    });
  }, []);

  useEffect(() => {
    let active = true;
    let subscription: {unsubscribe: () => void} | null = null;

    async function initAuth() {
      const supabase = await getSupabaseClient();
      if (!active) return;

      if (!supabase) {
        setIsAuthChecking(false);
        return;
      }

      const {data, error: sessionError} = await supabase.auth.getSession();
      if (!active) return;

      if (sessionError) {
        console.error(
          '[supabase] Failed to restore auth session:',
          sessionError.message,
        );
      }

      const currentSession = data?.session ?? null;
      setSession(currentSession);
      if (currentSession?.user?.id && currentSession.user.email) {
        void syncUserProfile({
          userId: currentSession.user.id,
          email: currentSession.user.email,
        });
      }

      if (isRecoveryUrl() && currentSession) {
        setView('reset');
      } else if (currentSession) {
        setView('dashboard');
      } else if (isRecoveryUrl()) {
        setView('reset');
      } else {
        setView('recovery');
      }
      setIsAuthChecking(false);

      const {data: listenerData} = supabase.auth.onAuthStateChange(
        (event, nextSession) => {
          setSession(nextSession ?? null);
          if (nextSession?.user?.id && nextSession.user.email) {
            void syncUserProfile({
              userId: nextSession.user.id,
              email: nextSession.user.email,
            });
          }

          if (event === 'PASSWORD_RECOVERY') {
            setView('reset');
          } else if (event === 'SIGNED_IN' && nextSession) {
            setView(
              viewRef.current === 'recovery' || viewRef.current === 'reset'
                ? 'reset'
                : 'dashboard',
            );
          } else if (event === 'SIGNED_OUT') {
            setOtpForwarded(false);
            setRecoveryEmail('');
            writeStoredRecoveryEmail('');
            setView('login');
          }
        },
      );
      subscription = listenerData.subscription;
    }

    void initAuth();

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthChecking && !session && view === 'dashboard') {
      setView('login');
    }
  }, [isAuthChecking, session, view]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f10] text-[#262626] dark:text-[#f3f4f6] font-[Arial,sans-serif] transition-colors">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <RecoveryHeader
        themeMode={themeMode}
        onChangeThemeMode={setThemeMode}
      />

      {isAuthChecking ? (
        <main className="min-h-[80vh] flex justify-center items-center">
          <div className="flex items-center gap-2 text-[14px] text-[#737373] dark:text-[#a1a1aa]">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>Checking session...</span>
          </div>
        </main>
      ) : view === 'dashboard' && session ? (
        <DashboardCard
          userId={session.user.id}
          userEmail={session.user.email || ''}
          onLoggedOut={() => {
            setSession(null);
            setOtpForwarded(false);
            setRecoveryEmail('');
            writeStoredRecoveryEmail('');
            setView('login');
          }}
          onResetPassword={() => setView('reset')}
          onNotify={showToast}
        />
      ) : view === 'recovery' ? (
        <RecoveryCard
          onBackToLogin={() => {
            setOtpForwarded(false);
            setRecoveryEmail('');
            writeStoredRecoveryEmail('');
            if (typeof window !== 'undefined' && window.location.hash) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            setView('login');
          }}
          onOtpVerified={(nextSession, email) => {
            setRecoveryEmail(email);
            writeStoredRecoveryEmail(email);
            if (nextSession) {
              setSession(nextSession);
            }
            setOtpForwarded(true);
            if (typeof window !== 'undefined') {
              window.history.replaceState(null, '', '#reset-password');
            }
            setView('reset');
          }}
          onNotify={showToast}
        />
      ) : view === 'reset' ? (
        <PasswordReset
          accountEmail={session?.user.email || recoveryEmail || undefined}
          accountUserId={session?.user.id ?? null}
          hasRecoverySession={Boolean(session)}
          otpForwarded={otpForwarded}
          onBackToLogin={() => {
            setOtpForwarded(false);
            setRecoveryEmail('');
            writeStoredRecoveryEmail('');
            if (typeof window !== 'undefined' && window.location.hash) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            setView(session ? 'dashboard' : 'login');
          }}
          onRequestNewLink={() => {
            setOtpForwarded(false);
            setRecoveryEmail('');
            writeStoredRecoveryEmail('');
            if (typeof window !== 'undefined' && window.location.hash) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            setView('recovery');
          }}
          onResetSuccess={() => {
            showToast('Password changed successfully.', 'Password updated');
          }}
        />
      ) : (
        <LoginCard
          onForgotPassword={() => setView('recovery')}
          onAuthSuccess={() => setView('dashboard')}
          onNotify={showToast}
        />
      )}

      <RecoveryFooter />
    </div>
  );
}

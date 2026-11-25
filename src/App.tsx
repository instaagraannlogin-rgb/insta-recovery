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
import {RecoveryFooter} from './components/RecoveryFooter';
import {RecoveryHeader} from './components/RecoveryHeader';
import {Toast, ToastData} from './components/Toast';
import {getSupabaseClient} from './utils/supabaseClient';

type AppView = 'login' | 'recovery' | 'reset' | 'dashboard';

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

function getInitialDarkMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const stored = window.localStorage?.getItem('theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
  } catch {
    // Ignore storage access failures
  }
  return Boolean(
    typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
}

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(getInitialDarkMode);
  const [view, setView] = useState<AppView>(() =>
    isRecoveryUrl() ? 'reset' : 'recovery',
  );
  const viewRef = useRef<AppView>(view);
  viewRef.current = view;
  const [session, setSession] = useState<Session | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [otpForwarded, setOtpForwarded] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [toast, setToast] = useState<ToastData | null>(null);
  const nextToastIdRef = useRef(1);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
    }
    try {
      window.localStorage?.setItem('theme', isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage access failures
    }
  }, [isDark]);

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

      const {data} = await supabase.auth.getSession();
      if (!active) return;

      const currentSession = data.session ?? null;
      setSession(currentSession);
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
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
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
            setView('login');
          }}
          onResetPassword={() => setView('reset')}
          onNotify={showToast}
        />
      ) : view === 'recovery' ? (
        <RecoveryCard
          onBackToLogin={() => {
            setOtpForwarded(false);
            if (typeof window !== 'undefined' && window.location.hash) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            setView('login');
          }}
          onOtpVerified={(nextSession, email) => {
            setRecoveryEmail(email);
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
            if (typeof window !== 'undefined' && window.location.hash) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            setView(session ? 'dashboard' : 'login');
          }}
          onRequestNewLink={() => {
            setOtpForwarded(false);
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

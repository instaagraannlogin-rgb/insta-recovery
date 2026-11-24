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

export default function App() {
  const [view, setView] = useState<AppView>(() =>
    isRecoveryUrl() ? 'reset' : 'recovery',
  );
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [toast, setToast] = useState<ToastData | null>(null);
  const nextToastIdRef = useRef(1);

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
            setView((prev) => (prev === 'reset' ? 'reset' : 'dashboard'));
          } else if (event === 'SIGNED_OUT') {
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
    <div className="bg-white text-[#262626] font-[Arial,sans-serif]">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <RecoveryHeader />

      {isAuthChecking ? (
        <main className="min-h-[80vh] flex justify-center items-center">
          <div className="flex items-center gap-2 text-[14px] text-[#737373]">
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
            setView('login');
          }}
          onResetPassword={() => setView('reset')}
          onNotify={showToast}
        />
      ) : view === 'recovery' ? (
        <RecoveryCard
          onBackToLogin={() => setView('login')}
          onNotify={showToast}
        />
      ) : view === 'reset' ? (
        <PasswordReset
          accountEmail={session?.user.email}
          hasRecoverySession={Boolean(session)}
          onBackToLogin={() => setView(session ? 'dashboard' : 'login')}
          onRequestNewLink={() => setView('recovery')}
          onResetSuccess={() => {
            showToast('Your password has been updated.', 'Password updated');
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

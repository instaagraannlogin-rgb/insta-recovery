/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {useCallback, useRef, useState} from 'react';
import {LoginCard} from './components/LoginCard';
import {RecoveryCard} from './components/RecoveryCard';
import {RecoveryFooter} from './components/RecoveryFooter';
import {RecoveryHeader} from './components/RecoveryHeader';
import {Toast, ToastData} from './components/Toast';

export default function App() {
  const [view, setView] = useState<'recovery' | 'login'>('recovery');
  const [toast, setToast] = useState<ToastData | null>(null);
  const nextToastIdRef = useRef(1);

  const showToast = useCallback((message: string, title?: string) => {
    setToast({
      id: nextToastIdRef.current++,
      title,
      message,
    });
  }, []);

  return (
    <div className="bg-white text-[#262626] font-[Arial,sans-serif]">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <RecoveryHeader />
      {view === 'recovery' ? (
        <RecoveryCard
          onBackToLogin={() => setView('login')}
          onNotify={showToast}
        />
      ) : (
        <LoginCard
          onForgotPassword={() => setView('recovery')}
          onNotify={showToast}
        />
      )}
      <RecoveryFooter />
    </div>
  );
}

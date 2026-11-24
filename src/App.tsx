/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {useState} from 'react';
import {LoginCard} from './components/LoginCard';
import {RecoveryCard} from './components/RecoveryCard';
import {RecoveryFooter} from './components/RecoveryFooter';
import {RecoveryHeader} from './components/RecoveryHeader';

export default function App() {
  const [view, setView] = useState<'recovery' | 'login'>('recovery');

  return (
    <div className="bg-white text-[#262626] font-[Arial,sans-serif]">
      <RecoveryHeader />
      {view === 'recovery' ? (
        <RecoveryCard onBackToLogin={() => setView('login')} />
      ) : (
        <LoginCard onForgotPassword={() => setView('recovery')} />
      )}
      <RecoveryFooter />
    </div>
  );
}

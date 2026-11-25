import {Moon, Sun} from 'lucide-react';

interface RecoveryHeaderProps {
  isDark?: boolean;
  onToggleTheme?: () => void;
}

export function RecoveryHeader({
  isDark = false,
  onToggleTheme,
}: RecoveryHeaderProps) {
  return (
    <header className="h-[60px] border-b border-[#dbdbdb] dark:border-[#27272a] flex items-center justify-between px-[25px] max-[480px]:px-[15px] transition-colors">
      <div className="text-[24px] font-bold">Account Recovery</div>

      {onToggleTheme && (
        <button
          type="button"
          data-testid="theme-toggle"
          onClick={onToggleTheme}
          aria-pressed={isDark}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[#dbdbdb] dark:border-[#323238] bg-[#fafafa] dark:bg-[#1c1c20] hover:bg-[#f0f0f0] dark:hover:bg-[#27272a] text-[#262626] dark:text-[#f3f4f6] text-[13px] font-semibold cursor-pointer transition-colors"
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4 text-[#facc15]" aria-hidden="true" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-[#525252]" aria-hidden="true" />
              <span>Dark</span>
            </>
          )}
        </button>
      )}
    </header>
  );
}

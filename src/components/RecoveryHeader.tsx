import {Moon, Sun} from 'lucide-react';

export type ThemeMode = 'system' | 'light' | 'dark';

interface RecoveryHeaderProps {
  themeMode?: ThemeMode;
  onChangeThemeMode?: (mode: ThemeMode) => void;
}

const THEME_OPTIONS: Array<{
  mode: ThemeMode;
  label: string;
  ariaLabel: string;
  Icon: typeof Sun;
}> = [
  {
    mode: 'light',
    label: 'Light',
    ariaLabel: 'Use custom light mode',
    Icon: Sun,
  },
  {
    mode: 'dark',
    label: 'Dark',
    ariaLabel: 'Use custom dark mode',
    Icon: Moon,
  },
];

export function RecoveryHeader({
  themeMode = 'system',
  onChangeThemeMode,
}: RecoveryHeaderProps) {
  return (
    <header className="h-[60px] border-b border-[#dbdbdb] dark:border-[#27272a] flex items-center justify-between gap-2 px-[25px] max-[480px]:px-[12px] transition-colors">
      <div className="text-[24px] max-[480px]:text-[18px] font-bold whitespace-nowrap">
        Account Recovery
      </div>

      {onChangeThemeMode && (
        <div
          role="group"
          aria-label="Theme mode"
          data-testid="theme-mode-selector"
          className="inline-flex items-center p-[3px] rounded-[7px] border border-[#dbdbdb] dark:border-[#323238] bg-[#fafafa] dark:bg-[#1c1c20] shrink-0"
        >
          {THEME_OPTIONS.map(({mode, label, ariaLabel, Icon}) => {
            const active = themeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                data-testid={`theme-mode-${mode}`}
                aria-pressed={active}
                aria-label={ariaLabel}
                onClick={() => onChangeThemeMode(mode)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 max-[480px]:px-2 rounded-[5px] border-0 text-[12px] font-semibold cursor-pointer transition-colors ${
                  active
                    ? 'bg-white dark:bg-[#27272a] text-[#262626] dark:text-[#f3f4f6] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                    : 'bg-transparent text-[#737373] dark:text-[#a1a1aa] hover:text-[#262626] dark:hover:text-[#f3f4f6]'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    active && mode === 'light'
                      ? 'text-[#d97706] dark:text-[#facc15]'
                      : ''
                  }`}
                  aria-hidden="true"
                />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}

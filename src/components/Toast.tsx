import {useEffect, useRef} from 'react';
import {CheckCircle2, X} from 'lucide-react';

export interface ToastData {
  id: number;
  title?: string;
  message: string;
  durationMs?: number;
}

interface ToastProps {
  toast: ToastData | null;
  onDismiss: () => void;
}

export function Toast({toast, onDismiss}: ToastProps) {
  const toastRef = useRef<HTMLDivElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!toast) {
      return;
    }

    const duration = toast.durationMs ?? 4500;
    const timer = window.setTimeout(() => {
      onDismissRef.current();
    }, duration);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast?.id, toast?.durationMs]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const el = toastRef.current;
    if (el && typeof el.animate === 'function') {
      el.animate(
        [
          {opacity: 0, transform: 'translateY(-12px)'},
          {opacity: 1, transform: 'translateY(0)'},
        ],
        {duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)'},
      );
    }
  }, [toast?.id]);

  if (!toast) {
    return null;
  }

  return (
    <div
      ref={toastRef}
      role="status"
      aria-live="polite"
      data-testid="toast-notification"
      className="fixed top-[72px] right-5 z-50 w-[calc(100vw-2rem)] max-w-[380px] max-[480px]:top-auto max-[480px]:bottom-6 max-[480px]:left-4 max-[480px]:right-4 max-[480px]:w-auto bg-white dark:bg-[#18181b] border border-[#dbdbdb] dark:border-[#27272a] border-l-4 border-l-[#16803c] dark:border-l-[#4ade80] rounded-[8px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)] px-4 py-3.5 flex items-start gap-3 text-left"
    >
      <CheckCircle2
        className="w-5 h-5 text-[#16803c] dark:text-[#4ade80] shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-[13px] font-bold text-[#262626] dark:text-[#f3f4f6] leading-[1.3] mb-0.5">
            {toast.title}
          </p>
        )}
        <p className="text-[13px] text-[#525252] dark:text-[#d4d4d8] leading-[1.4]">
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="text-[#737373] dark:text-[#a1a1aa] hover:text-[#262626] dark:hover:text-[#f3f4f6] p-0.5 bg-transparent border-0 cursor-pointer shrink-0 transition-colors"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

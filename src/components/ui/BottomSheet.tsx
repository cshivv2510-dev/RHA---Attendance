import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Bottom sheet — slides up from the bottom on phones, centred card on wider screens.
 */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // Lift the sheet above the on-screen keyboard (mobile)
  useEffect(() => {
    if (!open) {
      setKeyboardOffset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setKeyboardOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-[var(--bg-card)] rounded-t-3xl sm:rounded-3xl max-h-[88dvh] flex flex-col animate-slide-up shadow-2xl"
        style={{
          marginBottom: keyboardOffset || undefined,
          maxHeight: keyboardOffset ? `calc(88dvh - ${keyboardOffset}px)` : undefined,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border-secondary)' }} />
        </div>

        <div className="flex items-center justify-between px-5 pt-2 pb-3">
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {title ?? ''}
            </h3>
            <button
              onClick={onClose}
              className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-tertiary)]"
              aria-label="Close"
            >
              <X size={20} style={{ color: 'var(--text-secondary)' }} />
            </button>
        </div>

        <div className="overflow-y-auto px-5 pb-6 safe-bottom">{children}</div>
      </div>
    </div>
  );
}

import { CheckCircle2, Info, XCircle, Ban, type LucideIcon } from 'lucide-react';
import type { ScanResult as ScanResultType } from '../../types';
import { formatTime } from '../../utils/date';
import { Button } from '../ui/Button';

interface ScanResultCardProps {
  result: ScanResultType;
  onUndo?: () => void;
}

interface ResultStyle {
  bg: string;
  border: string;
  fg: string;
  icon: LucideIcon;
}

const styles: Record<string, ResultStyle> = {
  success: {
    bg: 'rgba(31,122,63,0.10)',
    border: 'rgba(31,122,63,0.35)',
    fg: '#196b36',
    icon: CheckCircle2,
  },
  offline_saved: {
    bg: 'rgba(31,122,63,0.10)',
    border: 'rgba(31,122,63,0.35)',
    fg: '#196b36',
    icon: CheckCircle2,
  },
  duplicate: {
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.4)',
    fg: '#b45309',
    icon: Info,
  },
  not_found: {
    bg: 'rgba(239,68,68,0.10)',
    border: 'rgba(239,68,68,0.35)',
    fg: '#dc2626',
    icon: XCircle,
  },
  error: {
    bg: 'rgba(239,68,68,0.10)',
    border: 'rgba(239,68,68,0.35)',
    fg: '#dc2626',
    icon: XCircle,
  },
  disabled: {
    bg: 'rgba(107,144,125,0.14)',
    border: 'rgba(107,144,125,0.4)',
    fg: '#4b6b56',
    icon: Ban,
  },
};

/**
 * Persistent result card shown after each scan. Stays until the next scan.
 */
export function ScanResultCard({ result, onUndo }: ScanResultCardProps) {
  const s: ResultStyle = { ...(styles[result.status] ?? styles.error) };
  const Icon = s.icon;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    s.fg = ({ success: '#7dd3a6', offline_saved: '#7dd3a6', duplicate: '#fcd34d', not_found: '#fca5a5', error: '#fca5a5', disabled: '#a3c4b0' } as Record<string, string>)[result.status] ?? '#fca5a5';
    s.bg = 'rgba(255,255,255,0.04)';
    s.border = 'rgba(255,255,255,0.14)';
  }

  const marked = result.status === 'success' || result.status === 'offline_saved';
  const student = result.student;

  return (
    <div
      className="rounded-2xl border p-4 flex items-start gap-3 animate-scale-in"
      style={{ backgroundColor: isDark ? undefined : s.bg, borderColor: s.border }}
    >
      <Icon size={24} style={{ color: s.fg }} className="flex-shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0">
        {marked && student ? (
          <>
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {student.name}
            </p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {student.id}
              {student.class ? ` · Class ${student.class}` : ''}
              {result.timestamp ? ` · ${formatTime(result.timestamp)}` : ''}
            </p>
            {result.status === 'offline_saved' && (
              <p className="text-xs mt-1 font-medium" style={{ color: s.fg }}>
                Saved on phone, will sync
              </p>
            )}
          </>
        ) : result.status === 'duplicate' ? (
          <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {student?.name || result.message.replace(' is already marked today.', '')}
            {result.existingTime && (
              <span className="block text-sm font-normal mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Already marked at {formatTime(result.existingTime)}
              </span>
            )}
          </p>
        ) : (
          <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {result.message}
          </p>
        )}
      </div>

      {marked && onUndo && (
        <Button variant="ghost" size="sm" onClick={onUndo} className="flex-shrink-0 -mr-2">
          Undo
        </Button>
      )}
    </div>
  );
}

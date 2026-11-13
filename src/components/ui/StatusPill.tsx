import { Check, X, Ban } from 'lucide-react';

type StatusKind = 'present' | 'absent' | 'disabled';

interface StatusPillProps {
  status: StatusKind;
  label?: string;
}

const config: Record<StatusKind, { label: string; light: { bg: string; fg: string }; dark: { bg: string; fg: string }; icon: typeof Check }> = {
  present: {
    label: 'Present',
    light: { bg: 'rgba(31,122,63,0.10)', fg: '#196b36' },
    dark: { bg: 'rgba(76,192,127,0.15)', fg: '#7dd3a6' },
    icon: Check,
  },
  absent: {
    label: 'Absent',
    light: { bg: 'rgba(239,68,68,0.10)', fg: '#dc2626' },
    dark: { bg: 'rgba(239,68,68,0.15)', fg: '#fca5a5' },
    icon: X,
  },
  disabled: {
    label: 'Disabled',
    light: { bg: 'rgba(107,144,125,0.15)', fg: '#4b6b56' },
    dark: { bg: 'rgba(107,154,125,0.15)', fg: '#a3c4b0' },
    icon: Ban,
  },
};

/**
 * Status pill — always icon + word, never colour alone.
 */
export function StatusPill({ status, label }: StatusPillProps) {
  const c = config[status];
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const colors = isDark ? c.dark : c.light;
  const Icon = c.icon;

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: colors.bg, color: colors.fg }}
    >
      <Icon size={12} strokeWidth={3} />
      {label ?? c.label}
    </span>
  );
}

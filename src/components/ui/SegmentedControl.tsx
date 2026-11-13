interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Segmented control — pill container with sliding active segment.
 */
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div
      className="flex gap-1 p-1 rounded-2xl border"
      style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
      role="tablist"
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition-all min-h-[40px]"
            style={
              active
                ? { backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-card)' }
                : { color: 'var(--text-secondary)' }
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

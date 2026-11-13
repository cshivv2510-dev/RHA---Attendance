export function Spinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.2"
      />
      <path
        d="M12 2a10 10 0 019.95 9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl p-4 border border-[var(--border-primary)] ${className}`}
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      <div className="shimmer-loading h-4 w-24 rounded-md mb-3" />
      <div className="shimmer-loading h-8 w-16 rounded-md mb-2" />
      <div className="shimmer-loading h-3 w-32 rounded-md" />
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="rounded-xl p-4 border border-[var(--border-primary)] flex items-center gap-4"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          <div className="shimmer-loading h-10 w-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="shimmer-loading h-4 w-36 rounded-md" />
            <div className="shimmer-loading h-3 w-24 rounded-md" />
          </div>
          <div className="shimmer-loading h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

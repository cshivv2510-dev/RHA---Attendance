const PALETTE = [
  '#1f7a3f', '#b45309', '#1d4ed8', '#9f1239', '#6d28d9',
  '#0e7490', '#a16207', '#be185d', '#374151', '#15803d',
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

/**
 * Avatar circle with initials. Colour is stable per name.
 */
export function Avatar({ name, size = 40, className = '' }: AvatarProps) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w.charAt(0).toUpperCase())
    .join('') || '?';

  const color = PALETTE[hashString(name || '?') % PALETTE.length];

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size * 0.38,
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

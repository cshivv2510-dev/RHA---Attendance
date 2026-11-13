import type React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glass?: boolean;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className = '',
  glass = false,
  hover = false,
  onClick,
}: CardProps) {
  const baseClasses = 'rounded-2xl transition-all duration-200';

  const bgClasses = glass
    ? 'glass'
    : 'border border-[var(--border-primary)]';

  const hoverClasses = hover
    ? 'cursor-pointer hover:shadow-[var(--shadow-card-hover)] hover:translate-y-[-2px]'
    : '';

  const bgStyle: React.CSSProperties = glass
    ? {}
    : { backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' };

  return (
    <div
      className={`${baseClasses} ${bgClasses} ${hoverClasses} ${className}`}
      style={bgStyle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      {children}
    </div>
  );
}

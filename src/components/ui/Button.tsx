import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses =
    'relative inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 select-none whitespace-nowrap';

  const variantClasses = {
    primary:
      'bg-rha-green-600 text-white hover:bg-rha-green-700 min-h-[48px] px-4',
    secondary:
      'border border-rha-green-600 text-rha-green-700 hover:bg-rha-green-50 min-h-[40px] px-4 dark:hover:bg-rha-green-950',
    ghost:
      'hover:bg-black/5 dark:hover:bg-white/5 min-h-[40px] px-3',
    danger:
      'bg-red-600 text-white hover:bg-red-700 min-h-[48px] px-4',
  };

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-sm',
    lg: 'text-base',
  };

  const darkModeStyle: React.CSSProperties = {};
  if (variant === 'ghost') {
    darkModeStyle.color = 'var(--text-primary)';
  }
  if (variant === 'secondary') {
    darkModeStyle.color = 'var(--text-primary)';
    darkModeStyle.borderColor = 'var(--border-focus)';
  }
  if (variant === 'ghost') {
    darkModeStyle.color = 'var(--text-secondary)';
  }

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || isLoading}
      style={darkModeStyle}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

// ─── Date / Time Utilities ─────────────────────────────────────────
// All "today"/day-boundary logic uses Asia/Kolkata so dates never
// shift for IST users (toISOString() is UTC and caused off-by-one bugs).

const TZ = 'Asia/Kolkata';

function kolkataParts(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: get('year'), m: get('month'), day: get('day') };
}

/**
 * Get current date in YYYY-MM-DD format (Asia/Kolkata)
 */
export function getTodayDate(): string {
  const { y, m, day } = kolkataParts(new Date());
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Get current time in HH:MM:SS format (Asia/Kolkata)
 */
export function getCurrentTime(): string {
  return new Date().toLocaleTimeString('en-IN', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format a date string to a readable format
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Compact header format: "Fri, 13 Nov"
 */
export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Format time string to 12-hour format
 */
export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

/**
 * Get relative time description (e.g., "2 hours ago")
 */
export function getRelativeTime(dateStr: string, timeStr: string): string {
  const dateTime = new Date(`${dateStr}T${timeStr}`);
  const now = new Date();
  const diffMs = now.getTime() - dateTime.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

/**
 * Get the past N days as date strings (ending today, Kolkata)
 */
export function getPastDays(n: number): string[] {
  const dates: string[] = [];
  const today = getTodayDate();
  const base = new Date(today + 'T00:00:00Z');
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

/**
 * Get the short day name for a date string
 */
export function getDayName(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', { weekday: 'short' });
}

/**
 * Get a human-readable date range label
 */
export function getDateRangeLabel(start: string, end: string): string {
  if (start === end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/**
 * Get start/end dates for a period
 */
export function getPeriodDates(period: 'daily' | 'weekly' | 'monthly'): { startDate: string; endDate: string } {
  const today = getTodayDate();

  switch (period) {
    case 'daily':
      return { startDate: today, endDate: today };
    case 'weekly': {
      const dates = getPastDays(7);
      return { startDate: dates[0], endDate: today };
    }
    case 'monthly': {
      const dates = getPastDays(30);
      return { startDate: dates[0], endDate: today };
    }
  }
}

// ─── Month helpers ─────────────────────────────────────────────────

/** YYYY-MM key for a YYYY-MM-DD date string */
export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** "Nov 2025" label for a YYYY-MM key */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Short month label: "Nov" */
export function monthShortLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    timeZone: 'UTC',
  });
}

/** First and last day (YYYY-MM-DD) of a YYYY-MM month */
export function monthDateRange(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(last).padStart(2, '0')}`,
  };
}

/** All YYYY-MM-DD dates in a month, up to `upTo` (defaults to month end) */
export function datesInMonth(monthKey: string, upTo?: string): string[] {
  const { start, end } = monthDateRange(monthKey);
  const limit = upTo && upTo < end ? upTo : end;
  const dates: string[] = [];
  const d = new Date(start + 'T00:00:00Z');
  const endD = new Date(limit + 'T00:00:00Z');
  while (d <= endD) {
    dates.push(d.toISOString().split('T')[0]);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

/** Shift a YYYY-MM key by n months */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Weekday index (0=Sun) for a YYYY-MM-DD date */
export function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

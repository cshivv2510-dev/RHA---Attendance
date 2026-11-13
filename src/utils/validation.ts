/**
 * Validate a student ID format: RHA followed by 3+ digits
 */
export function isValidStudentId(id: string): boolean {
  return /^RHA\d{3,}$/i.test(id.trim());
}

/**
 * Sanitize user input — strip HTML tags and trim
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'&]/g, '')
    .trim();
}

/**
 * Normalize student ID to uppercase
 */
export function normalizeStudentId(id: string): string {
  return id.trim().toUpperCase();
}

/**
 * Get device name from userAgent
 */
export function getDeviceName(): string {
  const ua = navigator.userAgent;

  // Try to extract model from common patterns
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) {
    const match = ua.match(/;\s*([^;)]+)\s*Build/);
    if (match) return match[1].trim();
    return 'Android Device';
  }
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux PC';

  return 'Unknown Device';
}

/**
 * Validate that a date string is in YYYY-MM-DD format
 */
export function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

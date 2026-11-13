/**
 * Auth session — persists the logged-in user + credentials in localStorage
 * so the app survives refreshes and the sync engine can authenticate.
 */

import type { User } from '../types';
import { setCredentials } from './api';

const STORAGE_KEY = 'rha_auth';

interface StoredSession {
  user: User;
  userId: string;
  pin: string;
}

export function saveSession(user: User, userId: string, pin: string): void {
  const session: StoredSession = { user, userId, pin };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  setCredentials({ userId, pin });
}

export function loadSession(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    if (!session.user || !session.userId || !session.pin) return null;
    setCredentials({ userId: session.userId, pin: session.pin });
    return session.user;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
  setCredentials(null);
}

/**
 * Sync Engine — processes the offline queue and sends pending scans to the server.
 *
 * Architecture:
 *  - Reads from IndexedDB syncQueue in FIFO order
 *  - Uses studentId + date as idempotency key (server rejects duplicates)
 *  - Retries with backoff on transient failures
 *  - Runs on 30-second interval when online
 *  - Triggered immediately on online event
 */

import { getPendingSyncs, removeSynced, setMeta, getMeta } from './db';
import { markAttendance } from './api';

export interface SyncState {
  pending: number;
  syncing: boolean;
  failed: boolean;
  lastSyncAt: number | null;
}

let syncInterval: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let lastFailed = false;
let lastSyncAt: number | null = null;
const listeners = new Set<(state: SyncState) => void>();

async function emitState(): Promise<void> {
  const pending = (await getPendingSyncs()).length;
  const state: SyncState = { pending, syncing: isSyncing, failed: lastFailed, lastSyncAt };
  listeners.forEach(cb => cb(state));
}

/**
 * Register a callback fired whenever sync state changes.
 * Returns an unsubscribe function.
 */
export function onSyncStatusChange(callback: (state: SyncState) => void): () => void {
  listeners.add(callback);
  emitState();
  return () => listeners.delete(callback);
}

/**
 * Retry syncing now (used by the sync chip).
 */
export function retrySync(): void {
  processSyncQueue();
}

/**
 * Process all pending scans in the queue
 */
export async function processSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncing || !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  isSyncing = true;
  await emitState();
  let synced = 0;
  let failed = 0;

  try {
    const pendingScans = await getPendingSyncs();

    for (const scan of pendingScans) {
      try {
        const result = await markAttendance(
          scan.studentId,
          scan.date,
          scan.time,
          scan.deviceName,
          scan.markedBy
        );

        if (result.success || result.error === 'Attendance already recorded for this student today') {
          // Remove from queue on success or if server already has it
          if (scan.id !== undefined) {
            await removeSynced(scan.id);
          }
          synced++;
        } else {
          failed++;
          lastFailed = true;
          // Don't break — try the next one, it might be a different error
        }
      } catch {
        failed++;
        lastFailed = true;
        // Stop processing on network errors to avoid wasting bandwidth
        if (!navigator.onLine) break;
      }
    }

    if (failed === 0 && synced > 0) {
      lastSyncAt = Date.now();
      lastFailed = false;
      await setMeta('last_sync_at', String(lastSyncAt));
    } else if (failed === 0 && synced === 0) {
      lastFailed = false;
    }
  } finally {
    isSyncing = false;
    await emitState();
  }

  return { synced, failed };
}

/**
 * Load persisted last-sync timestamp on startup.
 */
export async function initSyncState(): Promise<void> {
  const saved = await getMeta('last_sync_at');
  if (saved) lastSyncAt = Number(saved);
}

/**
 * Start the background sync interval (runs every 30 seconds)
 */
export function startSyncEngine(): void {
  // Process immediately
  processSyncQueue();

  // Set up interval
  if (!syncInterval) {
    syncInterval = setInterval(() => {
      if (navigator.onLine) {
        processSyncQueue();
      }
    }, 30000);
  }

  // Listen for online events to trigger immediate sync
  window.addEventListener('online', handleOnline);
}

/**
 * Stop the background sync engine
 */
export function stopSyncEngine(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  window.removeEventListener('online', handleOnline);
}

function handleOnline(): void {
  // Small delay to let the network stabilize
  setTimeout(() => processSyncQueue(), 2000);
}

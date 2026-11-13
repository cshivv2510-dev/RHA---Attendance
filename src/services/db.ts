/**
 * IndexedDB service using `idb` library.
 * Manages local storage for students, attendance records, and sync queue.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Student, AttendanceRecord, PendingScan } from '../types';

// ─── Schema ────────────────────────────────────────────────────────

interface AttendanceDB extends DBSchema {
  students: {
    key: string;
    value: Student;
    indexes: { 'by-name': string; 'by-status': string };
  };
  attendance: {
    key: string; // `${studentId}_${date}`
    value: AttendanceRecord & { _key: string };
    indexes: { 'by-date': string; 'by-student': string };
  };
  syncQueue: {
    key: number;
    value: PendingScan;
    indexes: { 'by-synced': number };
  };
  meta: {
    key: string;
    value: { key: string; value: string; updatedAt: number };
  };
}

const DB_NAME = 'rha-attendance';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<AttendanceDB> | null = null;

function attendanceKey(studentId: string, date: string): string {
  return `${studentId}_${date}`;
}

// ─── DB Connection ─────────────────────────────────────────────────

export async function getDB(): Promise<IDBPDatabase<AttendanceDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<AttendanceDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Students store
      if (!db.objectStoreNames.contains('students')) {
        const studentStore = db.createObjectStore('students', { keyPath: 'id' });
        studentStore.createIndex('by-name', 'name');
        studentStore.createIndex('by-status', 'status');
      }

      // Attendance store — keyed by `studentId_date`
      if (!db.objectStoreNames.contains('attendance')) {
        const attendanceStore = db.createObjectStore('attendance', { keyPath: '_key' });
        attendanceStore.createIndex('by-date', 'date');
        attendanceStore.createIndex('by-student', 'studentId');
      }

      // Sync queue store
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        syncStore.createIndex('by-synced', 'synced');
      }

      // Meta store (for cache timestamps etc.)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    },
  });

  return dbInstance;
}

// ─── Student Operations ────────────────────────────────────────────

export async function cacheStudents(students: Student[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('students', 'readwrite');
  await Promise.all([
    ...students.map(s => tx.store.put(s)),
    tx.done,
  ]);

  // Save cache timestamp
  await setMeta('students_cached_at', Date.now().toString());
}

export async function getCachedStudents(): Promise<Student[]> {
  const db = await getDB();
  return db.getAll('students');
}

export async function getCachedStudent(id: string): Promise<Student | undefined> {
  const db = await getDB();
  return db.get('students', id);
}

// ─── Attendance Operations ─────────────────────────────────────────

export async function saveAttendanceLocal(record: AttendanceRecord): Promise<void> {
  const db = await getDB();
  const key = attendanceKey(record.studentId, record.date);
  await db.put('attendance', { ...record, _key: key });
}

export async function getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('attendance', 'by-date', date);
}

export async function getAttendanceByStudent(studentId: string): Promise<AttendanceRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('attendance', 'by-student', studentId);
}

export async function isAlreadyMarkedLocal(studentId: string, date: string): Promise<boolean> {
  const db = await getDB();
  const key = attendanceKey(studentId, date);
  const record = await db.get('attendance', key);
  return !!record;
}

export async function getAttendanceRecord(studentId: string, date: string): Promise<(AttendanceRecord & { _key: string }) | undefined> {
  const db = await getDB();
  const key = attendanceKey(studentId, date);
  return db.get('attendance', key);
}

/**
 * Remove a local attendance record (used by Undo on the scan screen).
 * Also drops any unsynced queue entries for the same student+date so
 * the scan doesn't get pushed to the server after being undone.
 */
export async function deleteAttendanceLocal(studentId: string, date: string): Promise<void> {
  const db = await getDB();
  const key = attendanceKey(studentId, date);
  await db.delete('attendance', key);

  const queue = await getPendingSyncs();
  for (const item of queue) {
    if (item.studentId === studentId && item.date === date && item.id !== undefined) {
      await db.delete('syncQueue', item.id);
    }
  }
}

export async function getAllAttendance(): Promise<AttendanceRecord[]> {
  const db = await getDB();
  return db.getAll('attendance');
}

// ─── Sync Queue Operations ─────────────────────────────────────────

export async function addToSyncQueue(scan: Omit<PendingScan, 'id' | 'synced'>): Promise<void> {
  const db = await getDB();
  await db.add('syncQueue', {
    ...scan,
    synced: false,
  } as PendingScan);
}

export async function getPendingSyncs(): Promise<PendingScan[]> {
  const db = await getDB();
  const all = await db.getAll('syncQueue');
  return all.filter(s => !s.synced);
}

export async function markSynced(id: number): Promise<void> {
  const db = await getDB();
  const item = await db.get('syncQueue', id);
  if (item) {
    item.synced = true;
    await db.put('syncQueue', item);
  }
}

export async function removeSynced(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('syncQueue', id);
}

export async function getPendingSyncCount(): Promise<number> {
  const pending = await getPendingSyncs();
  return pending.length;
}

// ─── Meta Operations ───────────────────────────────────────────────

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put('meta', { key, value, updatedAt: Date.now() });
}

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getDB();
  const record = await db.get('meta', key);
  return record?.value;
}

/**
 * Shared student mutations — used by Admin page and Student detail.
 * Handles both API mode and demo (IndexedDB) mode.
 */

import type { Student, StudentInput } from '../types';
import {
  addStudent as apiAddStudent,
  updateStudent as apiUpdateStudent,
  markAttendance,
} from './api';
import {
  getCachedStudents,
  cacheStudents,
  saveAttendanceLocal,
  addToSyncQueue,
  getAttendanceRecord,
} from './db';
import { getCurrentTime, getTodayDate } from '../utils/date';
import { getDeviceName } from '../utils/validation';
import { useAuthStore } from './authStore';

const API_CONFIGURED = !!import.meta.env.VITE_API_URL;

export function nextStudentId(students: Student[]): string {
  let max = 0;
  for (const s of students) {
    const m = s.id.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `RHA${String(max + 1).padStart(3, '0')}`;
}

export function studentIdExists(students: Student[], id: string, excludeId?: string): boolean {
  const norm = id.trim().toUpperCase();
  return students.some(s => s.id.toUpperCase() === norm && s.id !== excludeId);
}

interface SaveInput {
  id?: string;          // present when editing
  studentId: string;    // editable ID (ignored on edit if server owns it)
  name: string;
  class: string;
  age?: number | string;
  guardian?: string;
  contact?: string;
  emergencyContact?: string;
  existing?: Student;   // full existing record for edits (preserves extra fields in demo mode)
}

export async function saveStudent(input: SaveInput): Promise<{ success: boolean; student?: Student; error?: string }> {
  const name = input.name.trim();
  if (!name) return { success: false, error: 'Student name is required' };

  const all = await getCachedStudents();

  if (input.id) {
    // ── Edit ──
    if (API_CONFIGURED) {
      const payload: Partial<Student> & { id: string } = {
        id: input.id,
        name,
        class: input.class,
      };
      const res = await apiUpdateStudent(payload);
      if (!res.success) return { success: false, error: res.error || 'Failed to update student' };
      return { success: true, student: res.data };
    }
    // Demo mode — merge into cache, preserving untouched fields
    const updated: Student = {
      ...(input.existing as Student),
      id: input.id,
      name,
      class: input.class || input.existing?.class || '',
      age: input.existing?.age ?? 0,
      guardian: input.existing?.guardian ?? '',
      contact: input.existing?.contact ?? '',
      emergencyContact: input.existing?.emergencyContact ?? '',
      status: input.existing?.status ?? 'Active',
    };
    await cacheStudents(all.map(s => (s.id === input.id ? updated : s)));
    return { success: true, student: updated };
  }

  // ── Add ──
  const newId = input.studentId.trim().toUpperCase() || nextStudentId(all);
  if (studentIdExists(all, newId)) {
    return { success: false, error: `Student ID ${newId} is already in use` };
  }

  if (API_CONFIGURED) {
    const payload: StudentInput & { id?: string } = {
      id: newId,
      name,
      class: input.class,
      age: input.age === '' || input.age === undefined ? 0 : Number(input.age) || 0,
      guardian: input.guardian,
      contact: input.contact,
      emergencyContact: input.emergencyContact,
    };
    const res = await apiAddStudent(payload);
    if (!res.success) return { success: false, error: res.error || 'Failed to add student' };
    return { success: true, student: res.data };
  }

  // Demo mode
  const record: Student = {
    id: newId,
    name,
    age: Number(input.age) || 0,
    class: input.class || '',
    guardian: input.guardian || '',
    contact: input.contact || '',
    emergencyContact: input.emergencyContact || '',
    status: 'Active',
  };
  await cacheStudents([...all, record]);
  return { success: true, student: record };
}

export async function setStudentStatus(student: Student, status: 'Active' | 'Inactive'): Promise<{ success: boolean; error?: string }> {
  if (API_CONFIGURED) {
    const res = await apiUpdateStudent({ id: student.id, status });
    if (!res.success) return { success: false, error: res.error || 'Update failed' };
    return { success: true };
  }
  const all = await getCachedStudents();
  await cacheStudents(all.map(s => (s.id === student.id ? { ...s, status } : s)));
  return { success: true };
}

/**
 * Mark a student present for an arbitrary past date.
 * Saves locally and queues for sync (API supports arbitrary dates).
 */
export async function markPresentForDate(
  student: Student,
  date: string
): Promise<{ success: boolean; error?: string }> {
  const existing = await getAttendanceRecord(student.id, date);
  if (existing) return { success: false, error: 'Already marked for that day' };

  const time = date === getTodayDate() ? getCurrentTime() : '09:00:00';
  const markedBy = useAuthStore.getName();

  await saveAttendanceLocal({
    date,
    time,
    studentId: student.id,
    name: student.name,
    status: 'Present',
    deviceName: getDeviceName(),
    markedBy,
  });
  await addToSyncQueue({
    studentId: student.id,
    date,
    time,
    deviceName: getDeviceName(),
    markedBy,
    timestamp: Date.now(),
  });

  if (navigator.onLine && API_CONFIGURED) {
    await markAttendance(student.id, date, time, getDeviceName(), markedBy);
  }
  return { success: true };
}

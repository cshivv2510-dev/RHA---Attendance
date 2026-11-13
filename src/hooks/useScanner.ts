import { useState, useCallback, useRef } from 'react';
import type { ScanResult, ScanStatus, Student } from '../types';
import { markAttendance } from '../services/api';
import {
  getCachedStudent,
  getAttendanceRecord,
  saveAttendanceLocal,
  addToSyncQueue,
} from '../services/db';
import { getTodayDate, getCurrentTime } from '../utils/date';
import { normalizeStudentId, isValidStudentId, getDeviceName } from '../utils/validation';
import { playSuccess, playError, vibrate } from '../utils/sound';
import { useAuth } from '../context/AuthContext';

const COOLDOWN_MS = 3000; // 3-second cooldown between scans of the same QR

/**
 * Hook to manage the scan workflow:
 *  1. Validate QR code format
 *  2. Check for duplicate (same student today)
 *  3. Check disabled students
 *  4. Send to API (or queue offline)
 *  5. Play sound / vibrate feedback
 *  6. Return result for display
 */
export function useScanner() {
  const { user } = useAuth();
  const markedBy = user?.name;
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [todayScanCount, setTodayScanCount] = useState(0);
  const lastScannedRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const saveOffline = useCallback(async (
    studentId: string,
    date: string,
    time: string,
    deviceName: string,
    cachedStudent?: Student
  ) => {
    // Save to local attendance
    await saveAttendanceLocal({
      date,
      time,
      studentId,
      name: cachedStudent?.name || studentId,
      status: 'Present',
      deviceName,
      markedBy,
    });

    // Add to sync queue
    await addToSyncQueue({
      studentId,
      date,
      time,
      deviceName,
      markedBy,
      timestamp: Date.now(),
    });

    playSuccess();
    vibrate(100);
    setTodayScanCount(prev => prev + 1);

    setScanResult({
      status: 'offline_saved',
      message: 'Saved on phone, will sync',
      student: cachedStudent,
      timestamp: time,
    });
    setScanStatus('offline_saved');
  }, [markedBy]);

  const handleScan = useCallback(async (decodedText: string) => {
    const studentId = normalizeStudentId(decodedText);
    const now = Date.now();

    // Cooldown check — prevent rapid rescans of the same code
    if (
      lastScannedRef.current.id === studentId &&
      now - lastScannedRef.current.time < COOLDOWN_MS
    ) {
      return;
    }

    lastScannedRef.current = { id: studentId, time: now };
    setScanStatus('processing');

    // 1. Validate format
    if (!isValidStudentId(studentId)) {
      playError();
      vibrate([50, 50, 50]);
      setScanResult({
        status: 'not_found',
        message: "This QR isn't a student card",
      });
      setScanStatus('not_found');
      return;
    }

    const today = getTodayDate();
    const time = getCurrentTime();

    // 2. Check local duplicate
    const existing = await getAttendanceRecord(studentId, today);
    if (existing) {
      const dupStudent = await getCachedStudent(studentId);
      playError();
      vibrate([50, 50, 50]);
      setScanResult({
        status: 'duplicate',
        message: `${dupStudent?.name || studentId} is already marked today.`,
        student: dupStudent,
        existingTime: existing.time,
      });
      setScanStatus('duplicate');
      return;
    }

    // 3. Check for disabled student (from local cache)
    const cachedStudent = await getCachedStudent(studentId);
    if (cachedStudent && cachedStudent.status !== 'Active') {
      playError();
      vibrate([50, 50, 50]);
      setScanResult({
        status: 'disabled',
        message: `${studentId} is disabled. Ask an admin.`,
        student: cachedStudent,
      });
      setScanStatus('disabled');
      return;
    }

    const deviceName = getDeviceName();

    // 4. Try online submission (only if API is configured)
    const apiConfigured = !!import.meta.env.VITE_API_URL;

    if (navigator.onLine && apiConfigured) {
      try {
        const response = await markAttendance(studentId, today, time, deviceName, markedBy);

        if (response.success) {
          // Save locally too
          await saveAttendanceLocal({
            date: today,
            time,
            studentId,
            name: response.data?.studentName || cachedStudent?.name || studentId,
            status: 'Present',
            deviceName,
            markedBy,
          });

          playSuccess();
          vibrate(100);
          setTodayScanCount(prev => prev + 1);

          const student: Student | undefined = cachedStudent || (response.data?.studentName ? {
            id: studentId,
            name: response.data.studentName,
            age: 0,
            class: '',
            guardian: '',
            contact: '',
            emergencyContact: '',
            status: 'Active' as const,
          } : undefined);

          setScanResult({
            status: 'success',
            message: 'Marked present',
            student,
            timestamp: time,
          });
          setScanStatus('success');
          return;
        }

        // Server says duplicate
        if (response.error?.includes('already recorded')) {
          await saveAttendanceLocal({
            date: today,
            time,
            studentId,
            name: cachedStudent?.name || studentId,
            status: 'Present',
            deviceName,
            markedBy,
          });

          playError();
          vibrate([50, 50, 50]);
          setScanResult({
            status: 'duplicate',
            message: 'Attendance already recorded today.',
            student: cachedStudent,
            existingTime: time,
          });
          setScanStatus('duplicate');
          return;
        }

        // Student not found
        if (response.error?.includes('not found')) {
          playError();
          vibrate([50, 50, 50]);
          setScanResult({
            status: 'not_found',
            message: `Student ${studentId} not found in the system.`,
          });
          setScanStatus('not_found');
          return;
        }

        // Other server error — fall through to offline
        await saveOffline(studentId, today, time, deviceName, cachedStudent);
      } catch {
        // Network error — fall through to offline mode
        await saveOffline(studentId, today, time, deviceName, cachedStudent);
      }
    } else {
      // Offline or no API configured — save locally
      await saveOffline(studentId, today, time, deviceName, cachedStudent);
    }
  }, [markedBy, saveOffline]);

  const clearResult = useCallback(() => {
    setScanResult(null);
    setScanStatus('idle');
  }, []);

  return {
    scanResult,
    scanStatus,
    todayScanCount,
    handleScan,
    clearResult,
    setTodayScanCount,
  };
}

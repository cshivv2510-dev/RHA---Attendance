/**
 * API service — communicates with Google Apps Script backend.
 *
 * Key design decisions:
 *  - Uses Content-Type: text/plain to avoid CORS preflight
 *  - Parses JSON from stringified body on the server side
 *  - Exponential backoff retry for network failures
 *  - 15-second timeout per request
 */

import type {
  Student,
  AttendanceRecord,
  ApiResponse,
  DashboardData,
  SearchResult,
  User,
  StudentInput,
  ImportResult,
} from '../types';

// The deployed Google Apps Script Web App URL
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const REQUEST_TIMEOUT = 15000; // 15 seconds
const MAX_RETRIES = 3;

// ─── Session Credentials ────────────────────────────────────────────
// Stored after PIN login; injected into every API request.

interface Credentials {
  userId: string;
  pin: string;
}

let credentials: Credentials | null = null;

export function setCredentials(creds: Credentials | null): void {
  credentials = creds;
}

function withAuth(params: Record<string, string>): Record<string, string> {
  if (!credentials || params.action === 'login') return params;
  return { ...params, userId: credentials.userId, pin: credentials.pin };
}

// ─── Core Fetch Wrapper ────────────────────────────────────────────

async function apiFetch<T>(
  params: Record<string, string>,
  method: 'GET' | 'POST' = 'GET',
  body?: object,
  retries = MAX_RETRIES
): Promise<ApiResponse<T>> {
  if (!API_BASE_URL) {
    return { success: false, error: 'API URL not configured. Set VITE_API_URL in .env' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    let response: Response;
    const authedParams = withAuth(params);

    if (method === 'GET') {
      const queryString = new URLSearchParams(authedParams).toString();
      response = await fetch(`${API_BASE_URL}?${queryString}`, {
        method: 'GET',
        signal: controller.signal,
      });
    } else {
      // POST with text/plain to avoid CORS preflight
      response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({}, authedParams, body)),
        signal: controller.signal,
      });
    }

    clearTimeout(timeoutId);

    // Apps Script redirects — follow them
    const text = await response.text();

    try {
      const data = JSON.parse(text) as ApiResponse<T>;
      return data;
    } catch {
      // Apps Script sometimes returns HTML error pages
      console.error('API returned non-JSON response:', text.substring(0, 200));
      return { success: false, error: 'Server returned an invalid response' };
    }
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof DOMException && err.name === 'AbortError') {
      return { success: false, error: 'Request timed out' };
    }

    // Retry on network failures
    if (retries > 0) {
      const delay = (MAX_RETRIES - retries + 1) * 1000; // 1s, 2s, 3s
      await new Promise(resolve => setTimeout(resolve, delay));
      return apiFetch<T>(params, method, body, retries - 1);
    }

    return { success: false, error: 'Network error — check your connection' };
  }
}

// ─── Public API Methods ────────────────────────────────────────────

/**
 * Fetch all active students
 */
export async function fetchStudents(): Promise<ApiResponse<Student[]>> {
  return apiFetch<Student[]>({ action: 'getStudents' });
}

/**
 * Fetch a single student by ID
 */
export async function fetchStudent(id: string): Promise<ApiResponse<Student>> {
  return apiFetch<Student>({ action: 'getStudent', id });
}

/**
 * Mark attendance for a student
 */
export async function markAttendance(
  studentId: string,
  date: string,
  time: string,
  deviceName: string,
  markedBy?: string
): Promise<ApiResponse<{ studentName: string }>> {
  return apiFetch<{ studentName: string }>(
    { action: 'markAttendance' },
    'POST',
    { studentId, date, time, deviceName, markedBy }
  );
}

/**
 * Get attendance records for a specific date
 */
export async function fetchAttendance(date: string): Promise<ApiResponse<AttendanceRecord[]>> {
  return apiFetch<AttendanceRecord[]>({ action: 'getAttendance', date });
}

/**
 * Get attendance records for a date range
 */
export async function fetchAttendanceRange(
  startDate: string,
  endDate: string
): Promise<ApiResponse<AttendanceRecord[]>> {
  return apiFetch<AttendanceRecord[]>({
    action: 'getAttendanceRange',
    startDate,
    endDate,
  });
}

/**
 * Get dashboard data
 */
export async function fetchDashboard(): Promise<ApiResponse<DashboardData>> {
  return apiFetch<DashboardData>({ action: 'getDashboard' });
}

/**
 * Search students by name or ID
 */
export async function searchStudents(query: string): Promise<ApiResponse<Student[]>> {
  return apiFetch<Student[]>({ action: 'searchStudent', query });
}

/**
 * Get attendance history for a specific student
 */
export async function fetchStudentHistory(
  studentId: string
): Promise<ApiResponse<SearchResult>> {
  return apiFetch<SearchResult>({ action: 'getAttendanceHistory', id: studentId });
}

// ─── Auth ───────────────────────────────────────────────────────────

/**
 * Log in with user ID + PIN.
 * In demo mode (no VITE_API_URL) accepts the built-in demo accounts.
 */
export async function login(
  userId: string,
  pin: string
): Promise<ApiResponse<User>> {
  if (!API_BASE_URL) {
    // Demo mode — local accounts, no server verification
    const demoUsers: Record<string, User & { pin: string }> = {
      U001: { id: 'U001', name: 'Admin', role: 'admin', pin: '1234' },
      U002: { id: 'U002', name: 'Staff', role: 'staff', pin: '1234' },
    };
    const user = demoUsers[userId.trim().toUpperCase()];
    if (user && user.pin === pin) {
      const { pin: _pin, ...safe } = user;
      return { success: true, data: safe };
    }
    return { success: false, error: 'Invalid credentials (demo: U001/admin or U002/staff, PIN 1234)' };
  }

  return apiFetch<User>({ action: 'login', userId: userId.trim().toUpperCase(), pin });
}

// ─── Admin: Users ───────────────────────────────────────────────────

export async function fetchUsers(): Promise<ApiResponse<User[]>> {
  return apiFetch<User[]>({ action: 'getUsers' });
}

export async function addUser(data: {
  name: string;
  role: 'admin' | 'staff';
  pin: string;
}): Promise<ApiResponse<User>> {
  // 'newPin' avoids colliding with the auth 'pin' credential injected by withAuth
  const { pin, ...rest } = data;
  return apiFetch<User>({ action: 'addUser' }, 'POST', { ...rest, newPin: pin });
}

export async function updateUser(data: {
  id: string;
  name?: string;
  role?: 'admin' | 'staff';
  status?: 'Active' | 'Inactive';
  pin?: string;
}): Promise<ApiResponse<User>> {
  const { pin, ...rest } = data;
  return apiFetch<User>({
    action: 'updateUser',
    // 'newPin' avoids colliding with the auth 'pin' credential injected by withAuth
  }, 'POST', { ...rest, ...(pin ? { newPin: pin } : {}) });
}

// ─── Admin: Students ────────────────────────────────────────────────

export async function addStudent(data: StudentInput & { id?: string }): Promise<ApiResponse<Student>> {
  return apiFetch<Student>({ action: 'addStudent' }, 'POST', data);
}

export async function updateStudent(data: Partial<Student> & { id: string }): Promise<ApiResponse<Student>> {
  return apiFetch<Student>({ action: 'updateStudent' }, 'POST', data);
}

export async function importStudents(
  students: StudentInput[]
): Promise<ApiResponse<ImportResult>> {
  return apiFetch<ImportResult>({ action: 'importStudents' }, 'POST', { students });
}

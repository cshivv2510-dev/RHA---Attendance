// ─── Student Types ───────────────────────────────────────────────

export interface Student {
  id: string;
  name: string;
  age: number;
  class: string;
  guardian: string;
  contact: string;
  emergencyContact: string;
  status: 'Active' | 'Inactive';
}

// ─── Attendance Types ────────────────────────────────────────────

export interface AttendanceRecord {
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM:SS
  studentId: string;
  name: string;
  status: 'Present';
  deviceName?: string;
  markedBy?: string;  // name of the staff/admin who scanned
}

export interface PendingScan {
  id?: number;         // auto-increment key in IndexedDB
  studentId: string;
  date: string;
  time: string;
  deviceName: string;
  markedBy?: string;   // name of the user who scanned (offline attribution)
  timestamp: number;   // Date.now() for ordering
  synced: boolean;
}

// ─── Dashboard Types ─────────────────────────────────────────────

export interface DashboardData {
  totalStudents: number;
  presentToday: number;
  absentToday: number;
  attendancePercentage: number;
  todayRecords: AttendanceRecord[];
  weeklyTrend: WeeklyDataPoint[];
  monthlyTrend: MonthlyDataPoint[];
}

export interface WeeklyDataPoint {
  date: string;
  day: string;
  count: number;
  total: number;
}

export interface MonthlyDataPoint {
  month: string;
  /** null = no session days that month (gap in the line, not 0%) */
  percentage: number | null;
  present: number;
  total: number;
}

// ─── Scan Result Types ───────────────────────────────────────────

export type ScanStatus = 'idle' | 'scanning' | 'processing' | 'success' | 'duplicate' | 'not_found' | 'disabled' | 'error' | 'offline_saved';

export interface ScanResult {
  status: ScanStatus;
  message: string;
  student?: Student;
  timestamp?: string;
  /** For 'duplicate': when the student was already marked */
  existingTime?: string;
}

// ─── API Response Types ──────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface MarkAttendancePayload {
  action: 'markAttendance';
  studentId: string;
  date: string;
  time: string;
  deviceName: string;
}

export interface SearchResult {
  student: Student;
  attendanceHistory: AttendanceRecord[];
  attendancePercentage: number;
  lastAttendance: string | null;
  totalDays: number;
  presentDays: number;
}

// ─── Report Types ────────────────────────────────────────────────

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

export type ExportFormat = 'csv' | 'excel' | 'pdf';

export interface ReportFilters {
  period: ReportPeriod;
  startDate: string;
  endDate: string;
}

// ─── User / Auth Types ────────────────────────────────────────────

export type UserRole = 'admin' | 'staff';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  status?: 'Active' | 'Inactive';
}

export interface StudentInput {
  name: string;
  age?: number | string;
  class?: string;
  guardian?: string;
  contact?: string;
  emergencyContact?: string;
}

export interface ImportResult {
  added: number;
  skipped: number;
  errors: string[];
}

// ─── Theme Types ─────────────────────────────────────────────────

export type Theme = 'light' | 'dark';

// ─── App Context Types ───────────────────────────────────────────

export interface AppState {
  isOnline: boolean;
  theme: Theme;
  pendingSyncs: number;
  todayScanCount: number;
  students: Student[];
  studentsLoaded: boolean;
}

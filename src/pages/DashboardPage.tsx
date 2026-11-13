import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { StatusPill } from '../components/ui/StatusPill';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard, SkeletonList } from '../components/ui/Spinner';
import { PageHeader } from '../components/ui/PageHeader';
import { MonthlyChart } from '../components/charts/MonthlyChart';
import { fetchStudents, fetchAttendanceRange } from '../services/api';
import { getAllAttendance, getCachedStudents, cacheStudents } from '../services/db';
import { getTodayDate, getPastDays, getMonthKey, monthShortLabel, shiftMonth, datesInMonth } from '../utils/date';
import { useAuth } from '../context/AuthContext';
import { Users, RefreshCw } from 'lucide-react';
import type { Student, AttendanceRecord, MonthlyDataPoint } from '../types';

export function DashboardPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'absent' | 'present'>('absent');
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef<number | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      // Students — API first, fall back to cache
      let studentList: Student[] = [];
      if (navigator.onLine && import.meta.env.VITE_API_URL) {
        const res = await fetchStudents();
        if (res.success && res.data) {
          await cacheStudents(res.data);
          studentList = res.data;
        }
      }
      if (studentList.length === 0) {
        studentList = await getCachedStudents();
      }
      setStudents(studentList);

      // Attendance records — API range first (covers 6 months), else local
      const today = getTodayDate();
      const sixMonthsAgo = shiftMonth(getMonthKey(today), -6) + '-01';
      let recs: AttendanceRecord[] = [];
      if (navigator.onLine && import.meta.env.VITE_API_URL) {
        const res = await fetchAttendanceRange(sixMonthsAgo, today);
        if (res.success && res.data) {
          recs = res.data;
        }
      }
      if (recs.length === 0) {
        recs = await getAllAttendance();
      }
      setRecords(recs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // ── Pull to refresh ────────────────────────────────────────────
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY <= 0) touchStartY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (touchStartY.current === null) return;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 0 && window.scrollY <= 0) {
        setPullDistance(Math.min(dy * 0.5, 90));
      }
    };
    const onEnd = () => {
      if (pullDistance > 55) {
        loadDashboard();
      }
      touchStartY.current = null;
      setPullDistance(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [pullDistance, loadDashboard]);

  // ── Derived data ───────────────────────────────────────────────
  const activeStudents = students.filter(s => s.status === 'Active');
  const total = activeStudents.length;
  const today = getTodayDate();

  const todayRecords = records.filter(r => r.date === today);
  const presentIdsToday = new Set(todayRecords.map(r => r.studentId));
  const presentToday = presentIdsToday.size;
  const absentToday = Math.max(0, total - presentToday);
  const hasScansToday = todayRecords.length > 0;
  const attendancePct = total === 0 ? null : Math.round((presentToday / total) * 100);

  // Per-day present map for all records
  const presentByDay = new Map<string, Map<string, AttendanceRecord>>();
  for (const r of records) {
    if (!presentByDay.has(r.date)) presentByDay.set(r.date, new Map());
    presentByDay.get(r.date)!.set(r.studentId, r);
  }

  // This week — last 7 days, only session days (days with ≥1 scan)
  const weekDays = getPastDays(7)
    .map(date => {
      const present = presentByDay.get(date)?.size ?? 0;
      return {
        date,
        day: new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' }),
        present,
        total,
        pct: total > 0 ? Math.round((present / total) * 100) : 0,
        isToday: date === today,
      };
    })
    .filter(d => (presentByDay.get(d.date)?.size ?? 0) > 0);

  // Last 6 months — monthly attendance %, null when no session days
  const monthly: (MonthlyDataPoint & { monthKey: string })[] = [];
  const currentMonth = getMonthKey(today);
  for (let i = 5; i >= 0; i--) {
    const mk = shiftMonth(currentMonth, -i);
    const monthDates = datesInMonth(mk, mk === currentMonth ? today : undefined);
    let sum = 0;
    let days = 0;
    for (const d of monthDates) {
      const p = presentByDay.get(d)?.size ?? 0;
      if (p > 0) {
        sum += total > 0 ? (p / total) * 100 : 0;
        days++;
      }
    }
    monthly.push({
      month: monthShortLabel(mk),
      monthKey: mk,
      percentage: days > 0 ? Math.round(sum / days) : null,
      present: 0,
      total: days,
    });
  }
  const monthlyChartData: MonthlyDataPoint[] = monthly.map(m => ({
    month: m.month,
    percentage: m.percentage,
    present: m.present,
    total: m.total,
  }));

  // ── Lists for segmented control ────────────────────────────────
  const studentById = new Map(activeStudents.map(s => [s.id, s]));
  const presentRows = todayRecords
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(r => ({ record: r, student: studentById.get(r.studentId) }))
    .filter(x => x.student);

  const absentRows = activeStudents
    .filter(s => !presentIdsToday.has(s.id))
    .map(s => ({ student: s }));

  const subtitle = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <PageHeader title="Today" subtitle={subtitle} />
        <SkeletonCard />
        <SkeletonList rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Pull indicator */}
      {pullDistance > 0 && (
        <div className="flex justify-center -mb-2">
          <RefreshCw
            size={20}
            className={pullDistance > 55 ? '' : 'animate-spin'}
            style={{ color: '#1f7a3f', transform: `rotate(${pullDistance * 3}deg)`, transition: 'transform 0.1s' }}
          />
        </div>
      )}

      <PageHeader title="Today" subtitle={subtitle} />

      {/* No students empty state */}
      {total === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Users size={28} />}
            title="No students yet"
            description={isAdmin ? 'Add your first students to start taking attendance.' : 'No students yet. Ask your admin to add them.'}
            action={isAdmin ? (
              <button
                onClick={() => navigate('/admin')}
                className="px-5 min-h-[48px] rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: '#1f7a3f' }}
              >
                Add students
              </button>
            ) : undefined}
          />
        </Card>
      ) : (
        <>
          {/* Summary card */}
          <Card className="p-5">
            <div className="flex items-center gap-5">
              {/* Progress ring */}
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--bg-tertiary)" strokeWidth="4" />
                  <circle
                    cx="18" cy="18" r="15.5" fill="none"
                    stroke={hasScansToday ? '#1f7a3f' : 'var(--border-secondary)'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${hasScansToday ? (attendancePct ?? 0) : 0} 100`}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {hasScansToday ? `${attendancePct}%` : '—'}
                  </span>
                </div>
              </div>
              <div className="flex-1">
                {hasScansToday ? (
                  <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {presentToday} present · {absentToday} absent · {total} total
                  </p>
                ) : (
                  <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    No scans yet today
                  </p>
                )}
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {hasScansToday ? 'Students marked so far today' : 'Scan a student card to begin'}
                </p>
              </div>
            </div>
          </Card>

          {/* Segmented list */}
          <div>
            <SegmentedControl
              options={[
                { value: 'absent', label: `Absent (${absentToday})` },
                { value: 'present', label: `Present (${presentToday})` },
              ]}
              value={view}
              onChange={setView}
            />

            <div className="mt-3 flex flex-col gap-3">
              {view === 'absent' && (
                absentRows.length === 0 ? (
                  <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                    Everyone is present today
                  </p>
                ) : (
                  absentRows.map(({ student }) => (
                    <StudentRow key={student.id} student={student} onClick={() => navigate(`/student/${encodeURIComponent(student.id)}`)} />
                  ))
                )
              )}
              {view === 'present' && (
                presentRows.length === 0 ? (
                  <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                    No one marked yet today
                  </p>
                ) : (
                  presentRows.map(({ record, student }) => (
                    <StudentRow
                      key={record.studentId}
                      student={student!}
                      time={record.time}
                      onClick={() => navigate(`/student/${encodeURIComponent(record.studentId)}`)}
                    />
                  ))
                )
              )}
            </div>
          </div>

          {/* This week */}
          {weekDays.length > 0 && (
            <Card className="p-4">
              <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                This week
              </h3>
              <div className="flex items-end justify-between gap-2 h-40">
                {weekDays.map(d => (
                  <button
                    key={d.date}
                    onClick={() => navigate(`/reports?date=${d.date}`)}
                    className="flex-1 flex flex-col items-center gap-1.5 min-w-0"
                  >
                    <span className={`text-[11px] font-semibold ${d.isToday ? 'font-bold' : ''}`} style={{ color: d.isToday ? '#1f7a3f' : 'var(--text-secondary)' }}>
                      {d.present}/{d.total}
                    </span>
                    <div className="w-full flex-1 flex flex-col justify-end rounded-lg overflow-hidden" style={{ backgroundColor: 'rgba(107,144,125,0.18)' }}>
                      <div
                        className="w-full rounded-lg transition-all duration-500"
                        style={{
                          height: `${Math.max(d.pct, d.present > 0 ? 4 : 0)}%`,
                          minHeight: d.present > 0 ? '4px' : '0',
                          backgroundColor: '#1f7a3f',
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                      {d.day}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Last 6 months */}
          {monthlyChartData.some(m => m.percentage !== null) && (
            <Card className="p-4">
              <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Last 6 months
              </h3>
              <MonthlyChart data={monthlyChartData} monthKeys={monthly.map(m => m.monthKey)} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StudentRow({ student, time, onClick }: { student: Student; time?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-colors hover:bg-[var(--bg-card-hover)] min-h-[64px]"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
    >
      <Avatar name={student.name} size={40} />
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {student.name}
        </p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {student.id}{student.class ? ` · Class ${student.class}` : ''}
        </p>
      </div>
      {time ? (
        <span className="text-sm font-medium flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {formatTimeShort(time)}
        </span>
      ) : (
        <StatusPill status="absent" />
      )}
    </button>
  );
}

function formatTimeShort(t: string): string {
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'p' : 'a';
  const dh = hour % 12 || 12;
  return `${dh}:${m}${ampm}`;
}

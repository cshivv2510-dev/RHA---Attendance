import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MoreVertical, QrCode, Pencil, CalendarPlus, Ban, Check, X } from 'lucide-react';
import { Avatar } from '../components/ui/Avatar';
import { StatusPill } from '../components/ui/StatusPill';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { QRCodeModal } from '../components/ui/QRCodeModal';
import { SkeletonList } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { showToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import {
  getCachedStudent,
  getCachedStudents,
  getAttendanceByStudent,
  getAllAttendance,
} from '../services/db';
import { fetchStudent } from '../services/api';
import { saveStudent, setStudentStatus, markPresentForDate } from '../services/students';
import {
  getTodayDate, getMonthKey, monthLabel, datesInMonth, shiftMonth, dayOfWeek, formatTime, formatDateShort,
} from '../utils/date';
import type { Student, AttendanceRecord } from '../types';

type SheetKind = 'none' | 'edit' | 'mark' | 'qr';

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const studentId = decodeURIComponent(id ?? '');

  const [student, setStudent] = useState<Student | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<SheetKind>('none');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [month, setMonth] = useState(() => getMonthKey(getTodayDate()));

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editId, setEditId] = useState('');
  const [saving, setSaving] = useState(false);

  // Mark-present state
  const [markDate, setMarkDate] = useState('');
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Student
      let s: Student | undefined;
      if (navigator.onLine && import.meta.env.VITE_API_URL) {
        const res = await fetchStudent(studentId);
        if (res.success && res.data) s = res.data;
      }
      if (!s) s = await getCachedStudent(studentId);
      if (!s) {
        // try case-insensitive match in cache
        const all = await getCachedStudents();
        s = all.find(x => x.id.toUpperCase() === studentId.toUpperCase());
      }
      setStudent(s ?? null);

      // Records
      const mine = await getAttendanceByStudent(studentId);
      setRecords(mine);
      setAllRecords(await getAllAttendance());
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  // ── Derived ────────────────────────────────────────────────────
  const today = getTodayDate();
  const sessionDays = useMemo(
    () => new Set(allRecords.map(r => r.date)),
    [allRecords]
  );
  const myDates = useMemo(() => new Set(records.map(r => r.date)), [records]);

  const sortedSessionDays = useMemo(
    () => Array.from(sessionDays).sort(),
    [sessionDays]
  );

  // This-month stats
  const thisMonthKey = getMonthKey(today);
  const monthSessionDays = sortedSessionDays.filter(d => getMonthKey(d) === thisMonthKey && d <= today);
  const monthPresentDays = monthSessionDays.filter(d => myDates.has(d));
  const monthPct = monthSessionDays.length > 0
    ? Math.round((monthPresentDays.length / monthSessionDays.length) * 100)
    : null;
  const totalPresent = records.length;
  const totalAbsent = sortedSessionDays.filter(d => !myDates.has(d)).length;

  // Current streak — consecutive session days present, walking back from today
  const streak = useMemo(() => {
    let count = 0;
    const days = sortedSessionDays.slice().reverse();
    for (const d of days) {
      if (d > today) continue;
      if (myDates.has(d)) count++;
      else break;
    }
    return count;
  }, [sortedSessionDays, myDates, today]);

  // Heatmap for selected month
  const heatmap = useMemo(() => {
    const dates = datesInMonth(month, month === thisMonthKey ? today : undefined);
    return dates.map(date => {
      if (!sessionDays.has(date)) return { date, status: 'none' as const };
      return { date, status: myDates.has(date) ? ('present' as const) : ('absent' as const) };
    });
  }, [month, thisMonthKey, today, sessionDays, myDates]);

  const leadingBlanks = month ? dayOfWeek(month + '-01') : 0;

  // Recent history — last 15 session days
  const history = useMemo(() => {
    const byDate = new Map(records.map(r => [r.date, r]));
    return sortedSessionDays.slice().reverse().slice(0, 15).map(d => ({
      date: d,
      record: byDate.get(d),
    }));
  }, [sortedSessionDays, records]);

  const canGoNext = month < thisMonthKey;

  // ── Actions ────────────────────────────────────────────────────
  const openEdit = () => {
    if (!student) return;
    setEditName(student.name);
    setEditClass(student.class || '');
    setEditId(student.id);
    setSheet('edit');
    setMenuOpen(false);
  };

  const handleSaveEdit = async () => {
    if (!student) return;
    if (!editName.trim()) {
      showToast('error', 'Name is required');
      return;
    }
    setSaving(true);
    const res = await saveStudent({
      id: student.id,
      studentId: editId,
      name: editName,
      class: editClass,
      existing: student,
    });
    setSaving(false);
    if (!res.success) {
      showToast('error', res.error || 'Save failed');
      return;
    }
    showToast('success', 'Student updated');
    setSheet('none');
    load();
  };

  const openMark = () => {
    // Default to yesterday if it's a session day, else most recent past session day
    const past = sortedSessionDays.filter(d => d < today).reverse();
    setMarkDate(past[0] ?? '');
    setSheet('mark');
    setMenuOpen(false);
  };

  const handleMark = async () => {
    if (!student || !markDate) return;
    setMarking(true);
    const res = await markPresentForDate(student, markDate);
    setMarking(false);
    if (!res.success) {
      showToast('error', res.error || 'Could not mark attendance');
      return;
    }
    showToast('success', `${student.name} marked present on ${formatDateShort(markDate)}`);
    setSheet('none');
    load();
  };

  const handleDisable = async () => {
    if (!student) return;
    const res = await setStudentStatus(student, 'Inactive');
    if (!res.success) {
      showToast('error', res.error || 'Update failed');
      return;
    }
    showToast('success', `${student.name} disabled`);
    setConfirmDisable(false);
    navigate(-1);
  };

  const markableDates = sortedSessionDays.filter(d => d < today && !myDates.has(d));

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <SkeletonList rows={5} />
      </div>
    );
  }

  if (!student) {
    return (
      <EmptyState
        title="Student not found"
        description={`No student with ID "${studentId}".`}
        action={
          <Button variant="secondary" onClick={() => navigate(-1)}>Go back</Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)]"
          aria-label="Back"
        >
          <ChevronLeft size={24} style={{ color: 'var(--text-primary)' }} />
        </button>
        <Avatar name={student.name} size={44} />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {student.name}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {student.id}{student.class ? ` · Class ${student.class}` : ''}
          </p>
        </div>
        {student.status !== 'Active' && <StatusPill status="disabled" />}
        {isAdmin && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)]"
              aria-label="Student actions"
            >
              <MoreVertical size={20} style={{ color: 'var(--text-secondary)' }} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div
                  className="absolute right-0 top-12 w-60 rounded-2xl border shadow-xl overflow-hidden z-50 animate-scale-in"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
                >
                  {[
                    { label: 'Edit', icon: Pencil, action: openEdit },
                    { label: 'Show QR', icon: QrCode, action: () => { setSheet('qr'); setMenuOpen(false); } },
                    { label: 'Mark present for a past day', icon: CalendarPlus, action: openMark },
                  ].map(item => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-left hover:bg-[var(--bg-tertiary)]"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <item.icon size={18} style={{ color: 'var(--text-secondary)' }} />
                      {item.label}
                    </button>
                  ))}
                  <button
                    onClick={() => { setConfirmDisable(true); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-left hover:bg-[var(--bg-tertiary)]"
                    style={{ color: '#dc2626' }}
                  >
                    <Ban size={18} />
                    {student.status === 'Active' ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'This month', value: monthPct === null ? '—' : `${monthPct}%` },
          { label: 'Present', value: totalPresent },
          { label: 'Absent', value: totalAbsent },
          { label: 'Streak', value: `${streak}d` },
        ].map(s => (
          <Card key={s.label} className="p-3 text-center">
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
            <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Heatmap */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setMonth(m => shiftMonth(m, -1))}
            className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)]"
            aria-label="Previous month"
          >
            <ChevronLeft size={20} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {monthLabel(month)}
          </h3>
          <button
            onClick={() => setMonth(m => shiftMonth(m, 1))}
            disabled={!canGoNext}
            className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] disabled:opacity-30"
            aria-label="Next month"
          >
            <ChevronRight size={20} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} className="text-center text-[10px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
          {heatmap.map(d => (
            <div
              key={d.date}
              title={`${formatDateShort(d.date)} — ${d.status === 'present' ? 'Present' : d.status === 'absent' ? 'Absent' : 'No session'}`}
              className="aspect-square rounded-md flex items-center justify-center text-[10px] font-semibold"
              style={{
                backgroundColor:
                  d.status === 'present' ? 'rgba(31,122,63,0.85)' :
                  d.status === 'absent' ? 'rgba(239,68,68,0.15)' :
                  'var(--bg-tertiary)',
                color:
                  d.status === 'present' ? '#fff' :
                  d.status === 'absent' ? '#dc2626' :
                  'transparent',
              }}
            >
              {d.status === 'absent' ? <X size={10} strokeWidth={3} /> :
               d.status === 'present' ? <Check size={10} strokeWidth={3} /> :
               parseInt(d.date.slice(-2), 10)}
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(31,122,63,0.85)' }} /> Present</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.3)' }} /> Absent</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} /> No session</span>
        </div>
      </Card>

      {/* Recent history */}
      <div>
        <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Recent history
        </h3>
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <div className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
            {history.map(h => (
              <div key={h.date} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {formatDateShort(h.date)}
                  </p>
                  {h.record && (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {formatTime(h.record.time)}
                    </p>
                  )}
                </div>
                <StatusPill status={h.record ? 'present' : 'absent'} />
              </div>
            ))}
            {history.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                No session days yet
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Guardian info (if present) */}
      {(student.guardian || student.contact) && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Guardian</h3>
          {student.guardian && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{student.guardian}</p>}
          {student.contact && (
            <a href={`tel:${student.contact}`} className="text-sm font-medium mt-1 block" style={{ color: '#1f7a3f' }}>
              {student.contact}
            </a>
          )}
        </Card>
      )}

      {/* ── Sheets ─────────────────────────────────────────────── */}
      <BottomSheet open={sheet === 'edit'} onClose={() => setSheet('none')} title="Edit student">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>Name *</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-base outline-none"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>Class</label>
            <input value={editClass} onChange={e => setEditClass(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-base outline-none"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>Student ID</label>
            <input value={editId} disabled className="w-full px-4 py-3 rounded-xl border text-base outline-none opacity-60"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }} />
          </div>
          <Button onClick={handleSaveEdit} isLoading={saving}>Save changes</Button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'mark'} onClose={() => setSheet('none')} title="Mark present for a past day">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>Date</label>
            <select value={markDate} onChange={e => setMarkDate(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-base outline-none"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
              {markableDates.length === 0 && <option value="">No unmarked session days</option>}
              {markableDates.map(d => (
                <option key={d} value={d}>{formatDateShort(d)}</option>
              ))}
            </select>
          </div>
          <Button onClick={handleMark} isLoading={marking} disabled={!markDate}>Mark present</Button>
        </div>
      </BottomSheet>

      <QRCodeModal student={sheet === 'qr' ? student : null} onClose={() => setSheet('none')} />

      <ConfirmDialog
        open={confirmDisable}
        title={student.status === 'Active' ? 'Disable student?' : 'Enable student?'}
        message={
          student.status === 'Active'
            ? `Disable ${student.name} (${student.id})? They won't be counted in attendance.`
            : `Enable ${student.name} (${student.id})? They'll be counted in attendance again.`
        }
        confirmLabel={student.status === 'Active' ? 'Disable' : 'Enable'}
        onConfirm={handleDisable}
        onCancel={() => setConfirmDisable(false)}
      />
    </div>
  );
}

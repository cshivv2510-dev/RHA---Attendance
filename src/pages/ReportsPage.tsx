import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { StatusPill } from '../components/ui/StatusPill';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { BottomSheet } from '../components/ui/BottomSheet';
import { SkeletonList } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { fetchStudents, fetchAttendanceRange } from '../services/api';
import { getCachedStudents, getAllAttendance, cacheStudents } from '../services/db';
import {
  getTodayDate, getPeriodDates, formatDateShort, formatTime, getDateRangeLabel,
} from '../utils/date';
import {
  buildReportCSV, buildReportExcel, buildReportPDF,
  shareOrDownload, reportFileBase,
  type ReportRow, type StudentSummaryRow,
} from '../utils/reportExport';
import { FileSpreadsheet, FileText, Braces, Download, ArrowUpDown } from 'lucide-react';
import type { Student, AttendanceRecord } from '../types';

type Period = 'today' | 'week' | 'month' | 'custom';
type ViewMode = 'student' | 'day';
type SortMode = 'pct' | 'az' | 'id';

const ATTENDANCE_THRESHOLD = 75; // % below which a student is flagged

function getRange(period: Period, customStart: string, customEnd: string): { startDate: string; endDate: string } {
  if (period === 'custom') return { startDate: customStart, endDate: customEnd };
  const legacy = period === 'today' ? 'daily' : period === 'week' ? 'weekly' : 'monthly';
  return getPeriodDates(legacy);
}

export function ReportsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>('week');
  const [customStart, setCustomStart] = useState(getTodayDate());
  const [customEnd, setCustomEnd] = useState(getTodayDate());
  const [customSheetOpen, setCustomSheetOpen] = useState(false);
  const [classFilter, setClassFilter] = useState('all');
  const [view, setView] = useState<ViewMode>('student');
  const [sort, setSort] = useState<SortMode>('pct');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Deep-link from dashboard weekly chart: ?date=YYYY-MM-DD
  useEffect(() => {
    const d = searchParams.get('date');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setCustomStart(d);
      setCustomEnd(d);
      setPeriod('custom');
    }
  }, [searchParams]);

  const { startDate, endDate } = useMemo(
    () => getRange(period, customStart, customEnd),
    [period, customStart, customEnd]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Students
      let studs: Student[] = [];
      if (navigator.onLine && import.meta.env.VITE_API_URL) {
        const res = await fetchStudents();
        if (res.success && res.data) {
          await cacheStudents(res.data);
          studs = res.data;
        }
      }
      if (studs.length === 0) studs = await getCachedStudents();
      setStudents(studs);

      // Records in range
      let recs: AttendanceRecord[] = [];
      if (navigator.onLine && import.meta.env.VITE_API_URL) {
        const res = await fetchAttendanceRange(startDate, endDate);
        if (res.success && res.data) recs = res.data;
      }
      if (recs.length === 0) {
        const all = await getAllAttendance();
        recs = all.filter(r => r.date >= startDate && r.date <= endDate);
      }
      setRecords(recs);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Derived report data ────────────────────────────────────────
  const activeStudents = useMemo(
    () => students.filter(s => s.status === 'Active'),
    [students]
  );
  const filteredStudents = useMemo(
    () => activeStudents.filter(s => classFilter === 'all' || s.class === classFilter),
    [activeStudents, classFilter]
  );

  const classes = useMemo(() => {
    const set = new Set<string>();
    activeStudents.forEach(s => { if (s.class) set.add(s.class); });
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }, [activeStudents]);

  // Present map: date → studentId → record
  const presentByDay = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceRecord>>();
    for (const r of records) {
      if (r.date < startDate || r.date > endDate) continue;
      if (!map.has(r.date)) map.set(r.date, new Map());
      map.get(r.date)!.set(r.studentId, r);
    }
    return map;
  }, [records, startDate, endDate]);

  // Session days = days in range with ≥1 scan
  const sessionDays = useMemo(
    () => Array.from(presentByDay.keys()).sort(),
    [presentByDay]
  );

  const totalPresentInstances = useMemo(
    () => sessionDays.reduce((sum, d) => sum + (presentByDay.get(d)?.size ?? 0), 0),
    [sessionDays, presentByDay]
  );

  const attendancePct = sessionDays.length > 0 && filteredStudents.length > 0
    ? Math.round((totalPresentInstances / (sessionDays.length * filteredStudents.length)) * 100)
    : null;

  // Per-student summary
  const summary = useMemo<StudentSummaryRow[]>(() => {
    return filteredStudents.map(s => {
      let present = 0;
      for (const d of sessionDays) {
        if (presentByDay.get(d)?.has(s.id)) present++;
      }
      const absent = sessionDays.length - present;
      return {
        studentId: s.id,
        name: s.name,
        className: s.class || '',
        daysPresent: present,
        daysAbsent: absent,
        sessionDays: sessionDays.length,
        percentage: sessionDays.length > 0 ? Math.round((present / sessionDays.length) * 100) : null,
      };
    });
  }, [filteredStudents, sessionDays, presentByDay]);

  const sortedSummary = useMemo(() => {
    const list = summary.slice();
    if (sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'id') list.sort((a, b) => a.studentId.localeCompare(b.studentId));
    else list.sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101) || a.name.localeCompare(b.name));
    return list;
  }, [summary, sort]);

  // Flat report rows for export (present + absent)
  const reportRows = useMemo<ReportRow[]>(() => {
    const rows: ReportRow[] = [];
    for (const date of sessionDays.slice().reverse()) {
      const dayPresent = presentByDay.get(date) ?? new Map();
      for (const s of filteredStudents) {
        const rec = dayPresent.get(s.id);
        rows.push({
          date,
          time: rec?.time ?? '',
          studentId: s.id,
          name: s.name,
          status: rec ? 'Present' : 'Absent',
          className: s.class || '',
        });
      }
    }
    return rows;
  }, [sessionDays, presentByDay, filteredStudents]);

  // By-day groups
  const dayGroups = useMemo(() => {
    return sessionDays.slice().reverse().map(date => {
      const dayPresent = presentByDay.get(date) ?? new Map();
      const presentRows = filteredStudents
        .filter(s => dayPresent.has(s.id))
        .map(s => ({ student: s, record: dayPresent.get(s.id)! }));
      const absentRows = filteredStudents.filter(s => !dayPresent.has(s.id));
      return { date, presentRows, absentRows, presentCount: presentRows.length };
    });
  }, [sessionDays, presentByDay, filteredStudents]);

  // ── Export ─────────────────────────────────────────────────────
  const fileBase = reportFileBase(startDate, endDate);
  const periodLabel = getDateRangeLabel(startDate, endDate);

  const doExport = async (format: 'csv' | 'excel' | 'pdf') => {
    setExportSheetOpen(false);
    let blob: Blob;
    let ext: string;
    if (format === 'csv') {
      blob = buildReportCSV(reportRows);
      ext = 'csv';
    } else if (format === 'excel') {
      blob = buildReportExcel(reportRows, summary);
      ext = 'xlsx';
    } else {
      blob = buildReportPDF(reportRows, summary, periodLabel);
      ext = 'pdf';
    }
    await shareOrDownload(blob, `${fileBase}.${ext}`);
  };

  const periodChips: { value: Period; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Reports"
        subtitle={periodLabel}
        actions={
          <Button variant="secondary" size="sm" onClick={() => setExportSheetOpen(true)}>
            Export
          </Button>
        }
      />

      {/* Period chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {periodChips.map(p => (
          <button
            key={p.value}
            onClick={() => {
              if (p.value === 'custom') setCustomSheetOpen(true);
              else setPeriod(p.value);
            }}
            className="px-4 min-h-[40px] rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex-shrink-0"
            style={
              period === p.value || (p.value === 'custom' && period === 'custom')
                ? { backgroundColor: '#1f7a3f', color: '#fff' }
                : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Class filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {classes.map(c => (
          <button
            key={c}
            onClick={() => setClassFilter(c)}
            className="px-4 min-h-[36px] rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex-shrink-0"
            style={
              classFilter === c
                ? { backgroundColor: 'var(--bg-card)', color: '#1f7a3f', border: '1px solid #1f7a3f' }
                : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }
            }
          >
            {c === 'all' ? 'All classes' : `Class ${c}`}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={6} />
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Attendance', value: attendancePct === null ? '—' : `${attendancePct}%` },
              { label: 'Session days', value: sessionDays.length },
              { label: 'Students', value: filteredStudents.length },
            ].map(s => (
              <Card key={s.label} className="p-3 text-center">
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
                <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
              </Card>
            ))}
          </div>

          {sessionDays.length === 0 ? (
            <EmptyState
              icon={<FileText size={28} />}
              title="No records for this period"
              description="Try a different period or class filter."
            />
          ) : (
            <>
              {/* View toggle + sort */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SegmentedControl
                    options={[
                      { value: 'student', label: 'By student' },
                      { value: 'day', label: 'By day' },
                    ]}
                    value={view}
                    onChange={setView}
                  />
                </div>
                {view === 'student' && (
                  <button
                    onClick={() => setSortSheetOpen(true)}
                    className="w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
                    aria-label="Sort options"
                  >
                    <ArrowUpDown size={18} />
                  </button>
                )}
              </div>

              {/* By student */}
              {view === 'student' && (
                <div className="flex flex-col gap-2">
                  {sortedSummary.map(s => {
                    const low = s.percentage !== null && s.percentage < ATTENDANCE_THRESHOLD;
                    return (
                      <button
                        key={s.studentId}
                        onClick={() => navigate(`/student/${encodeURIComponent(s.studentId)}`)}
                        className="w-full flex items-center gap-3 p-3 rounded-2xl border text-left min-h-[64px]"
                        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
                      >
                        <Avatar name={s.name} size={40} />
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {s.studentId}{s.className ? ` · Class ${s.className}` : ''} · {s.daysPresent}/{s.sessionDays} days
                          </p>
                        </div>
                        <span
                          className="text-base font-bold flex-shrink-0"
                          style={{ color: low ? '#dc2626' : 'var(--text-primary)' }}
                        >
                          {s.percentage === null ? '—' : `${s.percentage}%`}
                        </span>
                      </button>
                    );
                  })}
                  {sortedSummary.length === 0 && (
                    <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                      No students match this filter
                    </p>
                  )}
                </div>
              )}

              {/* By day */}
              {view === 'day' && (
                <div className="flex flex-col gap-4">
                  {dayGroups.map(g => {
                    return (
                      <div key={g.date}>
                        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                          {formatDateShort(g.date)} · {g.presentCount}/{filteredStudents.length} present
                        </p>
                        <Card className="overflow-hidden">
                          <div className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
                            {[...g.presentRows, ...g.absentRows.map(s => ({ student: s, record: undefined as AttendanceRecord | undefined }))].map(({ student, record }) => (
                              <button
                                key={student.id}
                                onClick={() => navigate(`/student/${encodeURIComponent(student.id)}`)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left min-h-[56px]"
                              >
                                <Avatar name={student.name} size={36} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{student.name}</p>
                                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    {student.id}{student.class ? ` · Class ${student.class}` : ''}
                                    {record ? ` · ${formatTime(record.time)}` : ''}
                                  </p>
                                </div>
                                <StatusPill status={record ? 'present' : 'absent'} />
                              </button>
                            ))}
                          </div>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Custom range sheet */}
      <BottomSheet open={customSheetOpen} onClose={() => setCustomSheetOpen(false)} title="Custom range">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>From</label>
            <input type="date" value={customStart} max={customEnd}
              onChange={e => setCustomStart(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border text-base outline-none"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>To</label>
            <input type="date" value={customEnd} min={customStart} max={getTodayDate()}
              onChange={e => setCustomEnd(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border text-base outline-none"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }} />
          </div>
          <Button onClick={() => { setPeriod('custom'); setCustomSheetOpen(false); }}>Apply</Button>
        </div>
      </BottomSheet>

      {/* Sort sheet */}
      <BottomSheet open={sortSheetOpen} onClose={() => setSortSheetOpen(false)} title="Sort by">
        <div className="flex flex-col">
          {([
            { value: 'pct', label: 'Lowest attendance first' },
            { value: 'az', label: 'Name A–Z' },
            { value: 'id', label: 'Student ID' },
          ] as { value: SortMode; label: string }[]).map(opt => (
            <button
              key={opt.value}
              onClick={() => { setSort(opt.value); setSortSheetOpen(false); }}
              className="flex items-center justify-between px-2 py-3.5 text-left text-base font-medium min-h-[48px]"
              style={{ color: 'var(--text-primary)' }}
            >
              {opt.label}
              {sort === opt.value && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#1f7a3f' }} />}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Export sheet */}
      <BottomSheet open={exportSheetOpen} onClose={() => setExportSheetOpen(false)} title="Export report">
        <div className="flex flex-col gap-2">
          {[
            { format: 'csv' as const, icon: Braces, title: 'CSV', desc: 'Plain text spreadsheet — opens anywhere' },
            { format: 'excel' as const, icon: FileSpreadsheet, title: 'Excel', desc: 'XLSX with a per-student summary sheet' },
            { format: 'pdf' as const, icon: FileText, title: 'PDF', desc: 'Formatted report, ready to share or print' },
          ].map(opt => (
            <button
              key={opt.format}
              onClick={() => doExport(opt.format)}
              className="flex items-center gap-3 p-4 rounded-2xl border text-left min-h-[64px]"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }}
            >
              <opt.icon size={22} style={{ color: '#1f7a3f' }} />
              <div className="flex-1">
                <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.title}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{opt.desc}</p>
              </div>
              <Download size={18} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          ))}
          <p className="text-xs text-center mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Includes present and absent rows for {periodLabel}
          </p>
        </div>
      </BottomSheet>
    </div>
  );
}

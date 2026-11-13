import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Avatar } from '../components/ui/Avatar';
import { StatusPill } from '../components/ui/StatusPill';
import { SkeletonList } from '../components/ui/Spinner';
import { getCachedStudents, getAttendanceByDate } from '../services/db';
import { fetchStudents } from '../services/api';
import { cacheStudents } from '../services/db';
import { getTodayDate } from '../utils/date';
import { Search, X } from 'lucide-react';
import type { Student, AttendanceRecord } from '../types';

function studentMatches(s: Student, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return false;
  if (s.name.toLowerCase().includes(query)) return true;
  if (s.id.toLowerCase().includes(query)) return true;
  const idNorm = s.id.toLowerCase().replace(/^rha0+/, 'rha');
  const qNorm = query.replace(/^rha0+/, 'rha');
  if (idNorm === qNorm) return true;
  if (/^\d+$/.test(query)) {
    const idNum = parseInt(s.id.replace(/\D/g, ''), 10);
    return Number.isFinite(idNum) && idNum === parseInt(query, 10);
  }
  return false;
}

/** Bold the matched portion of the name */
function HighlightedName({ name, query }: { name: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{name}</>;
  const idx = name.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, idx)}
      <strong>{name.slice(idx, idx + q.length)}</strong>
      {name.slice(idx + q.length)}
    </>
  );
}

export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayPresent, setTodayPresent] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (navigator.onLine && import.meta.env.VITE_API_URL) {
        const res = await fetchStudents();
        if (res.success && res.data) {
          await cacheStudents(res.data);
          setStudents(res.data);
        } else {
          setStudents(await getCachedStudents());
        }
      } else {
        setStudents(await getCachedStudents());
      }

      const records: AttendanceRecord[] = await getAttendanceByDate(getTodayDate());
      setTodayPresent(new Set(records.map(r => r.studentId)));
      setLoading(false);
    };
    load();
  }, []);

  const activeStudents = useMemo(
    () => students.filter(s => s.status === 'Active'),
    [students]
  );

  const classes = useMemo(() => {
    const set = new Set<string>();
    activeStudents.forEach(s => { if (s.class) set.add(s.class); });
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }, [activeStudents]);

  const results = useMemo(() => {
    let list = activeStudents;
    if (classFilter !== 'all') {
      list = list.filter(s => s.class === classFilter);
    }
    if (query.trim()) {
      list = list.filter(s => studentMatches(s, query));
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [activeStudents, classFilter, query]);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Search" subtitle="Find a student by name or ID" />

      {/* Sticky search */}
      <div
        className="sticky z-40 py-3 -mx-4 px-4 mb-2"
        style={{
          top: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Name or ID (RHA001)"
            autoComplete="off"
            autoCapitalize="characters"
            className="w-full pl-11 pr-11 min-h-[48px] rounded-xl border text-base outline-none transition-all"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg"
              aria-label="Clear search"
            >
              <X size={18} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
        </div>

        {/* Class chips */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
          {classes.map(c => (
            <button
              key={c}
              onClick={() => setClassFilter(c)}
              className="px-4 min-h-[36px] rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex-shrink-0"
              style={
                classFilter === c
                  ? { backgroundColor: '#1f7a3f', color: '#fff' }
                  : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }
              }
            >
              {c === 'all' ? 'All classes' : `Class ${c}`}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <SkeletonList rows={6} />
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            No student matches “{query.trim()}”
          </p>
          <button
            onClick={() => setQuery('')}
            className="text-sm font-semibold mt-2 min-h-[44px] px-3"
            style={{ color: '#1f7a3f' }}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mt-2">
          {results.map(s => {
            const present = todayPresent.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/student/${encodeURIComponent(s.id)}`)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-colors hover:bg-[var(--bg-card-hover)] min-h-[64px]"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
              >
                <Avatar name={s.name} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    <HighlightedName name={s.name} query={query} />
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {s.id}{s.class ? ` · Class ${s.class}` : ''}
                  </p>
                </div>
                {present ? <StatusPill status="present" /> : <StatusPill status="absent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

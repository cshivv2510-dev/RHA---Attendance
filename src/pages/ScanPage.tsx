import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrScanner } from '../components/scanner/QrScanner';
import { ScanResultCard } from '../components/scanner/ScanResultCard';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Avatar } from '../components/ui/Avatar';
import { useScanner } from '../hooks/useScanner';
import { useSound } from '../hooks/useSound';
import { getAttendanceByDate, getCachedStudents, deleteAttendanceLocal } from '../services/db';
import { getTodayDate, formatTime } from '../utils/date';
import { showToast } from '../components/ui/Toast';
import { Volume2, VolumeX, Pause, Play, Search, Camera, Keyboard } from 'lucide-react';
import type { Student, AttendanceRecord } from '../types';

const TERMINAL = ['success', 'duplicate', 'not_found', 'disabled', 'error', 'offline_saved'];

function studentMatches(s: Student, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return false;
  if (s.name.toLowerCase().includes(query)) return true;
  if (s.id.toLowerCase().includes(query)) return true;
  // Tolerant ID match: "rha1" / "1" / "001" all find RHA001
  const idNorm = s.id.toLowerCase().replace(/^rha0+/, 'rha');
  const qNorm = query.replace(/^rha0+/, 'rha');
  if (idNorm === qNorm) return true;
  if (/^\d+$/.test(query)) {
    const idNum = parseInt(s.id.replace(/\D/g, ''), 10);
    return Number.isFinite(idNum) && idNum === parseInt(query, 10);
  }
  return false;
}

export function ScanPage() {
  const { scanResult, handleScan, clearResult, setTodayScanCount } = useScanner();
  const { isMuted, toggleMute, initSounds } = useSound();
  const navigate = useNavigate();

  const [isScannerActive, setIsScannerActive] = useState(true);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [cameraRetry, setCameraRetry] = useState(0);
  const [students, setStudents] = useState<Student[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResultKey = useRef('');

  // Initialize sounds on first interaction
  useEffect(() => {
    const handleInteraction = () => {
      initSounds();
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
    };
    document.addEventListener('touchstart', handleInteraction, { once: true });
    document.addEventListener('click', handleInteraction, { once: true });
    return () => {
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
    };
  }, [initSounds]);

  const loadToday = useCallback(async () => {
    const today = getTodayDate();
    const records = await getAttendanceByDate(today);
    records.sort((a, b) => b.time.localeCompare(a.time));
    setTodayRecords(records);
    setTodayScanCount(new Set(records.map(r => r.studentId)).size);

    const all = await getCachedStudents();
    setStudents(all.filter(s => s.status === 'Active'));
    setTotalActive(all.filter(s => s.status === 'Active').length);
  }, [setTodayScanCount]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const onScanSuccess = useCallback((decodedText: string) => {
    handleScan(decodedText);
  }, [handleScan]);

  const onCameraError = useCallback((msg: string) => {
    if (/permission|denied|not allowed/i.test(msg)) {
      setCameraDenied(true);
    }
  }, []);

  const onCameraReady = useCallback(() => {
    setCameraDenied(false);
  }, []);

  // Border flash on each new terminal result (400ms)
  useEffect(() => {
    if (!scanResult || !TERMINAL.includes(scanResult.status)) return;
    const key = `${scanResult.status}-${scanResult.timestamp}-${scanResult.student?.id ?? ''}`;
    if (key === lastResultKey.current) return;
    lastResultKey.current = key;

    const colors: Record<string, string> = {
      success: 'rgba(31,122,63,0.9)',
      offline_saved: 'rgba(31,122,63,0.9)',
      duplicate: 'rgba(245,158,11,0.9)',
      not_found: 'rgba(239,68,68,0.9)',
      error: 'rgba(239,68,68,0.9)',
      disabled: 'rgba(107,144,125,0.9)',
    };
    setFlashColor(colors[scanResult.status] ?? null);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashColor(null), 400);
  }, [scanResult]);

  const showResult = scanResult && TERMINAL.includes(scanResult.status);

  const handleUndo = useCallback(async () => {
    if (!scanResult?.student) return;
    const studentId = scanResult.student.id;
    await deleteAttendanceLocal(studentId, getTodayDate());
    setTodayScanCount(prev => Math.max(0, prev - 1));
    clearResult();
    showToast('success', 'Undone', {
      label: 'Restore',
      onAction: () => handleScan(studentId),
    });
    loadToday();
  }, [scanResult, clearResult, setTodayScanCount, handleScan, loadToday]);

  const manualResults = manualQuery.trim()
    ? students.filter(s => studentMatches(s, manualQuery)).slice(0, 8)
    : [];

  const handleManualPick = (s: Student) => {
    setManualOpen(false);
    setManualQuery('');
    handleScan(s.id);
  };

  const presentCount = new Set(todayRecords.map(r => r.studentId)).size;
  const pct = totalActive > 0 ? Math.round((presentCount / totalActive) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Scan
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleMute}
            className="w-11 h-11 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-tertiary)]"
            aria-label={isMuted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {isMuted ? <VolumeX size={20} style={{ color: 'var(--text-secondary)' }} /> : <Volume2 size={20} style={{ color: 'var(--text-secondary)' }} />}
          </button>
          <button
            onClick={() => setIsScannerActive(a => !a)}
            className="w-11 h-11 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-tertiary)]"
            aria-label={isScannerActive ? 'Pause scanner' : 'Resume scanner'}
          >
            {isScannerActive ? <Pause size={20} style={{ color: 'var(--text-secondary)' }} /> : <Play size={20} style={{ color: 'var(--text-secondary)' }} />}
          </button>
        </div>
      </div>

      {/* Camera */}
      <div
        className="relative rounded-2xl overflow-hidden transition-shadow duration-300"
        style={{
          boxShadow: flashColor ? `0 0 0 4px ${flashColor}` : 'none',
        }}
      >
        {cameraDenied ? (
          <div
            className="w-full aspect-square rounded-2xl flex flex-col items-center justify-center gap-3 p-6 text-center"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-primary)' }}
          >
            <Camera size={36} style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Camera is off
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Allow camera access to scan student cards, or enter the ID manually.
            </p>
            <button
              onClick={() => { setCameraDenied(false); setCameraRetry(r => r + 1); setIsScannerActive(true); }}
              className="mt-1 px-5 min-h-[44px] rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: '#1f7a3f' }}
            >
              Allow camera
            </button>
          </div>
        ) : (
          <>
            <QrScanner
              key={cameraRetry}
              onScanSuccess={onScanSuccess}
              isActive={isScannerActive}
              onCameraError={onCameraError}
              onCameraReady={onCameraReady}
            />

            {/* Single green viewfinder — four corner brackets at ~70% */}
            {isScannerActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-[70%] aspect-square">
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" fill="none">
                    <path d="M 22 4 L 4 4 L 4 22" stroke="#4cc07f" strokeWidth="3" strokeLinecap="round" />
                    <path d="M 78 4 L 96 4 L 96 22" stroke="#4cc07f" strokeWidth="3" strokeLinecap="round" />
                    <path d="M 22 96 L 4 96 L 4 78" stroke="#4cc07f" strokeWidth="3" strokeLinecap="round" />
                    <path d="M 78 96 L 96 96 L 96 78" stroke="#4cc07f" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}

            {/* Paused overlay */}
            {!isScannerActive && (
              <button
                onClick={() => setIsScannerActive(true)}
                className="absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                aria-label="Resume scanner"
              >
                <span className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.95)' }}>
                  <Play size={36} style={{ color: '#111' }} className="ml-1" />
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Hint */}
      <p className="text-sm text-center -mt-1" style={{ color: 'var(--text-secondary)' }}>
        Point at the QR on the student's card
      </p>

      {/* Result card — persists until next scan */}
      {showResult && scanResult && (
        <ScanResultCard result={scanResult} onUndo={handleUndo} />
      )}

      {/* Manual entry */}
      <button
        onClick={() => setManualOpen(true)}
        className="w-full flex items-center justify-center gap-2 border rounded-xl font-semibold transition-colors min-h-[48px]"
        style={{ borderColor: 'var(--border-focus)', color: '#1f7a3f', backgroundColor: 'transparent' }}
      >
        <Keyboard size={18} />
        Enter ID manually
      </button>

      {/* Today's scans */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Today · {presentCount} of {totalActive || '—'} present
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm font-semibold min-h-[44px] px-2"
            style={{ color: '#1f7a3f' }}
          >
            View all
          </button>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: '#1f7a3f' }}
          />
        </div>

        {todayRecords.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            No scans yet today
          </p>
        ) : (
          <div className="flex flex-col">
            {todayRecords.slice(0, 5).map(r => (
              <button
                key={`${r.studentId}-${r.time}`}
                onClick={() => navigate(`/student/${encodeURIComponent(r.studentId)}`)}
                className="flex items-center gap-3 min-h-[64px] py-2 text-left"
              >
                <Avatar name={r.name} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {r.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {r.studentId}
                  </p>
                </div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {formatTime(r.time)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Manual entry sheet */}
      <BottomSheet open={manualOpen} onClose={() => { setManualOpen(false); setManualQuery(''); }} title="Mark present">
        <div className="relative mb-3">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            value={manualQuery}
            onChange={e => setManualQuery(e.target.value)}
            placeholder="Student ID or name"
            autoFocus
            autoCapitalize="characters"
            className="w-full pl-11 pr-4 min-h-[48px] rounded-xl border text-base outline-none"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {manualQuery.trim() && (
          <div className="flex flex-col">
            {manualResults.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
                No student matches “{manualQuery.trim()}”
              </p>
            ) : (
              manualResults.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleManualPick(s)}
                  className="flex items-center gap-3 min-h-[64px] py-2 text-left"
                >
                  <Avatar name={s.name} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                      {s.name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {s.id}{s.class ? ` · Class ${s.class}` : ''}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

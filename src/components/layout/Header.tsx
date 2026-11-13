import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { onSyncStatusChange, retrySync, type SyncState } from '../../services/sync';
import { getPendingSyncs } from '../../services/db';
import type { PendingScan } from '../../types';
import { Avatar } from '../ui/Avatar';
import logo from '../../assets/logo.png';
import {
  RefreshCw,
  CloudOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Moon,
  Sun,
  LogOut,
} from 'lucide-react';

function formatSyncTime(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isOnline } = useOnlineStatus();
  const [sync, setSync] = useState<SyncState>({ pending: 0, syncing: false, failed: false, lastSyncAt: null });
  const [menuOpen, setMenuOpen] = useState(false);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingScan[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onSyncStatusChange(setSync);
  }, []);

  // Close dropdowns on outside tap
  useEffect(() => {
    if (!menuOpen && !syncPanelOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setSyncPanelOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen, syncPanelOpen]);

  const openSyncPanel = async () => {
    setPendingItems(await getPendingSyncs());
    setSyncPanelOpen(true);
    setMenuOpen(false);
  };

  // ── Sync chip state ────────────────────────────────────────────
  let chip: { label: string; tone: 'green' | 'amber' | 'grey' | 'red'; action: 'info' | 'retry' | 'panel' | 'none' };
  if (!isOnline) {
    chip = { label: sync.pending > 0 ? `Offline · ${sync.pending} saved` : 'Offline', tone: 'grey', action: 'info' };
  } else if (sync.failed && sync.pending > 0) {
    chip = { label: `${sync.pending} not synced`, tone: 'red', action: 'panel' };
  } else if (sync.pending > 0 || sync.syncing) {
    chip = { label: `Syncing ${sync.pending}…`, tone: 'amber', action: 'retry' };
  } else {
    chip = { label: 'Synced', tone: 'green', action: 'info' };
  }

  const chipColors = {
    green: { bg: 'rgba(31,122,63,0.10)', fg: '#196b36' },
    amber: { bg: 'rgba(245,158,11,0.14)', fg: '#b45309' },
    grey: { bg: 'rgba(107,144,125,0.15)', fg: '#4b6b56' },
    red: { bg: 'rgba(239,68,68,0.12)', fg: '#dc2626' },
  };
  const isDark = theme === 'dark';
  const cc = isDark
    ? {
        green: { bg: 'rgba(76,192,127,0.15)', fg: '#7dd3a6' },
        amber: { bg: 'rgba(245,158,11,0.15)', fg: '#fcd34d' },
        grey: { bg: 'rgba(107,154,125,0.15)', fg: '#a3c4b0' },
        red: { bg: 'rgba(239,68,68,0.15)', fg: '#fca5a5' },
      }[chip.tone]
    : chipColors[chip.tone];

  const onChipTap = () => {
    if (chip.action === 'retry') {
      retrySync();
    } else if (chip.action === 'panel') {
      openSyncPanel();
    } else if (chip.action === 'info' && isOnline && sync.lastSyncAt) {
      // Show last sync time via title; also open panel for details
      openSyncPanel();
    } else if (!isOnline && sync.pending > 0) {
      openSyncPanel();
    }
  };

  return (
    <header
      className="sticky top-0 z-50 safe-top backdrop-blur-xl border-b"
      style={{
        backgroundColor: 'var(--nav-bg)',
        borderColor: 'var(--nav-border)',
      }}
    >
      <div className="w-full max-w-[560px] mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo & title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={logo}
            alt="Robin Hood Army"
            className="h-8 w-auto object-contain flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="text-sm font-bold leading-tight whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
            Robin Hood Army
            <span className="hidden min-[600px]:inline font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {' '}· Attendance
            </span>
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1.5" ref={menuRef}>
          {/* Sync chip */}
          <button
            onClick={onChipTap}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-transform active:scale-95"
            style={{ backgroundColor: cc.bg, color: cc.fg }}
            title={
              isOnline && sync.lastSyncAt
                ? `Last synced ${formatSyncTime(sync.lastSyncAt)}`
                : !isOnline
                  ? 'Scans are saved on this phone and will sync later'
                  : undefined
            }
          >
            {chip.tone === 'green' && <CheckCircle2 size={13} />}
            {chip.tone === 'amber' && <RefreshCw size={13} className={sync.syncing ? 'animate-spin' : ''} />}
            {chip.tone === 'grey' && <CloudOff size={13} />}
            {chip.tone === 'red' && <AlertCircle size={13} />}
            {chip.label}
          </button>

          {/* Avatar menu */}
          {user && (
            <div className="relative">
              <button
                onClick={() => { setMenuOpen(o => !o); setSyncPanelOpen(false); }}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-transform active:scale-95"
                aria-label="Account menu"
              >
                <Avatar name={user.name} size={32} />
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-12 w-64 rounded-2xl border shadow-xl overflow-hidden animate-scale-in z-50"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                    <p className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>
                      {user.role}
                    </p>
                  </div>
                  <button
                    onClick={() => { toggleTheme(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    Dark mode
                    <span
                      className="ml-auto w-9 h-5 rounded-full relative transition-colors"
                      style={{ backgroundColor: theme === 'dark' ? '#1f7a3f' : 'var(--border-secondary)' }}
                    >
                      <span
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                        style={{ left: theme === 'dark' ? '18px' : '2px' }}
                      />
                    </span>
                  </button>
                  <button
                    onClick={() => { logout(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: '#dc2626' }}
                  >
                    <LogOut size={18} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sync details panel */}
      {syncPanelOpen && (
        <div
          className="absolute right-4 top-16 w-72 rounded-2xl border shadow-xl overflow-hidden animate-scale-in z-50"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
        >
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-primary)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Sync status</p>
            <button
              onClick={() => setSyncPanelOpen(false)}
              className="text-xs font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              Close
            </button>
          </div>
          <div className="px-4 py-3 space-y-2 max-h-56 overflow-y-auto">
            {!isOnline && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                You're offline — scans are saved on this phone and will sync automatically when you're back online.
              </p>
            )}
            {isOnline && sync.lastSyncAt && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Last synced at {formatSyncTime(sync.lastSyncAt)}
              </p>
            )}
            {pendingItems.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {isOnline ? 'Everything is synced.' : 'Nothing pending.'}
              </p>
            ) : (
              pendingItems.map(item => (
                <div key={item.id} className="flex items-center justify-between text-xs py-1">
                  <span style={{ color: 'var(--text-primary)' }}>
                    {item.studentId} · {item.date} {item.time.slice(0, 5)}
                  </span>
                  <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
                </div>
              ))
            )}
          </div>
          {pendingItems.length > 0 && isOnline && (
            <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--border-primary)' }}>
              <button
                onClick={() => { retrySync(); }}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-rha-green-700 min-h-[40px]"
              >
                <RefreshCw size={15} /> Retry now
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { ToastContainer } from '../ui/Toast';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export function Layout() {
  const { isOnline } = useOnlineStatus();

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <ToastContainer />
      <Header />

      {/* Offline banner */}
      {!isOnline && (
        <div
          className="text-center py-2 px-4 text-xs font-medium border-b"
          style={{
            backgroundColor: 'rgba(245,158,11,0.12)',
            color: '#b45309',
            borderColor: 'rgba(245,158,11,0.25)',
          }}
        >
          You're offline — scans will be saved on this phone and synced later
        </div>
      )}

      {/* Main content — 16px gutters on phones, 24px from 600px, centred 560px column */}
      <main className="flex-1 overflow-y-auto">
        <div className="w-full max-w-[560px] mx-auto px-4 min-[600px]:px-6 pt-5 pb-28">
          <Outlet />
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ScanLine,
  LayoutDashboard,
  Search,
  FileText,
  Settings,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Scan', icon: ScanLine, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: false },
  { to: '/search', label: 'Search', icon: Search, end: false },
  { to: '/reports', label: 'Reports', icon: FileText, end: false },
];

const adminNavItem = { to: '/admin', label: 'Admin', icon: Settings, end: false };

export function BottomNav() {
  const { isAdmin } = useAuth();
  const items = isAdmin ? [...navItems, adminNavItem] : navItems;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-xl safe-bottom"
      style={{
        backgroundColor: 'var(--nav-bg)',
        borderColor: 'var(--nav-border)',
      }}
    >
      <div className="w-full max-w-[560px] mx-auto flex h-16">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0"
          >
            {({ isActive }) => (
              <>
                <span
                  className="flex items-center justify-center w-12 h-7 rounded-full transition-colors"
                  style={{
                    backgroundColor: isActive ? 'rgba(31,122,63,0.12)' : 'transparent',
                  }}
                >
                  <item.icon
                    size={24}
                    strokeWidth={isActive ? 2.4 : 2}
                    style={{ color: isActive ? '#1f7a3f' : 'var(--text-tertiary)' }}
                  />
                </span>
                <span
                  className="text-[11px] font-semibold leading-none"
                  style={{ color: isActive ? '#1f7a3f' : 'var(--text-tertiary)' }}
                >
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Eye, EyeOff } from 'lucide-react';
import logo from '../assets/logo.png';

const DEMO_ACCOUNTS = [
  { label: 'Admin', userId: 'U001', pin: '1234', desc: 'Full access' },
  { label: 'Staff', userId: 'U002', pin: '1234', desc: 'Scan & view' },
];

const LAST_USER_ID_KEY = 'rha_last_user_id';

export function LoginPage() {
  const { login } = useAuth();
  const [userId, setUserId] = useState(() => localStorage.getItem(LAST_USER_ID_KEY) ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  const isDemoMode = !import.meta.env.VITE_API_URL;

  useEffect(() => {
    if (userId) pinRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !pin.trim()) {
      setFieldError('Enter your User ID and PIN');
      return;
    }
    setIsLoading(true);
    setError('');
    setFieldError('');
    const result = await login(userId, pin);
    setIsLoading(false);
    if (!result.success) {
      const msg = result.error || 'Login failed';
      if (/disabled/i.test(msg)) {
        setError('This account is disabled. Ask your admin.');
      } else {
        setFieldError('User ID or PIN is wrong');
        setPin('');
        pinRef.current?.focus();
      }
    } else {
      localStorage.setItem(LAST_USER_ID_KEY, userId.trim().toUpperCase());
    }
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-tertiary)',
    borderColor: 'transparent',
    color: 'var(--text-primary)',
  };

  const fillDemo = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setUserId(account.userId);
    setPin(account.pin);
    setError('');
    setFieldError('');
  };

  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center px-4 py-10"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-12">
          <img
            src={logo}
            alt="Robin Hood Army"
            className="h-16 w-auto object-contain mb-12"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <h1 className="text-2xl font-extrabold tracking-tight text-center" style={{ color: 'var(--text-primary)' }}>
            Robin Hood Army
          </h1>
          <p className="text-sm mt-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
            Attendance System
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl p-6 flex flex-col gap-4 border"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-primary)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div>
            <label htmlFor="userId" className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              User ID
            </label>
            <input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setFieldError(''); }}
              autoComplete="username"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="U001"
              className="w-full px-4 py-3 rounded-xl border text-base font-medium outline-none focus:ring-2 focus:ring-rha-green-500/40 transition"
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="pin" className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              PIN
            </label>
            <div className="relative">
              <input
                id="pin"
                ref={pinRef}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setFieldError(''); }}
                autoComplete="current-password"
                placeholder="••••"
                className="w-full px-4 py-3 pr-12 rounded-xl border text-base font-medium outline-none focus:ring-2 focus:ring-rha-green-500/40 transition"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setShowPin(s => !s)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg"
                aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                style={{ color: 'var(--text-tertiary)' }}
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldError && (
              <p className="text-sm font-medium mt-1.5" style={{ color: '#dc2626' }}>
                {fieldError}
              </p>
            )}
          </div>

          {error && (
            <div
              className="text-sm font-medium px-3.5 py-2.5 rounded-xl"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#dc2626' }}
            >
              {error}
            </div>
          )}

          <Button type="submit" size="lg" isLoading={isLoading} disabled={!userId.trim() || !pin.trim()} className="w-full mt-1">
            Sign in
          </Button>

          {isDemoMode && (
            <div className="pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-center mb-2" style={{ color: 'var(--text-tertiary)' }}>
                Demo mode — tap to fill
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map(account => (
                  <button
                    key={account.userId}
                    type="button"
                    onClick={() => fillDemo(account)}
                    className="rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.97] hover:border-rha-green-400"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}
                  >
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {account.label}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {account.userId} · PIN {account.pin} · {account.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>

        <p className="text-center text-xs mt-6 font-medium" style={{ color: 'var(--text-secondary)' }}>
          Contact your admin for login credentials
        </p>
      </div>
    </div>
  );
}

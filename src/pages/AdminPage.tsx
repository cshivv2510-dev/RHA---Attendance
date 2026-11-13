import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Student, User, UserRole, StudentInput } from '../types';
import {
  fetchStudents,
  importStudents as apiImportStudents,
  fetchUsers,
  addUser as apiAddUser,
  updateUser as apiUpdateUser,
} from '../services/api';
import { getCachedStudents, cacheStudents } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Avatar } from '../components/ui/Avatar';
import { StatusPill } from '../components/ui/StatusPill';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { QRCodeModal } from '../components/ui/QRCodeModal';
import { SkeletonList } from '../components/ui/Spinner';
import { showToast } from '../components/ui/Toast';
import { saveStudent, setStudentStatus, nextStudentId, studentIdExists } from '../services/students';
import { parseCsv, csvToStudents, type CsvRowError } from '../utils/csv';
import { printQrCardsPdf } from '../utils/qrPrint';
import {
  Search, Plus, MoreVertical, QrCode, Pencil, Ban, CheckCircle2,
  Upload, Printer, Download, Copy, Share2, UserPlus, KeyRound, ShieldCheck, Eye, EyeOff,
} from 'lucide-react';

const API_CONFIGURED = !!import.meta.env.VITE_API_URL;

type Tab = 'students' | 'users';
type StudentSheet = 'none' | 'form' | 'qr' | 'rowmenu' | 'import' | 'print';
type UserSheet = 'none' | 'add' | 'rowmenu' | 'resetpin' | 'changerole' | 'credentials';

export function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('students');

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <PageHeader title="Admin" />

      <SegmentedControl
        options={[
          { value: 'students', label: 'Students' },
          { value: 'users', label: 'Users & roles' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'students' ? <StudentsTab /> : <UsersTab currentUser={user} />}
    </div>
  );
}

// ─── Shared field styling ──────────────────────────────────────────

const inputClass =
  'w-full px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-rha-green-500/40 transition';

function useInputStyle(): React.CSSProperties {
  return { backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Students Tab ──────────────────────────────────────────────────

function StudentsTab() {
  const inputStyle = useInputStyle();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Inactive'>('all');
  const [classFilter, setClassFilter] = useState('all');
  const [sheet, setSheet] = useState<StudentSheet>('none');
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState({ name: '', class: '', studentId: '' });
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [menuStudent, setMenuStudent] = useState<Student | null>(null);
  const [qrStudent, setQrStudent] = useState<Student | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Student | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Import state
  const [importData, setImportData] = useState<{
    parsed: StudentInput[];
    rowErrors: CsvRowError[];
    newCount: number;
    updateCount: number;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Print state
  const [printClass, setPrintClass] = useState('all');
  const [printing, setPrinting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (API_CONFIGURED && navigator.onLine) {
        const result = await fetchStudents();
        if (result.success && result.data) {
          await cacheStudents(result.data);
          setStudents(result.data);
          return;
        }
      }
      setStudents(await getCachedStudents());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const classes = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => { if (s.class) set.add(s.class); });
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }, [students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = students.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (classFilter !== 'all' && s.class !== classFilter) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
    });
    // Active first, disabled after; then A–Z
    list = list.slice().sort((a, b) => {
      if (a.status !== b.status) return a.status === 'Active' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [students, search, statusFilter, classFilter]);

  // ── Add / Edit ─────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', class: '', studentId: nextStudentId(students) });
    setFormError('');
    setSheet('form');
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({ name: s.name, class: s.class || '', studentId: s.id });
    setFormError('');
    setMenuStudent(null);
    setSheet('form');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!editing) {
      const id = form.studentId.trim().toUpperCase();
      if (!/^RHA\d+$/i.test(id)) {
        setFormError('Student ID must look like RHA001');
        return;
      }
      if (studentIdExists(students, id)) {
        setFormError(`Student ID ${id} is already in use`);
        return;
      }
    }
    setIsSaving(true);
    const res = await saveStudent({
      id: editing?.id,
      studentId: form.studentId,
      name: form.name,
      class: form.class,
      existing: editing ?? undefined,
    });
    setIsSaving(false);
    if (!res.success) {
      setFormError(res.error || 'Save failed');
      return;
    }
    showToast('success', editing ? 'Student updated' : `Student added as ${res.student?.id ?? form.studentId}`);
    setSheet('none');
    refresh();
    if (!editing && res.student) setQrStudent(res.student);
  };

  // ── Enable / Disable ───────────────────────────────────────────
  const requestToggle = (s: Student) => {
    setMenuStudent(null);
    setConfirmTarget(s);
  };

  const handleToggle = async () => {
    if (!confirmTarget) return;
    setIsToggling(true);
    const s = confirmTarget;
    const newStatus = s.status === 'Active' ? 'Inactive' : 'Active';
    const res = await setStudentStatus(s, newStatus);
    setIsToggling(false);
    setConfirmTarget(null);
    if (!res.success) {
      showToast('error', res.error || 'Update failed');
      return;
    }
    showToast('success', `${s.name} is now ${newStatus === 'Active' ? 'enabled' : 'disabled'}`);
    refresh();
  };

  // ── Import CSV ─────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    const { students: parsed, rowErrors, error } = csvToStudents(rows);
    if (error) {
      showToast('error', error);
      return;
    }
    const existingNames = new Set(students.map(s => s.name.trim().toLowerCase()));
    let newCount = 0;
    let updateCount = 0;
    for (const p of parsed) {
      if (existingNames.has(p.name.trim().toLowerCase())) updateCount++;
      else newCount++;
    }
    setImportData({ parsed, rowErrors, newCount, updateCount });
    setSheet('import');
  };

  const downloadTemplate = () => {
    const csv = 'name,age,class,guardian,contact,emergencyContact\nAarav Sharma,8,3,Priya Sharma,9876543210,9876543211\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rha-students-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmImport = async () => {
    if (!importData || importData.parsed.length === 0) return;
    setIsImporting(true);
    try {
      if (API_CONFIGURED) {
        const result = await apiImportStudents(importData.parsed);
        if (!result.success) {
          showToast('error', result.error || 'Import failed');
          return;
        }
        const d = result.data;
        showToast(
          d && d.errors.length > 0 ? 'warning' : 'success',
          `Imported ${d?.added ?? 0} student(s)` +
            (d && d.errors.length > 0 ? ` — ${d.errors.length} row(s) skipped` : '')
        );
        if (d?.errors.length) console.warn('Import row errors:', d.errors);
      } else {
        // Demo mode — upsert by name into IndexedDB
        const all = await getCachedStudents();
        const additions: Student[] = [];
        const updatedAll = all.slice();
        for (const p of importData.parsed) {
          const idx = updatedAll.findIndex(s => s.name.trim().toLowerCase() === p.name.trim().toLowerCase());
          if (idx >= 0) {
            updatedAll[idx] = {
              ...updatedAll[idx],
              age: Number(p.age) || updatedAll[idx].age,
              class: p.class || updatedAll[idx].class,
              guardian: p.guardian || updatedAll[idx].guardian,
              contact: p.contact || updatedAll[idx].contact,
              emergencyContact: p.emergencyContact || updatedAll[idx].emergencyContact,
            };
          } else {
            additions.push({
              id: nextStudentId([...updatedAll, ...additions]),
              name: p.name.trim(),
              age: Number(p.age) || 0,
              class: p.class || '',
              guardian: p.guardian || '',
              contact: p.contact || '',
              emergencyContact: p.emergencyContact || '',
              status: 'Active',
            });
          }
        }
        await cacheStudents([...updatedAll, ...additions]);
        showToast('success', `Imported ${additions.length} new, updated ${importData.updateCount} (demo)`);
      }
      setImportData(null);
      await refresh();
    } finally {
      setIsImporting(false);
    }
  };

  // ── Print QR cards ─────────────────────────────────────────────
  const printTargets = useMemo(() => {
    return students.filter(s =>
      s.status === 'Active' && (printClass === 'all' || s.class === printClass)
    );
  }, [students, printClass]);

  const handlePrint = async () => {
    if (printTargets.length === 0) {
      showToast('error', 'No active students to print');
      return;
    }
    setPrinting(true);
    try {
      await printQrCardsPdf(printTargets);
      showToast('success', `Printed ${printTargets.length} ID card(s)`);
      setSheet('none');
    } catch {
      showToast('error', 'Could not generate PDF');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or ID…"
          className={`${inputClass} pl-11`}
          style={inputStyle}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto flex-1 -mx-1 px-1">
          {(['all', 'Active', 'Inactive'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="px-3.5 min-h-[36px] rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0"
              style={
                statusFilter === f
                  ? { backgroundColor: '#1f7a3f', color: '#fff' }
                  : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }
              }
            >
              {f === 'all' ? 'All' : f === 'Active' ? 'Active' : 'Disabled'}
            </button>
          ))}
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="px-3.5 min-h-[36px] rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 outline-none"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: 'none' }}
          >
            {classes.map(c => (
              <option key={c} value={c}>{c === 'all' ? 'All classes' : `Class ${c}`}</option>
            ))}
          </select>
        </div>

        {/* Overflow menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setSheet(sheet === 'rowmenu' && !menuStudent ? 'none' : 'rowmenu')}
            className="w-11 h-11 rounded-xl border flex items-center justify-center"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            aria-label="More actions"
          >
            <MoreVertical size={18} />
          </button>
          {sheet === 'rowmenu' && !menuStudent && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSheet('none')} />
              <div
                className="absolute right-0 top-12 w-56 rounded-2xl border shadow-xl overflow-hidden z-50 animate-scale-in"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
              >
                <button
                  onClick={() => { setSheet('import'); fileRef.current?.click(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-left hover:bg-[var(--bg-tertiary)]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Upload size={17} style={{ color: 'var(--text-secondary)' }} /> Import CSV
                </button>
                <button
                  onClick={() => { setPrintClass('all'); setSheet('print'); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-left hover:bg-[var(--bg-tertiary)]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Printer size={17} style={{ color: 'var(--text-secondary)' }} /> Print QR cards
                </button>
              </div>
            </>
          )}
        </div>

        <Button size="sm" onClick={openAdd} className="flex-shrink-0">
          <Plus size={16} /> Add
        </Button>
      </div>

      {!API_CONFIGURED && (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Demo mode — student changes are stored on this device only.
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      {/* Student list */}
      {loading ? (
        <SkeletonList rows={6} />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
              {search || statusFilter !== 'all' || classFilter !== 'all'
                ? 'No students match your filters'
                : 'No students yet — tap Add to create one'}
            </p>
          )}
          {filtered.map(s => {
            const disabled = s.status !== 'Active';
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 p-3 rounded-2xl border min-h-[64px]"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-primary)',
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                <Avatar name={s.name} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {s.name}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {s.id}{s.class ? ` · Class ${s.class}` : ''}
                  </p>
                </div>
                {disabled && <StatusPill status="disabled" />}
                <button
                  onClick={() => { setMenuStudent(s); setSheet('rowmenu'); }}
                  className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] flex-shrink-0"
                  aria-label={`Actions for ${s.name}`}
                >
                  <MoreVertical size={18} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Sheets ─────────────────────────────────────────────── */}

      {/* Add / Edit student */}
      <BottomSheet
        open={sheet === 'form'}
        onClose={() => setSheet('none')}
        title={editing ? `Edit ${editing.id}` : 'Add student'}
      >
        <div className="flex flex-col gap-4">
          <Field label="Name *">
            <input className={inputClass} style={inputStyle} value={form.name}
              onChange={e => { setForm({ ...form, name: e.target.value }); setFormError(''); }}
              placeholder="Full name" autoFocus />
          </Field>
          <Field label="Class">
            <input className={inputClass} style={inputStyle} value={form.class}
              onChange={e => setForm({ ...form, class: e.target.value })}
              placeholder="e.g. 3" />
          </Field>
          <Field label="Student ID">
            <input className={inputClass} style={inputStyle} value={form.studentId}
              onChange={e => { setForm({ ...form, studentId: e.target.value.toUpperCase() }); setFormError(''); }}
              placeholder="RHA001" disabled={!!editing} />
          </Field>
          {formError && <p className="text-sm font-medium" style={{ color: '#dc2626' }}>{formError}</p>}
          <Button onClick={handleSave} isLoading={isSaving}>
            {editing ? 'Save changes' : 'Add student'}
          </Button>
        </div>
      </BottomSheet>

      {/* Row actions */}
      <BottomSheet
        open={sheet === 'rowmenu' && !!menuStudent}
        onClose={() => { setSheet('none'); setMenuStudent(null); }}
        title={menuStudent?.name}
      >
        {menuStudent && (
          <div className="flex flex-col">
            {[
              { label: 'Show QR', icon: QrCode, action: () => { setQrStudent(menuStudent); setSheet('none'); setMenuStudent(null); } },
              { label: 'Edit', icon: Pencil, action: () => openEdit(menuStudent) },
            ].map(item => (
              <button
                key={item.label}
                onClick={item.action}
                className="flex items-center gap-3 px-2 py-3.5 text-base font-medium text-left min-h-[48px]"
                style={{ color: 'var(--text-primary)' }}
              >
                <item.icon size={18} style={{ color: 'var(--text-secondary)' }} />
                {item.label}
              </button>
            ))}
            <button
              onClick={() => requestToggle(menuStudent)}
              className="flex items-center gap-3 px-2 py-3.5 text-base font-medium text-left min-h-[48px]"
              style={{ color: menuStudent.status === 'Active' ? '#dc2626' : '#1f7a3f' }}
            >
              <Ban size={18} />
              {menuStudent.status === 'Active' ? 'Disable' : 'Enable'}
            </button>
          </div>
        )}
      </BottomSheet>

      {/* Import CSV */}
      <BottomSheet open={sheet === 'import'} onClose={() => { setSheet('none'); setImportData(null); }} title="Import students">
        <div className="flex flex-col gap-4">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 text-sm font-semibold min-h-[44px]"
            style={{ color: '#1f7a3f' }}
          >
            <Download size={16} /> Download CSV template
          </button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={18} /> Choose CSV file
          </Button>

          {importData && (
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
              <p className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                {importData.newCount} new · {importData.updateCount} updated · {importData.rowErrors.length} error{importData.rowErrors.length === 1 ? '' : 's'}
              </p>
              {importData.rowErrors.length > 0 && (
                <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                  {importData.rowErrors.slice(0, 10).map((e, i) => (
                    <p key={i} className="text-xs" style={{ color: '#dc2626' }}>
                      Row {e.row}: {e.reason}
                    </p>
                  ))}
                  {importData.rowErrors.length > 10 && (
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>…and {importData.rowErrors.length - 10} more</p>
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <Button onClick={confirmImport} isLoading={isImporting} className="flex-1">
                  Confirm import
                </Button>
                <Button variant="ghost" onClick={() => setImportData(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Print QR cards */}
      <BottomSheet open={sheet === 'print'} onClose={() => setSheet('none')} title="Print QR cards">
        <div className="flex flex-col gap-4">
          <Field label="Class">
            <select value={printClass} onChange={e => setPrintClass(e.target.value)} className={inputClass} style={inputStyle}>
              {classes.map(c => (
                <option key={c} value={c}>{c === 'all' ? 'All classes' : `Class ${c}`}</option>
              ))}
            </select>
          </Field>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {printTargets.length} active student{printTargets.length === 1 ? '' : 's'} · 8 cards per A4 page
          </p>
          <Button onClick={handlePrint} isLoading={printing} disabled={printTargets.length === 0}>
            <Printer size={18} /> Download PDF
          </Button>
        </div>
      </BottomSheet>

      <QRCodeModal student={qrStudent} onClose={() => setQrStudent(null)} />

      <ConfirmDialog
        open={!!confirmTarget}
        title={confirmTarget?.status === 'Active' ? 'Disable student?' : 'Enable student?'}
        message={
          confirmTarget?.status === 'Active'
            ? `Disable ${confirmTarget.name} (${confirmTarget.id})? They won't be counted in attendance.`
            : `Enable ${confirmTarget?.name} (${confirmTarget?.id})? They'll be counted in attendance again.`
        }
        confirmLabel={confirmTarget?.status === 'Active' ? 'Disable' : 'Enable'}
        onConfirm={handleToggle}
        onCancel={() => setConfirmTarget(null)}
        loading={isToggling}
      />
    </div>
  );
}

// ─── Users Tab ─────────────────────────────────────────────────────

function UsersTab({ currentUser }: { currentUser: User | null }) {
  const inputStyle = useInputStyle();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<UserSheet>('none');
  const [menuUser, setMenuUser] = useState<User | null>(null);

  // Add-user form
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('staff');
  const [newPin, setNewPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Credentials shown once after creation
  const [createdCreds, setCreatedCreds] = useState<{ userId: string; name: string; pin: string } | null>(null);

  // Reset PIN
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPin, setResetPin] = useState('');
  const [showResetPin, setShowResetPin] = useState(false);

  // Change role
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [roleChoice, setRoleChoice] = useState<UserRole>('staff');

  // Disable/enable
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (API_CONFIGURED && navigator.onLine) {
        const result = await fetchUsers();
        if (result.success && result.data) {
          setUsers(result.data);
          return;
        }
      }
      // Demo fallback
      setUsers([
        { id: 'U001', name: 'Admin', role: 'admin', status: 'Active' },
        { id: 'U002', name: 'Staff', role: 'staff', status: 'Active' },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const activeAdmins = users.filter(u => u.role === 'admin' && (u.status ?? 'Active') === 'Active');

  /** Returns a reason string if this user is protected from disable/demote, else null */
  const protectionReason = (u: User): string | null => {
    if (currentUser && u.id === currentUser.id) return 'You cannot disable or demote your own account';
    if (u.role === 'admin' && (u.status ?? 'Active') === 'Active' && activeAdmins.length <= 1) {
      return 'The last active admin cannot be disabled or demoted';
    }
    return null;
  };

  const openAdd = () => {
    setNewName('');
    setNewRole('staff');
    setNewPin('');
    setShowPin(false);
    setSheet('add');
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      showToast('error', 'Name is required');
      return;
    }
    if (!/^\d{4,8}$/.test(newPin)) {
      showToast('error', 'PIN must be 4-8 digits');
      return;
    }
    setIsSaving(true);
    try {
      if (!API_CONFIGURED) {
        showToast('warning', 'Demo mode — user management requires the server API');
        return;
      }
      const result = await apiAddUser({ name: newName.trim(), role: newRole, pin: newPin });
      if (!result.success) {
        showToast('error', result.error || 'Failed to add user');
        return;
      }
      const userId = result.data?.id ?? '';
      setCreatedCreds({ userId, name: newName.trim(), pin: newPin });
      setSheet('credentials');
      setNewName('');
      setNewPin('');
      await refresh();
    } finally {
      setIsSaving(false);
    }
  };

  const copyCreds = async () => {
    if (!createdCreds) return;
    const text = `Robin Hood Army login\nUser ID: ${createdCreds.userId}\nPIN: ${createdCreds.pin}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', 'Copied to clipboard');
    } catch {
      showToast('error', 'Could not copy');
    }
  };

  const shareCreds = async () => {
    if (!createdCreds) return;
    try {
      await navigator.share({
        title: 'Robin Hood Army login',
        text: `User ID: ${createdCreds.userId}\nPIN: ${createdCreds.pin}`,
      });
    } catch { /* cancelled */ }
  };

  const openResetPin = (u: User) => {
    setResetTarget(u);
    setResetPin('');
    setShowResetPin(false);
    setMenuUser(null);
    setSheet('resetpin');
  };

  const handleResetPin = async () => {
    if (!resetTarget) return;
    if (!/^\d{4,8}$/.test(resetPin)) {
      showToast('error', 'PIN must be 4-8 digits');
      return;
    }
    setIsUpdating(true);
    const result = await apiUpdateUser({ id: resetTarget.id, pin: resetPin });
    setIsUpdating(false);
    if (!result.success) {
      showToast('error', result.error || 'PIN reset failed');
      return;
    }
    showToast('success', `PIN updated for ${resetTarget.name}`);
    setSheet('none');
    setResetTarget(null);
  };

  const openChangeRole = (u: User) => {
    setRoleTarget(u);
    setRoleChoice(u.role);
    setMenuUser(null);
    setSheet('changerole');
  };

  const handleChangeRole = async () => {
    if (!roleTarget) return;
    setIsUpdating(true);
    const result = await apiUpdateUser({ id: roleTarget.id, role: roleChoice });
    setIsUpdating(false);
    if (!result.success) {
      showToast('error', result.error || 'Role update failed');
      return;
    }
    showToast('success', `${roleTarget.name} is now ${roleChoice}`);
    setSheet('none');
    setRoleTarget(null);
    await refresh();
  };

  const requestToggleStatus = (u: User) => {
    setMenuUser(null);
    setStatusTarget(u);
  };

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    setIsUpdating(true);
    const newStatus = statusTarget.status === 'Active' ? 'Inactive' : 'Active';
    const result = await apiUpdateUser({ id: statusTarget.id, status: newStatus });
    setIsUpdating(false);
    setStatusTarget(null);
    if (!result.success) {
      showToast('error', result.error || 'Update failed');
      return;
    }
    showToast('success', `${statusTarget.name} is now ${newStatus === 'Active' ? 'enabled' : 'disabled'}`);
    await refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {users.length} user{users.length === 1 ? '' : 's'}
        </p>
        <Button size="sm" onClick={openAdd}>
          <UserPlus size={16} /> Add user
        </Button>
      </div>

      {!API_CONFIGURED && (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Demo mode — changes to users require the server API.
        </p>
      )}

      {loading ? (
        <SkeletonList rows={3} />
      ) : (
        <div className="flex flex-col gap-2">
          {users.map(u => {
            const disabled = (u.status ?? 'Active') !== 'Active';
            const isYou = currentUser?.id === u.id;
            return (
              <div
                key={u.id}
                className="flex items-center gap-3 p-3 rounded-2xl border min-h-[64px]"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-primary)',
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                <Avatar name={u.name} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {u.name}{isYou ? ' (you)' : ''}
                  </p>
                  <p className="text-sm capitalize" style={{ color: 'var(--text-secondary)' }}>
                    {u.id} · {u.role === 'admin' ? 'Admin' : 'Staff'}
                  </p>
                </div>
                {disabled && <StatusPill status="disabled" />}
                <button
                  onClick={() => { setMenuUser(u); setSheet('rowmenu'); }}
                  className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] flex-shrink-0"
                  aria-label={`Actions for ${u.name}`}
                >
                  <MoreVertical size={18} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add user sheet */}
      <BottomSheet open={sheet === 'add'} onClose={() => setSheet('none')} title="Add user">
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <input className={inputClass} style={inputStyle} value={newName}
              onChange={e => setNewName(e.target.value)} placeholder="e.g. Jane Teacher" autoFocus />
          </Field>

          <Field label="Role">
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'staff' as UserRole, title: 'Staff', desc: 'Scan, dashboard, search, reports', icon: CheckCircle2 },
                { value: 'admin' as UserRole, title: 'Admin', desc: 'Everything, incl. students & users', icon: ShieldCheck },
              ]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setNewRole(opt.value)}
                  className="rounded-2xl border p-3.5 text-left transition-all min-h-[44px]"
                  style={
                    newRole === opt.value
                      ? { borderColor: '#1f7a3f', backgroundColor: 'rgba(31,122,63,0.08)' }
                      : { borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }
                  }
                >
                  <opt.icon size={20} className="mb-1.5" style={{ color: newRole === opt.value ? '#1f7a3f' : 'var(--text-tertiary)' }} />
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{opt.title}</p>
                  <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>{opt.desc}</p>
                </button>
              ))}
            </div>
          </Field>

          <Field label="PIN (4-8 digits)">
            <div className="relative">
              <input
                className={`${inputClass} pr-12`}
                style={inputStyle}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="••••"
              />
              <button
                type="button"
                onClick={() => setShowPin(s => !s)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center"
                aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                style={{ color: 'var(--text-tertiary)' }}
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>

          <Button onClick={handleAdd} isLoading={isSaving}>Create user</Button>
        </div>
      </BottomSheet>

      {/* Credentials sheet — shown once */}
      <BottomSheet open={sheet === 'credentials'} onClose={() => setSheet('none')} title="Login created">
        {createdCreds && (
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Share these with {createdCreds.name}. They won't be shown again.
            </p>
            <Card className="p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>User ID</p>
              <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{createdCreds.userId}</p>
              <p className="text-xs font-semibold uppercase tracking-wider mt-3 mb-1" style={{ color: 'var(--text-tertiary)' }}>PIN</p>
              <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{createdCreds.pin}</p>
            </Card>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" icon={<Copy size={18} />} onClick={copyCreds}>Copy</Button>
              <Button className="flex-1" icon={<Share2 size={18} />} onClick={shareCreds}>Share</Button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* User row actions */}
      <BottomSheet open={sheet === 'rowmenu' && !!menuUser} onClose={() => { setSheet('none'); setMenuUser(null); }} title={menuUser?.name}>
        {menuUser && (() => {
          const reason = protectionReason(menuUser);
          const isProtected = reason !== null;
          return (
            <div className="flex flex-col">
              <button
                onClick={() => openResetPin(menuUser)}
                className="flex items-center gap-3 px-2 py-3.5 text-base font-medium text-left min-h-[48px]"
                style={{ color: 'var(--text-primary)' }}
              >
                <KeyRound size={18} style={{ color: 'var(--text-secondary)' }} /> Reset PIN
              </button>
              <button
                onClick={() => openChangeRole(menuUser)}
                disabled={isProtected && menuUser.role === 'admin'}
                className="flex items-center gap-3 px-2 py-3.5 text-base font-medium text-left min-h-[48px] disabled:opacity-40"
                style={{ color: 'var(--text-primary)' }}
              >
                <ShieldCheck size={18} style={{ color: 'var(--text-secondary)' }} /> Change role
              </button>
              <button
                onClick={() => requestToggleStatus(menuUser)}
                disabled={isProtected}
                className="flex items-center gap-3 px-2 py-3.5 text-base font-medium text-left min-h-[48px] disabled:opacity-40"
                style={{ color: (menuUser.status ?? 'Active') === 'Active' ? '#dc2626' : '#1f7a3f' }}
              >
                <Ban size={18} />
                {(menuUser.status ?? 'Active') === 'Active' ? 'Disable' : 'Enable'}
              </button>
              {isProtected && (
                <p className="text-xs px-2 pb-2" style={{ color: 'var(--text-tertiary)' }}>{reason}</p>
              )}
            </div>
          );
        })()}
      </BottomSheet>

      {/* Reset PIN sheet */}
      <BottomSheet open={sheet === 'resetpin'} onClose={() => setSheet('none')} title={`Reset PIN — ${resetTarget?.name ?? ''}`}>
        <div className="flex flex-col gap-4">
          <Field label="New PIN (4-8 digits)">
            <div className="relative">
              <input
                className={`${inputClass} pr-12`}
                style={inputStyle}
                type={showResetPin ? 'text' : 'password'}
                inputMode="numeric"
                value={resetPin}
                onChange={e => setResetPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="••••"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowResetPin(s => !s)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center"
                aria-label={showResetPin ? 'Hide PIN' : 'Show PIN'}
                style={{ color: 'var(--text-tertiary)' }}
              >
                {showResetPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <Button onClick={handleResetPin} isLoading={isUpdating} disabled={!resetPin}>Update PIN</Button>
        </div>
      </BottomSheet>

      {/* Change role sheet */}
      <BottomSheet open={sheet === 'changerole'} onClose={() => setSheet('none')} title={`Change role — ${roleTarget?.name ?? ''}`}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'staff' as UserRole, title: 'Staff', desc: 'Scan, dashboard, search, reports' },
              { value: 'admin' as UserRole, title: 'Admin', desc: 'Everything, incl. students & users' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setRoleChoice(opt.value)}
                className="rounded-2xl border p-3.5 text-left transition-all"
                style={
                  roleChoice === opt.value
                    ? { borderColor: '#1f7a3f', backgroundColor: 'rgba(31,122,63,0.08)' }
                    : { borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }
                }
              >
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{opt.title}</p>
                <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>{opt.desc}</p>
              </button>
            ))}
          </div>
          {roleTarget && protectionReason(roleTarget) && roleChoice !== roleTarget.role && (
            <p className="text-xs" style={{ color: '#dc2626' }}>{protectionReason(roleTarget)}</p>
          )}
          <Button
            onClick={handleChangeRole}
            isLoading={isUpdating}
            disabled={!!roleTarget && protectionReason(roleTarget) !== null && roleChoice !== roleTarget.role}
          >
            Save role
          </Button>
        </div>
      </BottomSheet>

      {/* Disable/enable user */}
      <ConfirmDialog
        open={!!statusTarget}
        title={statusTarget?.status === 'Active' ? 'Disable user?' : 'Enable user?'}
        message={
          statusTarget?.status === 'Active'
            ? `Disable ${statusTarget.name} (${statusTarget.id})? They won't be able to sign in.`
            : `Enable ${statusTarget?.name} (${statusTarget?.id})? They'll be able to sign in again.`
        }
        confirmLabel={statusTarget?.status === 'Active' ? 'Disable' : 'Enable'}
        onConfirm={handleToggleStatus}
        onCancel={() => setStatusTarget(null)}
        loading={isUpdating}
      />
    </div>
  );
}

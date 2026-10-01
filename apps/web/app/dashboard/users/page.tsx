'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users as UsersIcon,
  UserX,
  X,
} from 'lucide-react';
import { listUsers, createUser, updateUser, deactivateUser, permanentDeleteUser, type SessionUser, type Role } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { useAuth } from '@/components/auth-provider';
import { t, formatWesternNumber, isRtl } from '@/lib/i18n';

export default function UsersPage() {
  const { isAuthenticated, session } = useAuth();
  const rtl = isRtl();
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    role: Role;
    password: string;
    active: boolean;
    employeeId: string;
  }>({
    name: '',
    email: '',
    phone: '',
    role: 'ADMIN',
    password: '',
    active: true,
    employeeId: '',
  });

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTargetUser, setEditTargetUser] = useState<SessionUser | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editFormData, setEditFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    role: Role;
    password: string;
    active: boolean;
    employeeId: string;
  }>({
    name: '',
    email: '',
    phone: '',
    role: 'ADMIN',
    password: '',
    active: true,
    employeeId: '',
  });

  const openEditModal = (user: SessionUser) => {
    setEditTargetUser(user);
    setEditFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      password: '',
      active: user.active,
      employeeId: user.employeeId || '',
    });
    setEditError(null);
    setShowEditPassword(false);
    setEditModalOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetUser) return;
    setEditLoading(true);
    setEditError(null);
    try {
      await updateUser(editTargetUser.id, {
        name: editFormData.name.trim(),
        email: editFormData.email.trim(),
        phone: editFormData.phone.trim() || undefined,
        role: editFormData.role,
        password: editFormData.password.trim() ? editFormData.password.trim() : undefined,
        active: editFormData.active,
        employeeId: editFormData.role === 'DRIVER' ? editFormData.employeeId.trim() : undefined,
      });
      setEditModalOpen(false);
      setEditTargetUser(null);
      await loadData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setEditLoading(false);
    }
  };

  // Permanent Delete Modal State
  const [deleteTargetUser, setDeleteTargetUser] = useState<SessionUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleConfirmPermanentDelete = async () => {
    if (!deleteTargetUser) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await permanentDeleteUser(deleteTargetUser.id);
      setDeleteTargetUser(null);
      await loadData();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to permanently delete user');
    } finally {
      setDeleteLoading(false);
    }
  };

  async function loadData(isMounted = true) {
    setLoading(true);
    try {
      const res = await listUsers({ page: 1, limit: 100 });
      if (isMounted) {
        setUsers(res.items);
        setError(null);
      }
    } catch (err) {
      if (isMounted) {
        setError(err instanceof Error ? err.message : 'Failed to load users');
      }
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;
    loadData(isMounted);
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      await createUser({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
        role: formData.role,
        password: formData.password,
        active: formData.active,
        employeeId: formData.role === 'DRIVER' ? formData.employeeId.trim() : undefined,
      });
      setModalOpen(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        role: 'ADMIN',
        password: '',
        active: true,
        employeeId: '',
      });
      await loadData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleToggleActive = async (user: SessionUser) => {
    try {
      await updateUser(user.id, { active: !user.active });
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesText =
        !query.trim() ||
        `${user.name} ${user.email} ${user.phone ?? ''}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());

      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;

      return matchesText && matchesRole;
    });
  }, [users, query, roleFilter]);

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700">
            <Shield className="h-3 w-3" />
            {t('users.adminRole')}
          </span>
        );
      case 'CALL_CENTER':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
            {t('users.callCenterRole')}
          </span>
        );
      case 'DRIVER':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
            {t('users.driverRole')}
          </span>
        );
    }
  };

  return (
    <div>
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        action={
          session?.user?.role === 'ADMIN' ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <UserPlus className="h-4 w-4" />
              <span>{t('users.addUser')}</span>
            </button>
          ) : undefined
        }
      />

      {/* Filter and Search Bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('users.search')}
            className="w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 py-2.5 text-xs text-slate-900 outline-none transition focus:border-emerald-500 shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          {(['ALL', 'ADMIN', 'CALL_CENTER'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                roleFilter === r
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {r === 'ALL'
                ? t('common.filter') + ': ' + (isRtl() ? 'الكل' : 'All')
                : r === 'ADMIN'
                ? t('users.adminRole')
                : t('users.callCenterRole')}
            </button>
          ))}

          <button
            type="button"
            onClick={() => loadData()}
            title={t('common.refresh')}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600 mb-2" />
          <p className="text-sm font-medium">{t('common.loading')}</p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <p className="text-sm font-semibold">{t('common.error')}</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3.5 text-start">{t('drivers.name')}</th>
                  <th className="px-5 py-3.5 text-start">{t('drivers.email')}</th>
                  <th className="px-5 py-3.5 text-start">{t('drivers.phone')}</th>
                  <th className="px-5 py-3.5 text-start">{t('users.role')}</th>
                  <th className="px-5 py-3.5 text-start">{t('drivers.status')}</th>
                  <th className="px-5 py-3.5 text-start">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      {t('users.noUsers')}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{user.name}</div>
                        {user.role === 'DRIVER' && user.employeeId && (
                          <div className="text-[11px] font-mono text-slate-500">
                            {rtl ? `الرقم الوظيفي: ${formatWesternNumber(user.employeeId)}` : `Emp ID: ${user.employeeId}`}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-600">{user.email}</td>
                      <td className="px-5 py-3.5 font-mono text-slate-600">
                        {user.phone ? formatWesternNumber(user.phone) : '—'}
                      </td>
                      <td className="px-5 py-3.5">{getRoleBadge(user.role)}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            user.active
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {user.active ? t('drivers.active') : t('drivers.inactive')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {session?.user?.role === 'ADMIN' ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(user)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
                              title={rtl ? 'تعديل الحساب' : 'Edit Account'}
                            >
                              <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                              <span>{rtl ? 'تعديل' : 'Edit'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleActive(user)}
                              disabled={user.email.toLowerCase() === 'admin@tracker.local'}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                                user.active
                                  ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                              title={
                                user.email.toLowerCase() === 'admin@tracker.local'
                                  ? rtl
                                    ? 'الحساب الرئيسي للنظام محمي من التعطيل'
                                    : 'Primary system administrator account cannot be deactivated'
                                  : undefined
                              }
                            >
                              {user.active ? (
                                <>
                                  <UserX className="h-3.5 w-3.5" />
                                  <span>{t('users.deactivate')}</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5" />
                                  <span>{t('users.activate')}</span>
                                </>
                              )}
                            </button>

                            {user.id !== session?.user?.id && user.email.toLowerCase() !== 'admin@tracker.local' && (
                              <button
                                type="button"
                                onClick={() => setDeleteTargetUser(user)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                                title={rtl ? 'حذف الحساب نهائياً' : 'Permanently Delete Account'}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>{rtl ? 'حذف نهائي' : 'Delete'}</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900">{t('users.addUser')}</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              {createError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {createError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {t('drivers.name')} *
                </label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {t('drivers.email')} *
                </label>
                <input
                  type="email"
                  dir="ltr"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 font-mono text-left"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('drivers.phone')}
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 font-mono text-left"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('users.role')} *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 bg-white"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="CALL_CENTER">CALL_CENTER</option>
                    <option value="DRIVER">DRIVER</option>
                  </select>
                </div>
              </div>

              {formData.role === 'DRIVER' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {rtl ? 'الرقم الوظيفي *' : 'Employee ID *'}
                  </label>
                  <input
                    type="text"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    placeholder="e.g. 101"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 font-mono"
                    required
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {t('drivers.password')} *
                </label>
                <div className="relative">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    dir="ltr"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 font-mono text-left pe-10"
                    placeholder="Min 8 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                    title={showCreatePassword ? 'Hide password' : 'Show password'}
                  >
                    {showCreatePassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="userActiveCheck"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="userActiveCheck" className="text-xs font-semibold text-slate-700">
                  {t('drivers.active')}
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                >
                  {createLoading ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editModalOpen && editTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {rtl ? 'تعديل بيانات الحساب' : 'Edit User Account'}
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{editTargetUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditTargetUser(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="mt-4 space-y-4">
              {editError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {editError}
                </div>
              )}

              {editTargetUser.email.toLowerCase() === 'admin@tracker.local' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 leading-relaxed">
                  <strong>{rtl ? 'حساب النظام الرئيسي:' : 'Primary System Administrator:'}</strong>{' '}
                  {rtl
                    ? 'هذا الحساب محمي. لا يمكن تعديل دوره أو إلغاء تنشيطه لحماية الوصول إلى النظام.'
                    : 'This account is protected. Role and active status cannot be modified to prevent system lockout.'}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {t('drivers.name')} *
                </label>
                <input
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {t('drivers.email')} *
                </label>
                <input
                  type="email"
                  dir="ltr"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 font-mono text-left"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('drivers.phone')}
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 font-mono text-left"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('users.role')} *
                  </label>
                  <select
                    value={editFormData.role}
                    disabled={editTargetUser.email.toLowerCase() === 'admin@tracker.local'}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as Role })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="CALL_CENTER">CALL_CENTER</option>
                    <option value="DRIVER">DRIVER</option>
                  </select>
                </div>
              </div>

              {editFormData.role === 'DRIVER' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {rtl ? 'الرقم الوظيفي *' : 'Employee ID *'}
                  </label>
                  <input
                    type="text"
                    value={editFormData.employeeId}
                    onChange={(e) => setEditFormData({ ...editFormData, employeeId: e.target.value })}
                    placeholder="e.g. 101"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 font-mono"
                    required
                  />
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                  <span>{rtl ? 'إعادة تعيين كلمة المرور (اختياري)' : 'Reset Password (Optional)'}</span>
                </div>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    dir="ltr"
                    value={editFormData.password}
                    onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white ps-3 pe-10 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 font-mono text-left"
                    placeholder={rtl ? 'اتركه فارغاً للإبقاء على الحالية (8 أحرف كحد أدنى)' : 'Leave blank to keep current (min 8 characters)'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                    title={showEditPassword ? 'Hide password' : 'Show password'}
                  >
                    {showEditPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  {rtl
                    ? 'ملاحظة: يؤدي تغيير كلمة المرور إلى إنهاء كافة الجلسات النشطة لهذا الحساب فوراً.'
                    : 'Notice: Resetting password revokes all active sessions for this user immediately.'}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editUserActiveCheck"
                  checked={editFormData.active}
                  disabled={editTargetUser.email.toLowerCase() === 'admin@tracker.local'}
                  onChange={(e) => setEditFormData({ ...editFormData, active: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                />
                <label htmlFor="editUserActiveCheck" className="text-xs font-semibold text-slate-700">
                  {t('drivers.active')}
                </label>
                {editTargetUser.email.toLowerCase() === 'admin@tracker.local' && (
                  <span className="text-[10px] text-slate-400">({rtl ? 'محمي دائماً' : 'Always Active'})</span>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditModalOpen(false);
                    setEditTargetUser(null);
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                >
                  {editLoading ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {deleteTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 text-rose-600">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {rtl ? 'تأكيد الحذف النهائي للحساب' : 'Confirm Permanent Account Deletion'}
                </h3>
                <p className="text-xs text-rose-600 font-medium">
                  {rtl ? 'إجراء نهائي غير قابل للتراجع' : 'Permanent & Irreversible Action'}
                </p>
              </div>
            </div>

            <div className="py-4 text-xs text-slate-600 space-y-3">
              <p>
                {rtl ? (
                  <>
                    أنت على وشك حذف الحساب الخاص بـ <strong className="text-slate-900">{deleteTargetUser.name}</strong> ({deleteTargetUser.email}).
                  </>
                ) : (
                  <>
                    You are about to permanently delete the account for <strong className="text-slate-900">{deleteTargetUser.name}</strong> ({deleteTargetUser.email}).
                  </>
                )}
              </p>

              <div className="rounded-xl border border-rose-300 bg-rose-50/80 p-3 text-xs font-semibold text-rose-800 leading-relaxed">
                {rtl
                  ? 'سيتم حذف الحساب وجميع بياناته نهائياً ولا يمكن التراجع عن هذا الإجراء.'
                  : 'This permanently deletes the account and all associated data. This action cannot be undone.'}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-[11px]">
                <div className="font-semibold text-slate-700">
                  {rtl ? 'تفاصيل الحذف الشامل:' : 'Deletion Breakdown:'}
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-500">
                  <li>{rtl ? 'حذف الحساب والبيانات الشخصية وكلمة المرور وجلسات الدخول نهائياً.' : 'Completely purge account credentials, sessions, and personal data.'}</li>
                  <li>{rtl ? 'تحرير البريد الإلكتروني ورقم الهاتف لإعادة الاستخدام مستقبلاً.' : 'Free email and phone number for future re-registration.'}</li>
                  <li>{rtl ? 'حذف جميع بيانات الموقع والورديات وسجلات التتبع بالكامل.' : 'Permanently delete all driver shifts, telemetry points, devices, and notifications.'}</li>
                </ul>
              </div>
              {deleteError && (
                <p className="rounded-lg bg-rose-50 p-2 text-rose-700 text-xs font-semibold">{deleteError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setDeleteTargetUser(null);
                  setDeleteError(null);
                }}
                disabled={deleteLoading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                disabled={deleteLoading}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {deleteLoading ? (
                  <span>{t('common.loading')}</span>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{rtl ? 'تأكيد الحذف النهائي' : 'Permanently Delete'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

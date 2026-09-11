'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit2,
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
import { listUsers, createUser, updateUser, deactivateUser, type SessionUser, type Role } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { t, formatWesternNumber, isRtl } from '@/lib/i18n';

export default function UsersPage() {
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    role: Role;
    password: string;
    active: boolean;
  }>({
    name: '',
    email: '',
    phone: '',
    role: 'MANAGER',
    password: '',
    active: true,
  });

  async function loadData() {
    setLoading(true);
    try {
      const res = await listUsers({ page: 1, limit: 100 });
      setUsers(res.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

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
      });
      setModalOpen(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        role: 'MANAGER',
        password: '',
        active: true,
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
      case 'MANAGER':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
            {t('users.managerRole')}
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
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            <UserPlus className="h-4 w-4" />
            <span>{t('users.addUser')}</span>
          </button>
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
          {(['ALL', 'ADMIN', 'MANAGER', 'CALL_CENTER'] as const).map((r) => (
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
                : r}
            </button>
          ))}

          <button
            type="button"
            onClick={loadData}
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
                        <button
                          type="button"
                          onClick={() => handleToggleActive(user)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                            user.active
                              ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
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
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
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
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
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
                    <option value="MANAGER">MANAGER</option>
                    <option value="CALL_CENTER">CALL_CENTER</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {t('drivers.password')} *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                  placeholder="Min 8 characters"
                  required
                />
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
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { apiClient, type SessionUser } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';

export default function UsersPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const currentUser = await apiClient.getCurrentUser();
        setUser(currentUser);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load account profile');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div>
      <PageHeader title="Users" subtitle="Current authenticated user profile" />
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Loading profile...</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-700">{error}</div> : null}
      {!loading && !error && user ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <dl className="grid gap-4 md:grid-cols-2 text-sm text-slate-600">
            <div><dt className="font-medium text-slate-900">Name</dt><dd className="mt-1">{user.name}</dd></div>
            <div><dt className="font-medium text-slate-900">Email</dt><dd className="mt-1">{user.email}</dd></div>
            <div><dt className="font-medium text-slate-900">Phone</dt><dd className="mt-1">{user.phone ?? '—'}</dd></div>
            <div><dt className="font-medium text-slate-900">Role</dt><dd className="mt-1">{user.role}</dd></div>
            <div><dt className="font-medium text-slate-900">Account status</dt><dd className="mt-1">{user.active ? 'Active' : 'Inactive'}</dd></div>
            <div><dt className="font-medium text-slate-900">User ID</dt><dd className="mt-1 break-all">{user.id}</dd></div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

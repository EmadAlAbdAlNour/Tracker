import { PageHeader } from '@/components/dashboard-shell';

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Admin environment and API configuration" />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft text-sm text-slate-600">
        <div className="space-y-3">
          <div><span className="font-medium text-slate-900">API base URL:</span> {process.env.NEXT_PUBLIC_API_URL ?? 'Not configured'}</div>
          <div><span className="font-medium text-slate-900">Authentication:</span> JWT bearer token stored in local storage for the session.</div>
          <div><span className="font-medium text-slate-900">Scope:</span> Admin dashboard is limited to routes currently exposed by the existing Tracker API.</div>
        </div>
      </div>
    </div>
  );
}

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock3,
  Coins,
  DollarSign,
  Gauge,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  AdminOverview,
  AdminUsageEvent,
  AdminUser,
  loadAdminOverview,
  loadAdminUsage,
  loadAdminUsers,
  updateAdminUser,
} from '../services/admin';
import { getAccountClient, getAccountSession, isAccountSystemConfigured } from '../services/account';

const formatNumber = (value: number) => new Intl.NumberFormat().format(Math.round(value || 0));
const formatCost = (microusd: number) => `$${(Number(microusd || 0) / 1_000_000).toFixed(4)}`;
const formatDateTime = (value: string | null) => value ? new Date(value).toLocaleString() : 'Never';
const operationLabel = (operation: string) => ({ translate: 'Translation', chat: 'Reading chat', define: 'Definition', note: 'Reader note', metadata: 'Metadata', test: 'Connection test' })[operation] || operation;

const MetricCard: React.FC<{ label: string; value: string; detail: string; icon: React.ReactNode }> = ({ label, value, detail, icon }) => (
  <div className="rounded-lg border border-stone-200 bg-[#fffdf8] p-4 shadow-sm">
    <div className="flex items-center justify-between text-stone-500"><span className="text-xs font-semibold uppercase tracking-wider">{label}</span>{icon}</div>
    <p className="mt-3 text-2xl font-semibold text-stone-950">{value}</p>
    <p className="mt-1 text-xs text-stone-500">{detail}</p>
  </div>
);

export const AdminDashboard: React.FC = () => {
  const [overviewDays, setOverviewDays] = useState(30);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<AdminUsageEvent[]>([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [operationFilter, setOperationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');
  const [editAllowance, setEditAllowance] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [overviewResult, usersResult, usageResult] = await Promise.all([
        loadAdminOverview(overviewDays),
        loadAdminUsers(appliedSearch),
        loadAdminUsage({ days: overviewDays, operation: operationFilter, status: statusFilter }),
      ]);
      setOverview(overviewResult);
      setUsers(usersResult.users);
      setEvents(usageResult.events);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load admin dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, operationFilter, overviewDays, statusFilter]);

  useEffect(() => {
    if (!isAccountSystemConfigured()) {
      setError('Supabase browser environment variables are not configured.');
      setIsLoading(false);
      return;
    }

    getAccountSession().then((session) => {
      if (!session) {
        setError('Sign in from the LuminaBook library before opening the admin dashboard.');
        setIsLoading(false);
        return;
      }
      loadDashboard();
    }).catch((sessionError) => {
      setError(sessionError instanceof Error ? sessionError.message : 'Could not restore the account session.');
      setIsLoading(false);
    });

    const client = getAccountClient();
    const subscription = client?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') window.location.assign('/');
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [loadDashboard]);

  const selectUser = (user: AdminUser) => {
    setSelectedUser(user);
    setEditStatus(user.status);
    setEditAllowance(user.dailyAllowanceOverride === null ? '' : String(user.dailyAllowanceOverride));
    setEditNotes(user.adminNotes);
    setMessage('');
    setError('');
  };

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const allowance = editAllowance.trim() === '' ? null : Number(editAllowance);
      if (allowance !== null && (!Number.isFinite(allowance) || allowance < 0)) throw new Error('Daily allowance must be zero or a positive number.');
      await updateAdminUser(selectedUser.id, { status: editStatus, dailyAllowanceOverride: allowance, adminNotes: editNotes });
      setMessage('Account controls saved and audited.');
      await loadDashboard();
      setSelectedUser((current) => current ? { ...current, status: editStatus, dailyAllowanceOverride: allowance, adminNotes: editNotes } : current);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save account controls.');
    } finally {
      setIsSaving(false);
    }
  };

  const userEmails = useMemo(() => new Map(users.map((user) => [user.id, user.email || user.id.slice(0, 8)])), [users]);
  const maxDailyUnits = Math.max(...(overview?.daily.map((day) => day.chargedUnits) || [1]), 1);
  const failureRate = overview?.totals.requests ? (overview.totals.failed / overview.totals.requests) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#f5f1e8] text-stone-950">
      <header className="border-b border-stone-200 bg-[#fffdf8]">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-stone-950 text-white"><ShieldCheck className="h-5 w-5" /></div>
            <div><h1 className="font-semibold">LuminaBook Admin</h1><p className="text-xs text-stone-500">Accounts, quota, and funded-model operations</p></div>
          </div>
          <div className="flex items-center gap-2">
            <select value={overviewDays} onChange={(event) => setOverviewDays(Number(event.target.value))} className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm">
              <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
            </select>
            <button type="button" onClick={loadDashboard} className="flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button>
            <a href="/" className="flex h-9 items-center gap-2 rounded-md bg-stone-950 px-3 text-sm text-white"><ArrowLeft className="h-4 w-4" /> Library</a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-6 px-5 py-6">
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {message && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
        {isLoading && !overview ? <div className="flex items-center gap-2 py-20 text-stone-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading administrative data…</div> : overview && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <MetricCard label="Requests" value={formatNumber(overview.totals.requests)} detail={`${overview.totals.completed} completed`} icon={<Activity className="h-4 w-4" />} />
              <MetricCard label="Active users" value={formatNumber(overview.totals.activeUsers)} detail={`in ${overview.days} days`} icon={<Users className="h-4 w-4" />} />
              <MetricCard label="Charged units" value={formatNumber(overview.totals.chargedUnits)} detail={`${formatNumber(overview.totals.inputTokens)} input tokens`} icon={<Coins className="h-4 w-4" />} />
              <MetricCard label="Est. cost" value={formatCost(overview.totals.estimatedCostMicrousd)} detail="requires model rates" icon={<DollarSign className="h-4 w-4" />} />
              <MetricCard label="Failures" value={`${failureRate.toFixed(1)}%`} detail={`${overview.totals.failed} requests`} icon={<AlertTriangle className="h-4 w-4" />} />
              <MetricCard label="Avg latency" value={`${(overview.totals.averageElapsedMs / 1000).toFixed(1)}s`} detail="provider response" icon={<Clock3 className="h-4 w-4" />} />
              <MetricCard label="Reserved" value={formatNumber(overview.totals.reserved)} detail="inspect if stale" icon={<Gauge className="h-4 w-4" />} />
            </section>

            <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-lg border border-stone-200 bg-[#fffdf8] p-5 shadow-sm">
                <div className="flex items-center justify-between"><h2 className="font-semibold">Daily consumption</h2><span className="text-xs text-stone-500">weighted units</span></div>
                <div className="mt-5 flex h-44 items-end gap-1 overflow-hidden">
                  {overview.daily.map((day) => (
                    <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${day.date}: ${formatNumber(day.chargedUnits)} units, ${day.requests} requests`}>
                      <div className="w-full rounded-t bg-amber-700 transition group-hover:bg-amber-600" style={{ height: `${Math.max(2, (day.chargedUnits / maxDailyUnits) * 150)}px` }} />
                      <span className="hidden text-[9px] text-stone-400 xl:block">{day.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-stone-200 bg-[#fffdf8] p-5 shadow-sm">
                <h2 className="font-semibold">Operations</h2>
                <div className="mt-4 space-y-3">
                  {overview.operations.map((operation) => (
                    <div key={operation.operation}>
                      <div className="flex justify-between gap-3 text-sm"><span>{operationLabel(operation.operation)}</span><span className="font-medium">{formatNumber(operation.chargedUnits)}</span></div>
                      <p className="mt-0.5 text-xs text-stone-500">{operation.requests} requests · {operation.failed} failed · {formatCost(operation.estimatedCostMicrousd)}</p>
                    </div>
                  ))}
                  {!overview.operations.length && <p className="text-sm text-stone-500">No funded usage in this period.</p>}
                </div>
              </div>
            </section>
          </>
        )}

        <section className="rounded-lg border border-stone-200 bg-[#fffdf8] shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4">
            <div><h2 className="font-semibold">Users</h2><p className="text-xs text-stone-500">Search, inspect, suspend, or override daily allowance.</p></div>
            <form onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); }} className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email, phone, or user ID" className="h-9 w-72 rounded-md border border-stone-300 pl-9 pr-3 text-sm" />
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Today</th><th className="px-4 py-3">30d usage</th><th className="px-4 py-3">Failures</th><th className="px-4 py-3">Last active</th><th className="px-4 py-3"></th></tr></thead>
              <tbody>{users.map((user) => (
                <tr key={user.id} className="border-t border-stone-100 hover:bg-stone-50"><td className="px-4 py-3"><p className="font-medium">{user.email || user.phone || 'No identifier'}</p><p className="font-mono text-[10px] text-stone-400">{user.id}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${user.status === 'suspended' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{user.status}</span></td><td className="px-4 py-3"><p>{formatNumber(user.usedUnits)} / {formatNumber(user.allowanceUnits)}</p><p className="text-xs text-stone-400">{formatNumber(user.remainingUnits)} left</p></td><td className="px-4 py-3">{formatNumber(user.usage30d.chargedUnits)}</td><td className="px-4 py-3">{user.usage30d.failed}</td><td className="px-4 py-3 text-xs text-stone-500">{formatDateTime(user.usage30d.lastUsedAt || user.lastSignInAt)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => selectUser(user)} className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-white">Manage</button></td></tr>
              ))}</tbody>
            </table>
            {!users.length && <p className="p-6 text-sm text-stone-500">No matching users.</p>}
          </div>
        </section>

        <section className="rounded-lg border border-stone-200 bg-[#fffdf8] shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4">
            <div><h2 className="font-semibold">Usage events</h2><p className="text-xs text-stone-500">Latest 500 events for the selected filters.</p></div>
            <div className="flex gap-2">
              <select value={operationFilter} onChange={(event) => setOperationFilter(event.target.value)} className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm"><option value="">All operations</option><option value="translate">Translation</option><option value="chat">Chat</option><option value="define">Definition</option><option value="note">Note</option><option value="metadata">Metadata</option><option value="test">Test</option></select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm"><option value="">All statuses</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="reserved">Reserved</option></select>
            </div>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[1100px] text-left text-xs"><thead className="sticky top-0 bg-stone-50 uppercase tracking-wide text-stone-500"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Operation</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tokens in/out</th><th className="px-4 py-3">Units</th><th className="px-4 py-3">Latency</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">Error</th></tr></thead><tbody>{events.map((event) => (
              <tr key={event.id} className="border-t border-stone-100"><td className="whitespace-nowrap px-4 py-3 text-stone-500">{formatDateTime(event.createdAt)}</td><td className="max-w-48 truncate px-4 py-3" title={event.userId}>{userEmails.get(event.userId) || event.userId.slice(0, 8)}</td><td className="px-4 py-3">{operationLabel(event.operation)}</td><td className="px-4 py-3"><span className={event.status === 'failed' ? 'text-red-700' : event.status === 'reserved' ? 'text-amber-700' : 'text-emerald-700'}>{event.status}</span></td><td className="px-4 py-3">{formatNumber(event.inputTokens || 0)} / {formatNumber(event.outputTokens || 0)}</td><td className="px-4 py-3">{formatNumber(event.chargedUnits)}</td><td className="px-4 py-3">{event.elapsedMs === null ? '—' : `${(event.elapsedMs / 1000).toFixed(1)}s`}</td><td className="px-4 py-3">{formatCost(event.estimatedCostMicrousd)}</td><td className="max-w-52 truncate px-4 py-3 text-red-700" title={event.errorCode || ''}>{event.errorCode || '—'}</td></tr>
            ))}</tbody></table>
          </div>
        </section>
      </main>

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/35 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedUser(null); }}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-[#fffdf8] p-5 shadow-2xl">
            <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Manage account</p><h2 className="mt-1 text-lg font-semibold">{selectedUser.email || selectedUser.id}</h2></div><button type="button" onClick={() => setSelectedUser(null)} className="rounded p-1 hover:bg-stone-100"><X className="h-5 w-5" /></button></div>
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs"><div className="rounded-md bg-stone-100 p-3"><p className="text-stone-500">Created</p><p className="mt-1">{formatDateTime(selectedUser.createdAt)}</p></div><div className="rounded-md bg-stone-100 p-3"><p className="text-stone-500">Last sign-in</p><p className="mt-1">{formatDateTime(selectedUser.lastSignInAt)}</p></div></div>
            <form onSubmit={saveUser} className="mt-5 space-y-4">
              <label className="block"><span className="text-xs font-medium text-stone-600">Funded usage status</span><select value={editStatus} onChange={(event) => setEditStatus(event.target.value as 'active' | 'suspended')} className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm"><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
              <label className="block"><span className="text-xs font-medium text-stone-600">Daily allowance override</span><input type="number" min={0} max={10000000} step={1000} value={editAllowance} onChange={(event) => setEditAllowance(event.target.value)} placeholder="Blank = 50,000 default" className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm" /><span className="mt-1 block text-xs text-stone-400">Blank uses the system default. Zero blocks funded usage without suspending the account.</span></label>
              <label className="block"><span className="text-xs font-medium text-stone-600">Internal notes</span><textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} maxLength={2000} className="mt-1 h-32 w-full resize-none rounded-md border border-stone-300 bg-white p-3 text-sm" placeholder="Reason for overrides, support context, or abuse review notes" /></label>
              <div className={`rounded-md border p-3 text-xs ${editStatus === 'suspended' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{editStatus === 'suspended' ? <span className="flex gap-2"><Ban className="h-4 w-4" /> Future funded requests will be rejected. BYOK remains available.</span> : <span className="flex gap-2"><CheckCircle2 className="h-4 w-4" /> Funded requests are permitted within the allowance.</span>}</div>
              <button type="submit" disabled={isSaving} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-stone-950 text-sm font-medium text-white disabled:opacity-50">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save controls</button>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
};

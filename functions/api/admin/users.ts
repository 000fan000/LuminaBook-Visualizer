import { json, PagesContext, requireAdmin, serviceRequest, todayUtc } from '../_shared';

interface AuthUserRow {
  id: string;
  email?: string;
  phone?: string;
  created_at: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
}

interface ControlRow {
  user_id: string;
  status: 'active' | 'suspended';
  daily_allowance_override: number | null;
  admin_notes: string;
  updated_at: string;
}

interface QuotaRow {
  user_id: string;
  allowance_units: number;
  used_units: number;
  reserved_units: number;
}

interface UsageRow {
  user_id: string;
  charged_units: number;
  status: string;
  created_at: string;
}

export const onRequestGet = async (context: PagesContext) => {
  try {
    await requireAdmin(context);
    const requestUrl = new URL(context.request.url);
    const search = (requestUrl.searchParams.get('search') || '').trim().toLowerCase();
    const authResult = await serviceRequest<{ users: AuthUserRow[] }>(context, '/auth/v1/admin/users?page=1&per_page=1000');
    const controls = await serviceRequest<ControlRow[]>(context, '/rest/v1/account_controls?select=user_id,status,daily_allowance_override,admin_notes,updated_at');
    const quotas = await serviceRequest<QuotaRow[]>(context, `/rest/v1/quota_periods?period_key=eq.${todayUtc()}&select=user_id,allowance_units,used_units,reserved_units`);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const usage = await serviceRequest<UsageRow[]>(context, `/rest/v1/usage_events?created_at=gte.${encodeURIComponent(since)}&select=user_id,charged_units,status,created_at&limit=10000`);
    const controlsByUser = new Map(controls.map((row) => [row.user_id, row]));
    const quotasByUser = new Map(quotas.map((row) => [row.user_id, row]));
    const usageByUser = new Map<string, { requests: number; failed: number; chargedUnits: number; lastUsedAt: string | null }>();

    for (const row of usage) {
      const summary = usageByUser.get(row.user_id) || { requests: 0, failed: 0, chargedUnits: 0, lastUsedAt: null };
      summary.requests += 1;
      summary.failed += row.status === 'failed' ? 1 : 0;
      summary.chargedUnits += Number(row.charged_units || 0);
      if (!summary.lastUsedAt || row.created_at > summary.lastUsedAt) summary.lastUsedAt = row.created_at;
      usageByUser.set(row.user_id, summary);
    }

    const users = authResult.users
      .filter((user) => !search || user.id.toLowerCase().includes(search) || user.email?.toLowerCase().includes(search) || user.phone?.includes(search))
      .map((user) => {
        const control = controlsByUser.get(user.id);
        const quota = quotasByUser.get(user.id);
        const usageSummary = usageByUser.get(user.id) || { requests: 0, failed: 0, chargedUnits: 0, lastUsedAt: null };
        const allowance = quota?.allowance_units ?? control?.daily_allowance_override ?? 50000;
        const used = quota?.used_units || 0;
        const reserved = quota?.reserved_units || 0;

        return {
          id: user.id,
          email: user.email || '',
          phone: user.phone || '',
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at || null,
          emailConfirmed: Boolean(user.email_confirmed_at),
          status: control?.status || 'active',
          dailyAllowanceOverride: control?.daily_allowance_override ?? null,
          adminNotes: control?.admin_notes || '',
          allowanceUnits: allowance,
          usedUnits: used,
          reservedUnits: reserved,
          remainingUnits: Math.max(allowance - used - reserved, 0),
          usage30d: usageSummary,
        };
      })
      .sort((a, b) => (b.usage30d.lastUsedAt || b.createdAt).localeCompare(a.usage30d.lastUsedAt || a.createdAt));

    return json({ users: users.slice(0, 500), total: users.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'admin_error';
    return json({ error: message === 'unauthorized' ? 'Sign in to continue.' : message === 'forbidden' ? 'Administrator access required.' : 'Could not load users.' }, message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : 500);
  }
};


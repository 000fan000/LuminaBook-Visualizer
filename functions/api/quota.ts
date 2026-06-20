import { json, PagesContext, requireUser, serviceRequest, todayUtc } from './_shared';

interface QuotaRow {
  allowance_units: number;
  used_units: number;
  reserved_units: number;
}

interface ControlRow {
  status: 'active' | 'suspended';
  daily_allowance_override: number | null;
}

export const onRequestGet = async (context: PagesContext) => {
  try {
    const user = await requireUser(context);
    const period = todayUtc();
    const query = new URL(`${context.env.SUPABASE_URL}/rest/v1/quota_periods`);
    query.searchParams.set('user_id', `eq.${user.id}`);
    query.searchParams.set('period_key', `eq.${period}`);
    query.searchParams.set('select', 'allowance_units,used_units,reserved_units');

    const [rows, controls] = await Promise.all([
      serviceRequest<QuotaRow[]>(context, `${query.pathname}${query.search}`),
      serviceRequest<ControlRow[]>(context, `/rest/v1/account_controls?user_id=eq.${encodeURIComponent(user.id)}&select=status,daily_allowance_override&limit=1`),
    ]);
    const control = controls[0];
    const defaultAllowance = control?.daily_allowance_override ?? 50000;
    const row = rows[0] || { allowance_units: defaultAllowance, used_units: 0, reserved_units: 0 };
    const remaining = Math.max(row.allowance_units - row.used_units - row.reserved_units, 0);

    return json({
      period,
      allowanceUnits: row.allowance_units,
      usedUnits: row.used_units,
      reservedUnits: row.reserved_units,
      remainingUnits: remaining,
      accountStatus: control?.status || 'active',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'quota_error';
    return json({ error: message === 'unauthorized' ? 'Sign in to view daily credits.' : 'Could not load daily credits.' }, message === 'unauthorized' ? 401 : 500);
  }
};

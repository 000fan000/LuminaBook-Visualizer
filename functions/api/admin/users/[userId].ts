import { json, PagesContext, requireAdmin, serviceRequest, todayUtc } from '../../_shared';

interface ControlPayload {
  status?: 'active' | 'suspended';
  dailyAllowanceOverride?: number | null;
  adminNotes?: string;
}

interface RouteContext extends PagesContext {
  params: { userId: string };
}

export const onRequestPatch = async (context: RouteContext) => {
  try {
    const admin = await requireAdmin(context);
    const userId = context.params.userId;
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: 'Invalid user ID.' }, 400);
    const body = (await context.request.json()) as ControlPayload;
    const status = body.status === 'suspended' ? 'suspended' : 'active';
    const allowance = body.dailyAllowanceOverride === null || body.dailyAllowanceOverride === undefined
      ? null
      : Math.max(0, Math.min(Math.round(Number(body.dailyAllowanceOverride)), 10_000_000));
    const notes = String(body.adminNotes || '').slice(0, 2000);
    const previous = await serviceRequest<Record<string, unknown>[]>(context, `/rest/v1/account_controls?user_id=eq.${encodeURIComponent(userId)}&select=*`);
    const nextPayload = {
      user_id: userId,
      status,
      daily_allowance_override: allowance,
      admin_notes: notes,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    };
    const updated = await serviceRequest<Record<string, unknown>[]>(context, '/rest/v1/account_controls?on_conflict=user_id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(nextPayload),
    });

    await serviceRequest(context, `/rest/v1/quota_periods?user_id=eq.${encodeURIComponent(userId)}&period_key=eq.${todayUtc()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ allowance_units: allowance ?? 50000, updated_at: new Date().toISOString() }),
    });

    await serviceRequest(context, '/rest/v1/admin_audit_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        admin_user_id: admin.id,
        target_user_id: userId,
        action: 'account_control_update',
        before_state: previous[0] || null,
        after_state: updated[0] || nextPayload,
      }),
    });

    return json({ control: updated[0] || nextPayload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'admin_error';
    return json({ error: message === 'unauthorized' ? 'Sign in to continue.' : message === 'forbidden' ? 'Administrator access required.' : 'Could not update account controls.' }, message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : 500);
  }
};

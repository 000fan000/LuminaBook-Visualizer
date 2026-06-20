import { json, PagesContext, requireAdmin, serviceRequest } from '../_shared';

interface UsageRow {
  id: string;
  user_id: string;
  operation: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  charged_units: number;
  status: string;
  error_code: string | null;
  response_status: number | null;
  elapsed_ms: number | null;
  estimated_cost_microusd: number;
  created_at: string;
}

export const onRequestGet = async (context: PagesContext) => {
  try {
    await requireAdmin(context);
    const url = new URL(context.request.url);
    const days = Math.max(1, Math.min(Number(url.searchParams.get('days')) || 7, 90));
    const operation = url.searchParams.get('operation') || '';
    const status = url.searchParams.get('status') || '';
    const userId = url.searchParams.get('userId') || '';
    const filters = [`created_at=gte.${encodeURIComponent(new Date(Date.now() - days * 86_400_000).toISOString())}`];
    if (operation) filters.push(`operation=eq.${encodeURIComponent(operation)}`);
    if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
    if (userId) filters.push(`user_id=eq.${encodeURIComponent(userId)}`);
    const rows = await serviceRequest<UsageRow[]>(
      context,
      `/rest/v1/usage_events?${filters.join('&')}&select=id,user_id,operation,model,input_tokens,output_tokens,charged_units,status,error_code,response_status,elapsed_ms,estimated_cost_microusd,created_at&order=created_at.desc&limit=500`,
    );

    return json({
      events: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        operation: row.operation,
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        chargedUnits: row.charged_units,
        status: row.status,
        errorCode: row.error_code,
        responseStatus: row.response_status,
        elapsedMs: row.elapsed_ms,
        estimatedCostMicrousd: row.estimated_cost_microusd,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'admin_error';
    return json({ error: message === 'unauthorized' ? 'Sign in to continue.' : message === 'forbidden' ? 'Administrator access required.' : 'Could not load usage events.' }, message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : 500);
  }
};


import { json, PagesContext, requireAdmin, serviceRequest } from '../_shared';

interface UsageRow {
  user_id: string;
  operation: string;
  input_tokens: number | null;
  output_tokens: number | null;
  charged_units: number;
  status: 'reserved' | 'completed' | 'failed';
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
    const days = Math.max(1, Math.min(Number(url.searchParams.get('days')) || 30, 90));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = await serviceRequest<UsageRow[]>(
      context,
      `/rest/v1/usage_events?created_at=gte.${encodeURIComponent(since)}&select=user_id,operation,input_tokens,output_tokens,charged_units,status,error_code,response_status,elapsed_ms,estimated_cost_microusd,created_at&order=created_at.desc&limit=10000`,
    );
    const operations = new Map<string, { operation: string; requests: number; failed: number; chargedUnits: number; estimatedCostMicrousd: number }>();
    const daily = new Map<string, { date: string; requests: number; failed: number; chargedUnits: number; estimatedCostMicrousd: number }>();
    const userIds = new Set<string>();
    let completed = 0;
    let failed = 0;
    let reserved = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let chargedUnits = 0;
    let estimatedCostMicrousd = 0;
    let elapsedTotal = 0;
    let elapsedCount = 0;

    for (const row of rows) {
      userIds.add(row.user_id);
      if (row.status === 'completed') completed += 1;
      if (row.status === 'failed') failed += 1;
      if (row.status === 'reserved') reserved += 1;
      inputTokens += Number(row.input_tokens || 0);
      outputTokens += Number(row.output_tokens || 0);
      chargedUnits += Number(row.charged_units || 0);
      estimatedCostMicrousd += Number(row.estimated_cost_microusd || 0);
      if (row.elapsed_ms !== null) {
        elapsedTotal += Number(row.elapsed_ms);
        elapsedCount += 1;
      }

      const operation = operations.get(row.operation) || { operation: row.operation, requests: 0, failed: 0, chargedUnits: 0, estimatedCostMicrousd: 0 };
      operation.requests += 1;
      operation.failed += row.status === 'failed' ? 1 : 0;
      operation.chargedUnits += Number(row.charged_units || 0);
      operation.estimatedCostMicrousd += Number(row.estimated_cost_microusd || 0);
      operations.set(row.operation, operation);

      const date = row.created_at.slice(0, 10);
      const day = daily.get(date) || { date, requests: 0, failed: 0, chargedUnits: 0, estimatedCostMicrousd: 0 };
      day.requests += 1;
      day.failed += row.status === 'failed' ? 1 : 0;
      day.chargedUnits += Number(row.charged_units || 0);
      day.estimatedCostMicrousd += Number(row.estimated_cost_microusd || 0);
      daily.set(date, day);
    }

    return json({
      days,
      totals: {
        requests: rows.length,
        completed,
        failed,
        reserved,
        activeUsers: userIds.size,
        inputTokens,
        outputTokens,
        chargedUnits,
        estimatedCostMicrousd,
        averageElapsedMs: elapsedCount ? Math.round(elapsedTotal / elapsedCount) : 0,
      },
      operations: [...operations.values()].sort((a, b) => b.chargedUnits - a.chargedUnits),
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
      recentFailures: rows.filter((row) => row.status === 'failed').slice(0, 20).map((row) => ({
        userId: row.user_id,
        operation: row.operation,
        errorCode: row.error_code,
        responseStatus: row.response_status,
        elapsedMs: row.elapsed_ms,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'admin_error';
    return json({ error: message === 'unauthorized' ? 'Sign in to continue.' : message === 'forbidden' ? 'Administrator access required.' : 'Could not load admin overview.' }, message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : 500);
  }
};

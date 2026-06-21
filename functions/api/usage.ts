import { getServerSetupError, isDatabaseMigrationMissing, json, PagesContext, requireUser, serviceRequest } from './_shared';

interface UsageRow {
  id: string;
  operation: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  charged_units: number;
  status: 'reserved' | 'completed' | 'failed';
  error_code: string | null;
  elapsed_ms: number | null;
  created_at: string;
}

export const onRequestGet = async (context: PagesContext) => {
  try {
    const user = await requireUser(context);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const rows = await serviceRequest<UsageRow[]>(
      context,
      `/rest/v1/usage_events?user_id=eq.${encodeURIComponent(user.id)}&created_at=gte.${encodeURIComponent(since)}&select=id,operation,model,input_tokens,output_tokens,charged_units,status,error_code,elapsed_ms,created_at&order=created_at.desc&limit=500`,
    );
    const adminRows = await serviceRequest<Array<{ user_id: string }>>(
      context,
      `/rest/v1/account_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`,
    );

    const operations = new Map<string, { operation: string; requests: number; chargedUnits: number }>();
    const days = new Map<string, { date: string; requests: number; chargedUnits: number }>();
    let inputTokens = 0;
    let outputTokens = 0;
    let chargedUnits = 0;
    let failedRequests = 0;

    for (const row of rows) {
      const day = row.created_at.slice(0, 10);
      const operation = operations.get(row.operation) || { operation: row.operation, requests: 0, chargedUnits: 0 };
      const daily = days.get(day) || { date: day, requests: 0, chargedUnits: 0 };
      operation.requests += 1;
      operation.chargedUnits += Number(row.charged_units || 0);
      daily.requests += 1;
      daily.chargedUnits += Number(row.charged_units || 0);
      operations.set(row.operation, operation);
      days.set(day, daily);
      inputTokens += Number(row.input_tokens || 0);
      outputTokens += Number(row.output_tokens || 0);
      chargedUnits += Number(row.charged_units || 0);
      if (row.status === 'failed') failedRequests += 1;
    }

    return json({
      isAdmin: adminRows.length > 0,
      totals: {
        requests: rows.length,
        failedRequests,
        inputTokens,
        outputTokens,
        chargedUnits,
      },
      operations: [...operations.values()].sort((a, b) => b.chargedUnits - a.chargedUnits),
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-7),
      recent: rows.slice(0, 12).map((row) => ({
        id: row.id,
        operation: row.operation,
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        chargedUnits: row.charged_units,
        status: row.status,
        errorCode: row.error_code,
        elapsedMs: row.elapsed_ms,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'usage_error';
    const setupError = getServerSetupError(error);
    if (setupError) return json({ error: setupError }, 503);
    if (isDatabaseMigrationMissing(error)) {
      return json({ error: 'Account database migrations are missing. Apply both SQL files in supabase/migrations, then retry.' }, 503);
    }
    return json({ error: message === 'unauthorized' ? 'Sign in to view usage.' : 'Could not load usage history.' }, message === 'unauthorized' ? 401 : 500);
  }
};

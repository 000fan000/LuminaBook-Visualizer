interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PLATFORM_LLM_ENDPOINT: string;
  PLATFORM_LLM_API_KEY: string;
  PLATFORM_LLM_MODEL: string;
  PLATFORM_LLM_INPUT_USD_PER_MILLION?: string;
  PLATFORM_LLM_OUTPUT_USD_PER_MILLION?: string;
}

export interface PagesContext {
  request: Request;
  env: Env;
}

export interface AuthUser {
  id: string;
  email?: string;
}

const CONFIG_PLACEHOLDER = /YOUR_|example\.supabase|test-(?:anon|service|platform)|^\s*$/i;

const assertConfigured = (context: PagesContext, keys: Array<keyof Env>) => {
  const invalidKeys = keys.filter((key) => CONFIG_PLACEHOLDER.test(String(context.env[key] || '')));
  if (invalidKeys.length) throw new Error(`server_configuration_missing:${invalidKeys.join(',')}`);
};

export const assertPlatformProviderConfigured = (context: PagesContext) =>
  assertConfigured(context, ['PLATFORM_LLM_ENDPOINT', 'PLATFORM_LLM_API_KEY', 'PLATFORM_LLM_MODEL']);

const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit, timeoutMs = 12_000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('supabase_request_timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const json = (payload: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export const requireUser = async (context: PagesContext): Promise<AuthUser> => {
  assertConfigured(context, ['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
  const authorization = context.request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('unauthorized');

  const response = await fetchWithTimeout(`${context.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: context.env.SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) throw new Error('unauthorized');
  const user = (await response.json()) as AuthUser;
  if (!user.id) throw new Error('unauthorized');
  return user;
};

const serviceHeaders = (context: PagesContext, extras?: HeadersInit) => ({
  Authorization: `Bearer ${context.env.SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: context.env.SUPABASE_SERVICE_ROLE_KEY,
  ...extras,
});

export const serviceRequest = async <T>(context: PagesContext, path: string, init?: RequestInit): Promise<T> => {
  assertConfigured(context, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const response = await fetchWithTimeout(`${context.env.SUPABASE_URL}${path}`, {
    ...init,
    headers: serviceHeaders(context, init?.headers),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
};

export const requireAdmin = async (context: PagesContext) => {
  const user = await requireUser(context);
  const rows = await serviceRequest<Array<{ user_id: string }>>(
    context,
    `/rest/v1/account_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`,
  );

  if (!rows.length) throw new Error('forbidden');
  return user;
};

export const serviceRpc = async <T>(context: PagesContext, name: string, body: Record<string, unknown>): Promise<T> => {
  assertConfigured(context, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const response = await fetchWithTimeout(`${context.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...serviceHeaders(context),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name} failed: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
};

export const todayUtc = () => new Date().toISOString().slice(0, 10);

export const isDatabaseMigrationMissing = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /PGRST202|PGRST205|42P01|schema cache.*(?:table|function)|could not find the (?:table|function)/i.test(message);
};

export const getServerSetupError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('server_configuration_missing:')) {
    if (message.includes('PLATFORM_LLM_')) {
      return 'Platform model variables are placeholders. Update PLATFORM_LLM_ENDPOINT, PLATFORM_LLM_API_KEY, and PLATFORM_LLM_MODEL in .dev.vars, then restart Wrangler.';
    }
    return 'Local server variables are placeholders. Update SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in .dev.vars, then restart Wrangler.';
  }
  if (message === 'supabase_request_timeout') {
    return 'The server could not reach Supabase within 12 seconds. Check SUPABASE_URL and local network access, then restart Wrangler.';
  }
  return null;
};

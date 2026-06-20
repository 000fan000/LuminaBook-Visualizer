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

export const json = (payload: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export const requireUser = async (context: PagesContext): Promise<AuthUser> => {
  const authorization = context.request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('unauthorized');

  const response = await fetch(`${context.env.SUPABASE_URL}/auth/v1/user`, {
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
  const response = await fetch(`${context.env.SUPABASE_URL}${path}`, {
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
  const response = await fetch(`${context.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
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

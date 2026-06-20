import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';

export interface QuotaSummary {
  period: string;
  allowanceUnits: number;
  usedUnits: number;
  reservedUnits: number;
  remainingUnits: number;
  accountStatus: 'active' | 'suspended';
}

export interface UsageSummary {
  isAdmin: boolean;
  totals: {
    requests: number;
    failedRequests: number;
    inputTokens: number;
    outputTokens: number;
    chargedUnits: number;
  };
  operations: Array<{ operation: string; requests: number; chargedUnits: number }>;
  days: Array<{ date: string; requests: number; chargedUnits: number }>;
  recent: Array<{
    id: string;
    operation: string;
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    chargedUnits: number;
    status: 'reserved' | 'completed' | 'failed';
    errorCode: string | null;
    elapsedMs: number | null;
    createdAt: string;
  }>;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

let browserClient: SupabaseClient | null = null;

export const isAccountSystemConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

export const getAccountClient = () => {
  if (!isAccountSystemConfigured()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
};

export const getAccountSession = async (): Promise<Session | null> => {
  const client = getAccountClient();

  if (!client) {
    return null;
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
};

export const getAccountAccessToken = async () => {
  const session = await getAccountSession();

  if (!session?.access_token) {
    throw new Error('Sign in to use LuminaBook Daily Credits.');
  }

  return session.access_token;
};

export const loadQuotaSummary = async (accessToken: string): Promise<QuotaSummary> => {
  const response = await fetch('/api/quota', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = (await response.json().catch(() => null)) as QuotaSummary & { error?: string } | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Could not load daily credits (${response.status}).`);
  }

  return payload;
};

export const loadUsageSummary = async (accessToken: string): Promise<UsageSummary> => {
  const response = await fetch('/api/usage', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json().catch(() => null)) as UsageSummary & { error?: string } | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Could not load usage history (${response.status}).`);
  }

  return payload;
};

export const announceQuotaUpdate = () => {
  window.dispatchEvent(new CustomEvent('luminabook:quota-updated'));
};

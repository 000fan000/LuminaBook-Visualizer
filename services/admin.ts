import { getAccountAccessToken, readJsonApiResponse } from './account';

export interface AdminOverview {
  days: number;
  totals: {
    requests: number;
    completed: number;
    failed: number;
    reserved: number;
    activeUsers: number;
    inputTokens: number;
    outputTokens: number;
    chargedUnits: number;
    estimatedCostMicrousd: number;
    averageElapsedMs: number;
  };
  operations: Array<{ operation: string; requests: number; failed: number; chargedUnits: number; estimatedCostMicrousd: number }>;
  daily: Array<{ date: string; requests: number; failed: number; chargedUnits: number; estimatedCostMicrousd: number }>;
  recentFailures: Array<{ userId: string; operation: string; errorCode: string | null; responseStatus: number | null; elapsedMs: number | null; createdAt: string }>;
}

export interface AdminUser {
  id: string;
  email: string;
  phone: string;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  status: 'active' | 'suspended';
  dailyAllowanceOverride: number | null;
  adminNotes: string;
  allowanceUnits: number;
  usedUnits: number;
  reservedUnits: number;
  remainingUnits: number;
  usage30d: { requests: number; failed: number; chargedUnits: number; lastUsedAt: string | null };
}

export interface AdminUsageEvent {
  id: string;
  userId: string;
  operation: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  chargedUnits: number;
  status: 'reserved' | 'completed' | 'failed';
  errorCode: string | null;
  responseStatus: number | null;
  elapsedMs: number | null;
  estimatedCostMicrousd: number;
  createdAt: string;
}

const adminFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const accessToken = await getAccountAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
  return readJsonApiResponse<T>(response, 'Admin dashboard');
};

export const loadAdminOverview = (days: number) =>
  adminFetch<AdminOverview>(`/api/admin/overview?days=${days}`);

export const loadAdminUsers = (search = '') =>
  adminFetch<{ users: AdminUser[]; total: number }>(`/api/admin/users?search=${encodeURIComponent(search)}`);

export const loadAdminUsage = (filters: { days: number; operation?: string; status?: string; userId?: string }) => {
  const params = new URLSearchParams({ days: String(filters.days) });
  if (filters.operation) params.set('operation', filters.operation);
  if (filters.status) params.set('status', filters.status);
  if (filters.userId) params.set('userId', filters.userId);
  return adminFetch<{ events: AdminUsageEvent[] }>(`/api/admin/usage?${params}`);
};

export const updateAdminUser = (
  userId: string,
  control: { status: 'active' | 'suspended'; dailyAllowanceOverride: number | null; adminNotes: string },
) => adminFetch<{ control: Record<string, unknown> }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(control),
});

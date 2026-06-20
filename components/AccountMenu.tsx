import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Activity, ExternalLink, KeyRound, Loader2, LogIn, LogOut, RefreshCw, UserRound, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import {
  getAccountClient,
  getAccountSession,
  isAccountSystemConfigured,
  loadQuotaSummary,
  loadUsageSummary,
  QuotaSummary,
  UsageSummary,
} from '../services/account';

const formatUnits = (units: number) => new Intl.NumberFormat().format(Math.max(0, Math.round(units)));
const operationLabel = (operation: string) => ({ translate: 'Translation', chat: 'Reading chat', define: 'Definition', note: 'Reader note', metadata: 'Metadata', test: 'Connection test' })[operation] || operation;

export const AccountMenu: React.FC = () => {
  const configured = isAccountSystemConfigured();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [session, setSession] = useState<Session | null>(null);
  const [quota, setQuota] = useState<QuotaSummary | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [showUsage, setShowUsage] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshQuota = useCallback(async (activeSession?: Session | null) => {
    const targetSession = activeSession === undefined ? await getAccountSession() : activeSession;

    if (!targetSession?.access_token) {
      setQuota(null);
      return;
    }

    try {
      setQuota(await loadQuotaSummary(targetSession.access_token));
    } catch (quotaError) {
      setError(quotaError instanceof Error ? quotaError.message : 'Could not load daily credits.');
    }
  }, []);

  const refreshUsage = useCallback(async (activeSession?: Session | null) => {
    const targetSession = activeSession === undefined ? await getAccountSession() : activeSession;
    if (!targetSession?.access_token) {
      setUsage(null);
      return;
    }
    try {
      setUsage(await loadUsageSummary(targetSession.access_token));
    } catch (usageError) {
      setError(usageError instanceof Error ? usageError.message : 'Could not load usage history.');
    }
  }, []);

  useEffect(() => {
    const client = getAccountClient();

    if (!client) {
      return;
    }

    getAccountSession()
      .then((nextSession) => {
        setSession(nextSession);
        return refreshQuota(nextSession);
      })
      .catch((sessionError) => setError(sessionError instanceof Error ? sessionError.message : 'Could not restore session.'));

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setQuota(null);
      setUsage(null);
      setError('');
      window.setTimeout(() => refreshQuota(nextSession), 0);
    });

    const handleQuotaUpdate = () => {
      refreshQuota();
      if (showUsage) refreshUsage();
    };
    window.addEventListener('luminabook:quota-updated', handleQuotaUpdate);

    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('luminabook:quota-updated', handleQuotaUpdate);
    };
  }, [refreshQuota, refreshUsage, showUsage]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const client = getAccountClient();

    if (!client) {
      setError('Account environment variables are not configured.');
      return;
    }

    setIsWorking(true);
    setMessage('');
    setError('');

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });

        if (signUpError) throw signUpError;
        setSession(data.session);
        setMessage(data.session ? 'Account created.' : 'Check your email to verify the account.');
      } else {
        const { data, error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) throw signInError;
        setSession(data.session);
        await refreshQuota(data.session);
        await refreshUsage(data.session);
        setMessage('Signed in.');
      }

      setPassword('');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed.');
    } finally {
      setIsWorking(false);
    }
  };

  const signOut = async () => {
    const client = getAccountClient();
    if (!client) return;
    setIsWorking(true);
    const { error: signOutError } = await client.auth.signOut();
    setIsWorking(false);
    if (signOutError) setError(signOutError.message);
  };

  const remainingPercent = quota?.allowanceUnits
    ? Math.max(0, Math.min(100, (quota.remainingUnits / quota.allowanceUnits) * 100))
    : 0;
  const maxDailyUsage = Math.max(...(usage?.days.map((day) => day.chargedUnits) || [1]), 1);

  const toggleUsage = async () => {
    const next = !showUsage;
    setShowUsage(next);
    if (next && !usage) await refreshUsage();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-10 items-center gap-2 rounded-md border border-stone-300 bg-[#fffdf8] px-3 text-sm font-medium text-stone-800 shadow-sm hover:bg-white"
        title={session ? session.user.email || 'Account' : 'Sign in'}
      >
        <UserRound className="h-4 w-4" />
        <span className="hidden sm:inline">{session ? 'Account' : 'Sign in'}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-50 max-h-[80vh] w-[min(420px,calc(100vw-32px))] overflow-y-auto rounded-lg border border-stone-300 bg-[#fffdf8] p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">LuminaBook account</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">
                {session ? 'Daily reading credits' : 'Continue your reading'}
              </h2>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="rounded p-1 text-stone-500 hover:bg-stone-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!configured && (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable accounts.
            </div>
          )}

          {configured && session && (
            <div className="mt-4 space-y-4">
              <div className="rounded-md border border-stone-200 bg-[#f8f4eb] p-3">
                <p className="truncate text-sm font-medium text-stone-900">{session.user.email}</p>
                {quota ? (
                  <>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                      <div className="h-full rounded-full bg-amber-700" style={{ width: `${remainingPercent}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between gap-3 text-xs text-stone-600">
                      <span>{formatUnits(quota.remainingUnits)} remaining</span>
                      <span>{formatUnits(quota.allowanceUnits)} daily</span>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-sm text-stone-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading credits…
                  </div>
                )}
              </div>
              <p className="text-xs leading-5 text-stone-500">
                Credits reset at 00:00 UTC. Your books and reading notes still remain on this device.
              </p>
              {quota?.accountStatus === 'suspended' && (
                <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                  Funded model usage is suspended for this account. Personal provider profiles remain available.
                </p>
              )}
              <button type="button" onClick={toggleUsage} className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-stone-300 text-sm font-medium hover:bg-white">
                <Activity className="h-4 w-4" /> {showUsage ? 'Hide usage' : 'View usage'}
              </button>

              {showUsage && (
                <div className="space-y-3 border-t border-stone-200 pt-3">
                  {!usage ? (
                    <div className="flex items-center gap-2 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading usage…</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-md bg-stone-100 p-2"><p className="text-base font-semibold">{formatUnits(usage.totals.chargedUnits)}</p><p className="text-[10px] uppercase tracking-wide text-stone-500">30d units</p></div>
                        <div className="rounded-md bg-stone-100 p-2"><p className="text-base font-semibold">{usage.totals.requests}</p><p className="text-[10px] uppercase tracking-wide text-stone-500">Requests</p></div>
                        <div className="rounded-md bg-stone-100 p-2"><p className="text-base font-semibold">{usage.totals.failedRequests}</p><p className="text-[10px] uppercase tracking-wide text-stone-500">Not charged</p></div>
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between text-xs text-stone-500"><span>Last 7 days</span><span>weighted units</span></div>
                        <div className="flex h-14 items-end gap-1.5">
                          {usage.days.length ? usage.days.map((day) => (
                            <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${day.date}: ${formatUnits(day.chargedUnits)} units`}>
                              <div className="w-full rounded-sm bg-amber-700/80" style={{ height: `${Math.max(3, (day.chargedUnits / maxDailyUsage) * 40)}px` }} />
                              <span className="text-[9px] text-stone-400">{day.date.slice(8)}</span>
                            </div>
                          )) : <p className="text-xs text-stone-400">No funded usage yet.</p>}
                        </div>
                      </div>
                      {usage.operations.length > 0 && (
                        <div className="space-y-1.5">
                          {usage.operations.slice(0, 5).map((operation) => (
                            <div key={operation.operation} className="flex justify-between text-xs"><span className="text-stone-600">{operationLabel(operation.operation)} · {operation.requests}</span><span className="font-medium">{formatUnits(operation.chargedUnits)}</span></div>
                          ))}
                        </div>
                      )}
                      {usage.recent.length > 0 && (
                        <div className="space-y-1 border-t border-stone-200 pt-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Recent</p>
                          {usage.recent.slice(0, 4).map((event) => (
                            <div key={event.id} className="flex items-center justify-between gap-3 text-xs">
                              <span className="truncate text-stone-600">{operationLabel(event.operation)} · {new Date(event.createdAt).toLocaleDateString()}</span>
                              <span className={event.status === 'failed' ? 'text-red-700' : 'font-medium'}>{event.status === 'failed' ? 'not charged' : formatUnits(event.chargedUnits)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {usage.isAdmin && (
                        <a href="/admin" className="flex h-9 items-center justify-center gap-2 rounded-md bg-amber-800 text-sm font-medium text-white hover:bg-amber-700">
                          Open admin dashboard <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => refreshQuota()} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-stone-300 text-sm hover:bg-white">
                  <RefreshCw className="h-4 w-4" /> Refresh
                </button>
                <button type="button" onClick={signOut} disabled={isWorking} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-stone-950 text-sm text-white hover:bg-stone-800 disabled:opacity-50">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          )}

          {configured && !session && (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-stone-600">Email</span>
                <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-stone-400" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-stone-600">Password</span>
                <input type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-stone-400" />
              </label>
              <button type="submit" disabled={isWorking} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-stone-950 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50">
                {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'signin' ? <LogIn className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
              <button type="button" onClick={() => { setMode((current) => current === 'signin' ? 'signup' : 'signin'); setError(''); setMessage(''); }} className="w-full text-center text-xs font-medium text-stone-600 hover:text-stone-950">
                {mode === 'signin' ? 'Need an account? Register with email' : 'Already registered? Sign in'}
              </button>
            </form>
          )}

          {message && <p className="mt-3 rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">{message}</p>}
          {error && <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-800">{error}</p>}
        </div>
      )}
    </div>
  );
};

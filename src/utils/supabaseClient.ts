import {SupabaseClient, createClient} from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey: string | null = null;
let cachedProjectInfo: {url: string; projectId: string | null} | null = null;
let initPromise: Promise<SupabaseClient | null> | null = null;
let lastInitError: string | null = null;

export function extractSupabaseProjectId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') {
      return null;
    }
    const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(parsed.hostname);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export function clearDisconnectedProjectAuthStorage(
  activeUrl: string,
  storage?: Pick<Storage, 'length' | 'key' | 'removeItem'> | null,
): string[] {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!targetStorage) {
    return [];
  }

  const activeProjectId = extractSupabaseProjectId(activeUrl);
  if (!activeProjectId) {
    return [];
  }

  const removedKeys: string[] = [];
  try {
    const keysToCheck: string[] = [];
    for (let i = 0; i < targetStorage.length; i += 1) {
      const key = targetStorage.key(i);
      if (key) {
        keysToCheck.push(key);
      }
    }

    for (const key of keysToCheck) {
      const match = /^sb-([a-z0-9-]+)-auth-token/i.exec(key);
      if (match && match[1].toLowerCase() !== activeProjectId) {
        targetStorage.removeItem(key);
        removedKeys.push(key);
      }
    }
  } catch (err) {
    console.warn(
      '[supabase] Could not clear disconnected project auth storage:',
      err instanceof Error ? err.message : 'Storage unavailable',
    );
  }

  return removedKeys;
}

function readBuildTimeConfig(): {url: string; publishableKey: string} | null {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env
      : ({} as Record<string, string | undefined>);
  const url = (env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const publishableKey = (
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!url || !url.startsWith('https://') || !publishableKey) {
    return null;
  }

  return {url, publishableKey};
}

function createOrReuseClient(config: {
  url: string;
  publishableKey: string;
}): SupabaseClient | null {
  const normalizedUrl = config.url.trim().replace(/\/+$/, '');
  const normalizedKey = config.publishableKey.trim();

  if (!normalizedUrl.startsWith('https://') || !normalizedKey) {
    lastInitError = SUPABASE_NOT_CONFIGURED_ERROR;
    console.error('[supabase] Invalid Supabase URL or publishable key.');
    return null;
  }

  const nextConfigKey = `${normalizedUrl}|${normalizedKey}`;
  if (cachedClient && cachedConfigKey === nextConfigKey) {
    return cachedClient;
  }

  try {
    clearDisconnectedProjectAuthStorage(normalizedUrl);
    const projectId = extractSupabaseProjectId(normalizedUrl);
    const client = createClient(normalizedUrl, normalizedKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    cachedConfigKey = nextConfigKey;
    cachedProjectInfo = {
      url: normalizedUrl,
      projectId,
    };
    cachedClient = client;
    lastInitError = null;
    return cachedClient;
  } catch (err) {
    lastInitError =
      err instanceof Error
        ? err.message
        : 'Failed to initialize Supabase client.';
    console.error('[supabase] Client initialization error:', lastInitError);
    return null;
  }
}

export function getConnectedSupabaseProject(): {
  url: string;
  projectId: string | null;
} | null {
  return cachedProjectInfo;
}

export function getSupabaseInitError(): string | null {
  return lastInitError;
}

export function resetSupabaseClientForTests(): void {
  cachedClient = null;
  cachedConfigKey = null;
  cachedProjectInfo = null;
  initPromise = null;
  lastInitError = null;
}

export function getSyncSupabaseClient(): SupabaseClient | null {
  const config = readBuildTimeConfig();
  if (!config) {
    if (!cachedClient && !lastInitError) {
      lastInitError = SUPABASE_NOT_CONFIGURED_ERROR;
    }
    return cachedClient;
  }

  return createOrReuseClient(config);
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (cachedClient) {
    return cachedClient;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const response = await fetch('/api/supabase-config');
      if (response.ok) {
        const data = (await response.json()) as {
          configured?: boolean;
          url?: unknown;
          publishableKey?: unknown;
        };
        if (
          typeof data.url === 'string' &&
          data.url.startsWith('https://') &&
          typeof data.publishableKey === 'string' &&
          data.publishableKey.length > 0
        ) {
          return createOrReuseClient({
            url: data.url,
            publishableKey: data.publishableKey,
          });
        }
        if (data.configured === false) {
          console.warn(
            '[supabase] /api/supabase-config returned configured: false; checking build-time Vite config fallback.',
          );
        }
      } else {
        console.warn(
          `[supabase] /api/supabase-config returned HTTP ${response.status}; checking build-time Vite config fallback.`,
        );
      }
    } catch (err) {
      console.warn(
        '[supabase] Could not reach /api/supabase-config; checking build-time Vite config fallback:',
        err instanceof Error ? err.message : 'Fetch error',
      );
    } finally {
      initPromise = null;
    }

    const fallbackClient = getSyncSupabaseClient();
    if (!fallbackClient) {
      lastInitError = SUPABASE_NOT_CONFIGURED_ERROR;
      console.error('[supabase]', SUPABASE_NOT_CONFIGURED_ERROR);
    }
    return fallbackClient;
  })();

  return initPromise;
}

export const SUPABASE_NOT_CONFIGURED_ERROR =
  'Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_*) in Settings -> Secrets.';

import {SupabaseClient, createClient} from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey: string | null = null;
let cachedProjectInfo: {url: string; projectId: string | null} | null = null;
let initPromise: Promise<SupabaseClient | null> | null = null;

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
  } catch {
    // Ignore storage access errors
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
}): SupabaseClient {
  const normalizedUrl = config.url.trim().replace(/\/+$/, '');
  const normalizedKey = config.publishableKey.trim();
  const nextConfigKey = `${normalizedUrl}|${normalizedKey}`;

  if (cachedClient && cachedConfigKey === nextConfigKey) {
    return cachedClient;
  }

  clearDisconnectedProjectAuthStorage(normalizedUrl);
  cachedConfigKey = nextConfigKey;
  cachedProjectInfo = {
    url: normalizedUrl,
    projectId: extractSupabaseProjectId(normalizedUrl),
  };
  cachedClient = createClient(normalizedUrl, normalizedKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cachedClient;
}

export function getConnectedSupabaseProject(): {
  url: string;
  projectId: string | null;
} | null {
  return cachedProjectInfo;
}

export function getSyncSupabaseClient(): SupabaseClient | null {
  const config = readBuildTimeConfig();
  if (!config) {
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
      }
    } catch {
      // Fall back to build-time Vite env if /api/supabase-config is unreachable
    } finally {
      initPromise = null;
    }

    return getSyncSupabaseClient();
  })();

  return initPromise;
}

export const SUPABASE_NOT_CONFIGURED_ERROR =
  'Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_*) in Settings -> Secrets.';

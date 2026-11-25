import {SupabaseClient, createClient} from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let initPromise: Promise<SupabaseClient | null> | null = null;

function readBuildTimeConfig(): {url: string; publishableKey: string} | null {
  const url = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const publishableKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!url || !url.startsWith('https://') || !publishableKey) {
    return null;
  }

  return {url, publishableKey};
}

export function getSyncSupabaseClient(): SupabaseClient | null {
  if (cachedClient) {
    return cachedClient;
  }

  const config = readBuildTimeConfig();
  if (!config) {
    return null;
  }

  cachedClient = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cachedClient;
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
          cachedClient = createClient(data.url, data.publishableKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
            },
          });
          return cachedClient;
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
  'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Settings -> Secrets.';

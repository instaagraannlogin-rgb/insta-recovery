export interface AuthUser {
  id: string;
  email: string;
}

export interface AppSession {
  user: AuthUser;
  token: string;
}

export interface ContactSubmissionRecord {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone_number: string;
  message: string;
  created_at: string;
}

export async function apiRequest<T>(
  url: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
  } = {},
): Promise<{ok: true; data: T} | {ok: false; status: number; error: string}> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const parsed = (await response.json().catch(() => null)) as
      | (T & {error?: string})
      | null;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error:
          (parsed && typeof parsed.error === 'string' && parsed.error) ||
          `Request failed (HTTP ${response.status}).`,
      };
    }

    return {
      ok: true,
      data: (parsed ?? {}) as T,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error:
        err instanceof Error && err.message
          ? err.message
          : 'Network error while connecting to server.',
    };
  }
}

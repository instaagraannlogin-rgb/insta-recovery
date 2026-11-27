import {fromSupabaseUrl} from '@supabase/server';
import {createContextClient, verifyCredentials} from '@supabase/server/core';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

dotenv.config({override: true});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID_PATTERN = /^[a-z0-9-]+$/i;
const ALLOWED_RECOVERY_EVENT_TYPES = new Set([
  'recovery_requested',
  'otp_verified',
  'password_changed',
]);

export function resolvePublicSupabaseConfig(): {
  url: string;
  publishableKey: string;
} | null {
  const rawUrl = (
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    ''
  ).replace(/\/+$/, '');
  const projectId = process.env.SUPABASE_PROJECT_ID?.trim() || '';
  const url =
    rawUrl ||
    (projectId && PROJECT_ID_PATTERN.test(projectId)
      ? `https://${projectId}.supabase.co`
      : '');
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    '';

  if (!url || !url.startsWith('https://') || !publishableKey) {
    return null;
  }

  return {url, publishableKey};
}

function buildServerSupabaseEnv(config: {
  url: string;
  publishableKey: string;
}) {
  const jwksUrl =
    process.env.SUPABASE_JWKS_URL?.trim() ||
    `${config.url}/auth/v1/.well-known/jwks.json`;
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  return {
    url: config.url,
    publishableKeys: {default: config.publishableKey},
    ...(secretKey ? {secretKeys: {default: secretKey}} : {}),
    jwksUrl,
  };
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}

const FORMSP_ID_PATTERN = /^[a-z0-9_-]{3,64}$/i;
const SENSITIVE_FIELD_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'otp',
  'code',
  'token',
  'secret',
  'apikey',
  'apiKey',
]);

let cachedFormsparkFormId: string | null = null;
let cachedFormsparkApiKey: string | null = null;

export function resetFormsparkCacheForTests(): void {
  cachedFormsparkFormId = null;
  cachedFormsparkApiKey = null;
}

export function resolveFormsparkConfig(): {
  configured: boolean;
  formId: string | null;
  hasApiKey: boolean;
} {
  const rawFormId = process.env.FORMSPARK_FORM_ID?.trim() || '';
  const formId =
    rawFormId && FORMSP_ID_PATTERN.test(rawFormId) ? rawFormId : null;
  const apiKey = process.env.FORMSPARK_API_KEY?.trim() || '';

  return {
    configured: Boolean(formId || apiKey),
    formId,
    hasApiKey: Boolean(apiKey),
  };
}

export function validateContactPayloadForFormspark(body: unknown):
  | {
      ok: true;
      data: {
        name: string;
        email: string;
        phoneNumber: string;
        message: string;
      };
    }
  | {ok: false; error: string} {
  const record =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  for (const key of Object.keys(record)) {
    if (SENSITIVE_FIELD_KEYS.has(key)) {
      return {
        ok: false,
        error:
          'Sensitive credentials (passwords, OTPs, verification codes, or tokens) must not be forwarded to Formspark.',
      };
    }
  }

  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const email = typeof record.email === 'string' ? record.email.trim() : '';
  const phoneNumber =
    typeof record.phoneNumber === 'string' ? record.phoneNumber.trim() : '';
  const message =
    typeof record.message === 'string' ? record.message.trim() : '';

  if (name.length < 2 || name.length > 80) {
    return {ok: false, error: 'Name must be between 2 and 80 characters.'};
  }
  if (email.length < 5 || email.length > 120 || !email.includes('@')) {
    return {ok: false, error: 'A valid email address is required.'};
  }
  if (phoneNumber.length > 30) {
    return {ok: false, error: 'Phone number must be 30 characters or fewer.'};
  }
  if (message.length < 5 || message.length > 2000) {
    return {
      ok: false,
      error: 'Message must be between 5 and 2000 characters.',
    };
  }

  return {
    ok: true,
    data: {name, email, phoneNumber, message},
  };
}

function extractEntityList(payload: unknown, nestedKeys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object',
    );
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const obj = payload as Record<string, unknown>;
  for (const key of nestedKeys) {
    const candidate = obj[key];
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object',
      );
    }
  }
  return [];
}

async function resolveFormsparkFormId(): Promise<
  {ok: true; formId: string} | {ok: false; status: number; error: string}
> {
  const {formId: envFormId} = resolveFormsparkConfig();
  if (envFormId) {
    return {ok: true, formId: envFormId};
  }

  const apiKey = process.env.FORMSPARK_API_KEY?.trim() || '';
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error:
        'Formspark is not configured on the server. Add FORMSPARK_API_KEY (or FORMSPARK_FORM_ID) in Settings -> Secrets.',
    };
  }

  if (cachedFormsparkFormId && cachedFormsparkApiKey === apiKey) {
    return {ok: true, formId: cachedFormsparkFormId};
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  try {
    const wsRes = await fetch('https://api.formspark.io/public/v1/workspaces', {
      headers,
    });

    if (wsRes.ok) {
      const wsJson = (await wsRes.json().catch(() => null)) as unknown;
      const workspaces = extractEntityList(wsJson, [
        'workspaces',
        'data',
        'items',
      ]);
      const workspaceId =
        workspaces.find((ws) => typeof ws.id === 'string')?.id ?? '';

      if (typeof workspaceId === 'string' && workspaceId) {
        const formsRes = await fetch(
          `https://api.formspark.io/public/v1/forms?workspaceId=${encodeURIComponent(workspaceId)}`,
          {headers},
        );
        if (formsRes.ok) {
          const formsJson = (await formsRes.json().catch(() => null)) as unknown;
          const forms = extractEntityList(formsJson, ['forms', 'data', 'items']);
          const existingId = forms.find((f) => typeof f.id === 'string')?.id;
          if (typeof existingId === 'string' && FORMSP_ID_PATTERN.test(existingId)) {
            cachedFormsparkFormId = existingId;
            cachedFormsparkApiKey = apiKey;
            return {ok: true, formId: existingId};
          }

          const createRes = await fetch(
            'https://api.formspark.io/public/v1/forms',
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
                workspaceId,
                name: 'Website Contact Submissions',
              }),
            },
          );
          if (createRes.ok) {
            const created = (await createRes.json().catch(() => null)) as
              | {id?: unknown; data?: {id?: unknown}}
              | null;
            const createdId =
              (typeof created?.id === 'string' && created.id) ||
              (typeof created?.data?.id === 'string' && created.data.id) ||
              '';
            if (createdId && FORMSP_ID_PATTERN.test(createdId)) {
              cachedFormsparkFormId = createdId;
              cachedFormsparkApiKey = apiKey;
              return {ok: true, formId: createdId};
            }
          }
        }
      }
    }

    const directFormsRes = await fetch(
      'https://api.formspark.io/public/v1/forms',
      {headers},
    );
    if (directFormsRes.ok) {
      const formsJson = (await directFormsRes
        .json()
        .catch(() => null)) as unknown;
      const forms = extractEntityList(formsJson, ['forms', 'data', 'items']);
      const existingId = forms.find((f) => typeof f.id === 'string')?.id;
      if (typeof existingId === 'string' && FORMSP_ID_PATTERN.test(existingId)) {
        cachedFormsparkFormId = existingId;
        cachedFormsparkApiKey = apiKey;
        return {ok: true, formId: existingId};
      }
    }

    return {
      ok: false,
      status: 502,
      error:
        'Unable to resolve a Formspark form ID automatically. Set FORMSPARK_FORM_ID in Settings -> Secrets.',
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error:
        err instanceof Error
          ? `Formspark lookup failed: ${err.message}`
          : 'Formspark lookup failed.',
    };
  }
}

export function createApp() {
  const app = express();
  app.use(express.json({limit: '16kb'}));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({status: 'ok'});
  });

  app.get('/api/supabase-config', (_req, res) => {
    const config = resolvePublicSupabaseConfig();
    if (!config) {
      res.status(200).json({
        configured: false,
        url: null,
        publishableKey: null,
      });
      return;
    }

    res.status(200).json({
      configured: true,
      ...config,
    });
  });

  app.get('/api/account/me', async (req, res) => {
    const config = resolvePublicSupabaseConfig();
    if (!config) {
      res.status(503).json({error: 'Supabase is not configured on the server.'});
      return;
    }

    const token = extractBearerToken(req.header('authorization'));
    const env = buildServerSupabaseEnv(config);
    const {data: auth, error} = await verifyCredentials(
      {token, apikey: null},
      {
        auth: 'user',
        issuer: fromSupabaseUrl(config.url),
        env,
      },
    );

    if (error || !auth) {
      res.status(error?.status || 401).json({
        error: error?.message || 'Unauthorized',
      });
      return;
    }

    const supabase = createContextClient({
      auth: {token: auth.token, keyName: auth.keyName},
      env,
    });
    const {data: profile, error: profileError} = await supabase
      .from('profiles')
      .select('id, email, created_at, updated_at')
      .eq('id', auth.userClaims?.id || '')
      .maybeSingle();

    if (profileError) {
      res.status(400).json({error: profileError.message});
      return;
    }

    res.status(200).json({
      user: auth.userClaims,
      profile,
    });
  });

  app.post('/api/recovery-events', async (req, res) => {
    const body =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};

    if (
      'password' in body ||
      'otp' in body ||
      'code' in body ||
      'token' in body
    ) {
      res.status(400).json({
        error:
          'Sensitive credentials (passwords, OTPs, verification codes, or tokens) must not be stored in custom database tables.',
      });
      return;
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const eventType =
      typeof body.eventType === 'string' ? body.eventType.trim() : '';

    if (email.length < 5 || email.length > 120 || !email.includes('@')) {
      res.status(400).json({error: 'A valid email address is required.'});
      return;
    }

    if (!ALLOWED_RECOVERY_EVENT_TYPES.has(eventType)) {
      res.status(400).json({error: 'Invalid recovery event type.'});
      return;
    }

    const config = resolvePublicSupabaseConfig();
    if (!config) {
      res.status(503).json({error: 'Supabase is not configured on the server.'});
      return;
    }

    const env = buildServerSupabaseEnv(config);
    const token = extractBearerToken(req.header('authorization'));
    let userId: string | null = null;
    let verifiedToken: string | undefined;

    if (token) {
      const {data: auth, error} = await verifyCredentials(
        {token, apikey: null},
        {
          auth: 'user',
          issuer: fromSupabaseUrl(config.url),
          env,
        },
      );
      if (error || !auth) {
        res.status(error?.status || 401).json({
          error: error?.message || 'Invalid session token.',
        });
        return;
      }
      userId = auth.userClaims?.id ?? null;
      verifiedToken = auth.token ?? undefined;
    }

    const supabase = createContextClient({
      ...(verifiedToken ? {auth: {token: verifiedToken}} : {}),
      env,
    });
    const {error} = await supabase.from('recovery_events').insert([
      {
        user_id: userId,
        email,
        event_type: eventType,
      },
    ]);

    if (error) {
      res.status(400).json({error: error.message});
      return;
    }

    res.status(201).json({ok: true});
  });

  app.post('/api/formspark/submit', async (req, res) => {
    const config = resolvePublicSupabaseConfig();
    if (!config) {
      res.status(503).json({error: 'Supabase is not configured on the server.'});
      return;
    }

    const token = extractBearerToken(req.header('authorization'));
    const env = buildServerSupabaseEnv(config);
    const {data: auth, error: authError} = await verifyCredentials(
      {token, apikey: null},
      {
        auth: 'user',
        issuer: fromSupabaseUrl(config.url),
        env,
      },
    );

    if (authError || !auth) {
      res.status(authError?.status || 401).json({
        error: authError?.message || 'Unauthorized',
      });
      return;
    }

    const validation = validateContactPayloadForFormspark(req.body);
    if (validation.ok === false) {
      res.status(400).json({error: validation.error});
      return;
    }

    const resolved = await resolveFormsparkFormId();
    if (resolved.ok === false) {
      res.status(resolved.status).json({error: resolved.error});
      return;
    }

    try {
      const submitRes = await fetch(
        `https://submit-form.com/${encodeURIComponent(resolved.formId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            name: validation.data.name,
            email: validation.data.email,
            phone_number: validation.data.phoneNumber,
            message: validation.data.message,
            user_id: auth.userClaims?.id ?? null,
          }),
        },
      );

      if (!submitRes.ok) {
        res.status(502).json({
          error: `Formspark rejected the submission (HTTP ${submitRes.status}).`,
        });
        return;
      }

      res.status(201).json({ok: true, formId: resolved.formId});
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? `Formspark request failed: ${err.message}`
            : 'Formspark request failed.',
      });
    }
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

if (process.argv[1] === __filename) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

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

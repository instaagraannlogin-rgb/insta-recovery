import 'dotenv/config';
import {createClient} from '@supabase/supabase-js';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  LINK_SENT_MESSAGE,
  validateAccountInput,
  validatePasswordResetInput,
  validateVerificationCode,
} from './src/utils/recovery.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const PROJECT_ID_PATTERN = /^[a-z0-9-]+$/i;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RESET_TOKEN_SECRET =
  process.env.RECOVERY_TOKEN_SECRET?.trim() ||
  crypto.randomBytes(32).toString('hex');

export function createResetToken(account: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      account,
      exp: Date.now() + RESET_TOKEN_TTL_MS,
    }),
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', RESET_TOKEN_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyResetToken(
  token: string,
  expectedAccount: string,
): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [payload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', RESET_TOKEN_SECRET)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return false;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as {account?: unknown; exp?: unknown};
    return (
      typeof parsed.account === 'string' &&
      parsed.account === expectedAccount &&
      typeof parsed.exp === 'number' &&
      parsed.exp > Date.now()
    );
  } catch {
    return false;
  }
}

export function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function resolveSupabaseConfig(): {
  url: string;
  key: string;
  table: string;
} | null {
  const rawUrl = process.env.SUPABASE_URL?.trim() || '';
  const projectId = process.env.SUPABASE_PROJECT_ID?.trim() || '';
  const url =
    rawUrl ||
    (projectId && PROJECT_ID_PATTERN.test(projectId)
      ? `https://${projectId}.supabase.co`
      : '');
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    '';
  const rawTable =
    process.env.SUPABASE_RECOVERY_TABLE?.trim() || 'recovery_requests';
  const table = TABLE_NAME_PATTERN.test(rawTable)
    ? rawTable
    : 'recovery_requests';

  if (!url || !key) {
    return null;
  }

  return {url, key, table};
}

export function createApp() {
  const app = express();
  app.use(express.json({limit: '16kb'}));

  app.post('/api/recovery', async (req, res) => {
    const body = req.body as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({error: 'Invalid request payload.'});
      return;
    }

    const account = (body as {account?: unknown}).account;
    if (typeof account !== 'string') {
      res
        .status(400)
        .json({error: 'Please enter your username or email address.'});
      return;
    }

    const validationError = validateAccountInput(account);
    if (validationError) {
      res.status(400).json({error: validationError});
      return;
    }

    const config = resolveSupabaseConfig();
    if (!config) {
      res.status(503).json({
        error:
          'Supabase backend is not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Secrets.',
      });
      return;
    }

    const supabase = createClient(config.url, config.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const trimmedAccount = account.trim();
    const {error} = await supabase
      .from(config.table)
      .insert([{account: trimmedAccount}]);

    if (error) {
      console.error('Supabase recovery insert failed:', error.code || error.message);
      res.status(502).json({
        error:
          'Unable to save recovery request to Supabase. Ensure the recovery_requests table and insert policy exist.',
      });
      return;
    }

    res.status(201).json({
      message: LINK_SENT_MESSAGE,
      resetToken: createResetToken(trimmedAccount),
    });
  });

  app.post('/api/password-reset', async (req, res) => {
    const body = req.body as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({error: 'Invalid request payload.'});
      return;
    }

    const {account, verificationCode, newPassword, confirmPassword, resetToken} =
      body as {
        account?: unknown;
        verificationCode?: unknown;
        newPassword?: unknown;
        confirmPassword?: unknown;
        resetToken?: unknown;
      };

    if (
      typeof account !== 'string' ||
      typeof verificationCode !== 'string' ||
      typeof newPassword !== 'string' ||
      typeof confirmPassword !== 'string' ||
      typeof resetToken !== 'string'
    ) {
      res.status(400).json({error: 'Missing required password reset fields.'});
      return;
    }

    const accountError = validateAccountInput(account);
    if (accountError) {
      res.status(400).json({error: accountError});
      return;
    }

    const codeError = validateVerificationCode(verificationCode);
    if (codeError) {
      res.status(400).json({error: codeError});
      return;
    }

    const passwordValidation = validatePasswordResetInput(
      newPassword,
      confirmPassword,
    );
    if (!passwordValidation.isValid) {
      res.status(400).json({
        error:
          passwordValidation.newPasswordError ||
          passwordValidation.confirmPasswordError,
      });
      return;
    }

    const trimmedAccount = account.trim();
    if (!verifyResetToken(resetToken, trimmedAccount)) {
      res
        .status(403)
        .json({error: 'Invalid or expired password reset session.'});
      return;
    }

    const config = resolveSupabaseConfig();
    if (!config) {
      res.status(503).json({
        error:
          'Supabase backend is not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Secrets.',
      });
      return;
    }

    const supabase = createClient(config.url, config.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const passwordHash = hashPasswordScrypt(newPassword);
    const {data, error} = await supabase
      .from(config.table)
      .update({
        password_hash: passwordHash,
        reset_completed_at: new Date().toISOString(),
      })
      .eq('account', trimmedAccount)
      .select('id');

    if (error) {
      console.error(
        'Supabase password reset update failed:',
        error.code || error.message,
      );
      res.status(502).json({
        error:
          'Unable to update recovery record in Supabase. Ensure the password_hash/reset_completed_at columns and UPDATE/SELECT policies exist.',
      });
      return;
    }

    if (!data || data.length === 0) {
      res.status(404).json({
        error: 'No matching recovery record found in Supabase.',
      });
      return;
    }

    res.status(200).json({message: 'Password updated successfully.'});
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

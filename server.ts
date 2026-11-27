import crypto from 'node:crypto';
import dotenv from 'dotenv';
import express, {Request, Response} from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

dotenv.config({override: true});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FORMSPARK_ID_PATTERN = /^[a-z0-9_-]{3,64}$/i;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const IN_MEMORY_SESSION_SECRET = crypto.randomBytes(32);

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

export interface AccountRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface SubmissionRecord {
  id: string;
  formspark_id?: string | null;
  user_id: string;
  name: string;
  email: string;
  phone_number: string;
  message: string;
  created_at: string;
}

const usersByEmail = new Map<string, AccountRecord>();
const usersById = new Map<string, AccountRecord>();
const submissionsById = new Map<string, SubmissionRecord>();
const revokedTokenIds = new Set<string>();

export function resetBackendStoresForTests(): void {
  usersByEmail.clear();
  usersById.clear();
  submissionsById.clear();
  revokedTokenIds.clear();
}

function getSessionSecret(): string | Buffer {
  const configured = process.env.SESSION_SECRET?.trim();
  return configured && configured.length >= 16
    ? configured
    : IN_MEMORY_SESSION_SECRET;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) {
    return false;
  }
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

interface SessionTokenPayload {
  jti: string;
  sub: string;
  email: string;
  exp: number;
}

function issueSessionToken(user: AccountRecord): string {
  const payload: SessionTokenPayload = {
    jti: crypto.randomUUID(),
    sub: user.id,
    email: user.email,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(
  token: string | null,
): SessionTokenPayload | null {
  if (!token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as SessionTokenPayload;
    if (
      !parsed ||
      typeof parsed.sub !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.jti !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (Date.now() > parsed.exp || revokedTokenIds.has(parsed.jti)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}

function requireAuthenticatedUser(
  req: Request,
  res: Response,
): AccountRecord | null {
  const token = extractBearerToken(req.header('authorization'));
  const claims = verifySessionToken(token);
  if (!claims) {
    res.status(401).json({error: 'Unauthorized. Please sign in again.'});
    return null;
  }

  const user = usersById.get(claims.sub);
  if (!user) {
    res
      .status(401)
      .json({error: 'Session is no longer active. Please sign in again.'});
    return null;
  }

  return user;
}

export function resolveFormsparkConfig(): {
  configured: boolean;
  formId: string | null;
  hasApiKey: boolean;
} {
  const rawFormId = process.env.FORMSPARK_FORM_ID?.trim() || '';
  const formId =
    rawFormId && FORMSPARK_ID_PATTERN.test(rawFormId) ? rawFormId : null;
  const apiKey = process.env.FORMSPARK_API_KEY?.trim() || '';

  return {
    configured: Boolean(formId),
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

function sanitizeFormsparkPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!SENSITIVE_FIELD_KEYS.has(key)) {
      clean[key] = value;
    }
  }
  return clean;
}

async function submitToFormspark(
  formId: string,
  payload: Record<string, unknown>,
): Promise<{ok: true; remoteId: string | null} | {ok: false; status: number; error: string}> {
  const cleanPayload = sanitizeFormsparkPayload(payload);
  try {
    const response = await fetch(
      `https://submit-form.com/${encodeURIComponent(formId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(cleanPayload),
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        error: `Formspark rejected the submission (HTTP ${response.status}).`,
      };
    }

    const body = (await response.json().catch(() => null)) as
      | {id?: unknown; data?: {id?: unknown}}
      | null;
    const remoteId =
      (typeof body?.id === 'string' && body.id) ||
      (typeof body?.data?.id === 'string' && body.data.id) ||
      null;

    return {ok: true, remoteId};
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error:
        err instanceof Error
          ? `Formspark request failed: ${err.message}`
          : 'Formspark request failed.',
    };
  }
}

async function fetchFormsparkContactSubmissions(
  formId: string,
  apiKey: string,
  userId: string,
): Promise<SubmissionRecord[]> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
  const endpoints = [
    `https://api.formspark.io/public/v1/submissions?formId=${encodeURIComponent(formId)}`,
    `https://api.formspark.io/public/v1/forms/${encodeURIComponent(formId)}/submissions`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {headers});
      if (!res.ok) continue;

      const json = (await res.json().catch(() => null)) as unknown;
      const rawItems = Array.isArray(json)
        ? json
        : json && typeof json === 'object'
          ? ((json as Record<string, unknown>).submissions ??
              (json as Record<string, unknown>).data ??
              (json as Record<string, unknown>).items ??
              [])
          : [];

      if (!Array.isArray(rawItems)) continue;

      const mapped: SubmissionRecord[] = [];
      for (const raw of rawItems) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        const dataObj =
          item.data && typeof item.data === 'object'
            ? (item.data as Record<string, unknown>)
            : item;
        const itemUserId =
          typeof dataObj.user_id === 'string' ? dataObj.user_id : '';
        const submissionType =
          typeof dataObj.submission_type === 'string'
            ? dataObj.submission_type
            : 'contact_submission';
        if (
          submissionType !== 'contact_submission' ||
          itemUserId !== userId
        ) {
          continue;
        }
        const id =
          typeof item.id === 'string'
            ? item.id
            : typeof dataObj.id === 'string'
              ? dataObj.id
              : '';
        const name = typeof dataObj.name === 'string' ? dataObj.name : '';
        const email = typeof dataObj.email === 'string' ? dataObj.email : '';
        const message =
          typeof dataObj.message === 'string' ? dataObj.message : '';
        if (!id || !name || !email || !message) continue;

        mapped.push({
          id,
          formspark_id: id,
          user_id: itemUserId,
          name,
          email,
          phone_number:
            typeof dataObj.phone_number === 'string'
              ? dataObj.phone_number
              : '',
          message,
          created_at:
            typeof item.createdAt === 'string'
              ? item.createdAt
              : typeof item.created_at === 'string'
                ? item.created_at
                : new Date().toISOString(),
        });
      }
      return mapped;
    } catch {
      // Fall through to next endpoint or local session store
    }
  }

  return [];
}

async function deleteFormsparkRemoteSubmission(
  remoteId: string,
  apiKey: string,
): Promise<void> {
  try {
    await fetch(
      `https://api.formspark.io/public/v1/submissions/${encodeURIComponent(remoteId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      },
    );
  } catch {
    // Best-effort remote deletion
  }
}

export function createApp() {
  const app = express();
  app.use(express.json({limit: '16kb'}));

  app.get('/api/health', (_req, res) => {
    const formspark = resolveFormsparkConfig();
    res.status(200).json({
      status: 'ok',
      formspark: {
        configured: formspark.configured,
        formId: formspark.formId,
        hasApiKey: formspark.hasApiKey,
      },
    });
  });

  app.post('/api/auth/signup', async (req, res) => {
    const body =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (email.length < 5 || email.length > 64 || !email.includes('@')) {
      res.status(400).json({error: 'Please enter a valid email address.'});
      return;
    }
    if (password.length < 6) {
      res
        .status(400)
        .json({error: 'Password must be at least 6 characters long.'});
      return;
    }
    if (usersByEmail.has(email)) {
      res
        .status(409)
        .json({error: 'An account with this email address already exists.'});
      return;
    }

    const user: AccountRecord = {
      id: crypto.randomUUID(),
      email,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    usersByEmail.set(email, user);
    usersById.set(user.id, user);

    const {formId} = resolveFormsparkConfig();
    if (formId) {
      void submitToFormspark(formId, {
        submission_type: 'account_registered',
        email: user.email,
        user_id: user.id,
        submitted_at: user.createdAt,
      });
    }

    const token = issueSessionToken(user);
    res.status(201).json({
      user: {id: user.id, email: user.email},
      token,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const body =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      res.status(400).json({error: 'Email and password are required.'});
      return;
    }

    const user = usersByEmail.get(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({
        error:
          'Invalid email or password. Please check your credentials and try again.',
      });
      return;
    }

    const token = issueSessionToken(user);
    res.status(200).json({
      user: {id: user.id, email: user.email},
      token,
    });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = requireAuthenticatedUser(req, res);
    if (!user) return;
    res.status(200).json({
      user: {id: user.id, email: user.email},
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractBearerToken(req.header('authorization'));
    const claims = verifySessionToken(token);
    if (claims) {
      revokedTokenIds.add(claims.jti);
    }
    res.status(200).json({ok: true});
  });

  app.post('/api/auth/recovery/request', async (req, res) => {
    const body =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (email.length < 5 || email.length > 64 || !email.includes('@')) {
      res.status(400).json({error: 'Please enter a valid email address.'});
      return;
    }

    const {formId} = resolveFormsparkConfig();
    if (formId) {
      const result = await submitToFormspark(formId, {
        submission_type: 'recovery_requested',
        email,
        submitted_at: new Date().toISOString(),
      });
      if (result.ok === false) {
        console.warn('[formspark] Recovery notice failed:', result.error);
      }
    }

    res.status(200).json({
      ok: true,
      message:
        'If an account exists for this email, a password reset link has been sent.',
    });
  });

  app.post('/api/auth/recovery/verify', async (req, res) => {
    const body =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const otp = typeof body.otp === 'string' ? body.otp.trim() : '';

    if (email.length < 5 || email.length > 64 || !email.includes('@')) {
      res.status(400).json({error: 'Please enter a valid email address.'});
      return;
    }
    if (!/^\d{8}$/.test(otp)) {
      res
        .status(400)
        .json({error: 'Verification code must be exactly 8 digits.'});
      return;
    }

    const {formId} = resolveFormsparkConfig();
    if (formId) {
      void submitToFormspark(formId, {
        submission_type: 'otp_verified',
        email,
        submitted_at: new Date().toISOString(),
      });
    }

    res.status(200).json({verified: true, email});
  });

  app.post('/api/auth/password-reset', async (req, res) => {
    const user = requireAuthenticatedUser(req, res);
    if (!user) return;

    const body =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
    const currentPassword =
      typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword =
      typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword) {
      res.status(400).json({error: 'Please enter your current password.'});
      return;
    }
    if (newPassword.length < 6) {
      res
        .status(400)
        .json({error: 'Password must be at least 6 characters long.'});
      return;
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({error: 'Current password is incorrect.'});
      return;
    }

    user.passwordHash = hashPassword(newPassword);

    const {formId} = resolveFormsparkConfig();
    if (formId) {
      void submitToFormspark(formId, {
        submission_type: 'password_changed',
        email: user.email,
        user_id: user.id,
        submitted_at: new Date().toISOString(),
      });
    }

    res.status(200).json({ok: true});
  });

  app.get('/api/submissions', async (req, res) => {
    const user = requireAuthenticatedUser(req, res);
    if (!user) return;

    const localItems = Array.from(submissionsById.values()).filter(
      (item) => item.user_id === user.id,
    );

    const {formId} = resolveFormsparkConfig();
    const apiKey = process.env.FORMSPARK_API_KEY?.trim() || '';
    if (formId && apiKey) {
      const remoteItems = await fetchFormsparkContactSubmissions(
        formId,
        apiKey,
        user.id,
      );
      const seen = new Set(
        localItems.map((item) => item.formspark_id || item.id),
      );
      for (const remote of remoteItems) {
        if (!seen.has(remote.id)) {
          localItems.push(remote);
        }
      }
    }

    localItems.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    res.status(200).json({submissions: localItems});
  });

  app.post('/api/submissions', async (req, res) => {
    const user = requireAuthenticatedUser(req, res);
    if (!user) return;

    const validation = validateContactPayloadForFormspark(req.body);
    if (validation.ok === false) {
      res.status(400).json({error: validation.error});
      return;
    }

    const {formId} = resolveFormsparkConfig();
    if (!formId) {
      res.status(503).json({
        error:
          'Formspark is not configured on the server. Set FORMSPARK_FORM_ID in Settings -> Secrets.',
      });
      return;
    }

    const createdAt = new Date().toISOString();
    const result = await submitToFormspark(formId, {
      submission_type: 'contact_submission',
      name: validation.data.name,
      email: validation.data.email,
      phone_number: validation.data.phoneNumber,
      message: validation.data.message,
      user_id: user.id,
      submitted_at: createdAt,
    });

    if (result.ok === false) {
      res.status(result.status).json({error: result.error});
      return;
    }

    const record: SubmissionRecord = {
      id: result.remoteId || crypto.randomUUID(),
      formspark_id: result.remoteId,
      user_id: user.id,
      name: validation.data.name,
      email: validation.data.email,
      phone_number: validation.data.phoneNumber,
      message: validation.data.message,
      created_at: createdAt,
    };
    submissionsById.set(record.id, record);

    res.status(201).json({
      ok: true,
      formId,
      submission: record,
    });
  });

  app.delete('/api/submissions/:id', async (req, res) => {
    const user = requireAuthenticatedUser(req, res);
    if (!user) return;

    const id = (req.params.id || '').trim();
    if (!id) {
      res.status(400).json({error: 'Submission ID is required.'});
      return;
    }

    const existing = submissionsById.get(id);
    if (existing && existing.user_id !== user.id) {
      res.status(403).json({error: 'You cannot delete another user’s submission.'});
      return;
    }

    const remoteId = existing?.formspark_id || id;
    submissionsById.delete(id);

    const apiKey = process.env.FORMSPARK_API_KEY?.trim() || '';
    if (apiKey && remoteId) {
      await deleteFormsparkRemoteSubmission(remoteId, apiKey);
    }

    res.status(200).json({ok: true});
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

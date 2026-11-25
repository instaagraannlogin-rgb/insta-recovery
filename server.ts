import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID_PATTERN = /^[a-z0-9-]+$/i;

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

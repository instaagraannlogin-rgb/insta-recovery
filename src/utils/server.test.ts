import test from 'node:test';
import assert from 'node:assert/strict';
import type {AddressInfo} from 'node:net';
import {createApp} from '../../server.ts';

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = createApp();
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const {port} = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('GET /api/health returns 200 ok', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {status: string};
    assert.equal(body.status, 'ok');
  });
});

test('server does not expose database password or reset-token storage endpoints', async () => {
  await withServer(async (baseUrl) => {
    const recoveryRes = await fetch(`${baseUrl}/api/recovery`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({account: 'user@example.com'}),
    });
    assert.equal(recoveryRes.status, 404);

    const resetRes = await fetch(`${baseUrl}/api/password-reset`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({account: 'user@example.com'}),
    });
    assert.equal(resetRes.status, 404);
  });
});

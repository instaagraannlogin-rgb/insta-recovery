import test from 'node:test';
import assert from 'node:assert/strict';
import type {AddressInfo} from 'node:net';
import {
  createApp,
  resetBackendStoresForTests,
  resolveFormsparkConfig,
  validateContactPayloadForFormspark,
} from '../../server.ts';

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  resetBackendStoresForTests();
  const app = createApp();
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const {port} = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    resetBackendStoresForTests();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('resolveFormsparkConfig reads FORMSPARK_FORM_ID and FORMSPARK_API_KEY cleanly', () => {
  const prevKey = process.env.FORMSPARK_API_KEY;
  const prevFormId = process.env.FORMSPARK_FORM_ID;

  try {
    delete process.env.FORMSPARK_API_KEY;
    delete process.env.FORMSPARK_FORM_ID;
    assert.deepEqual(resolveFormsparkConfig(), {
      configured: false,
      formId: null,
      hasApiKey: false,
    });

    process.env.FORMSPARK_FORM_ID = 'zp1JrNZlu';
    process.env.FORMSPARK_API_KEY = 'fsk_test_example';
    assert.deepEqual(resolveFormsparkConfig(), {
      configured: true,
      formId: 'zp1JrNZlu',
      hasApiKey: true,
    });

    process.env.FORMSPARK_FORM_ID = 'invalid id with spaces!';
    assert.deepEqual(resolveFormsparkConfig(), {
      configured: false,
      formId: null,
      hasApiKey: true,
    });
  } finally {
    if (prevKey === undefined) delete process.env.FORMSPARK_API_KEY;
    else process.env.FORMSPARK_API_KEY = prevKey;
    if (prevFormId === undefined) delete process.env.FORMSPARK_FORM_ID;
    else process.env.FORMSPARK_FORM_ID = prevFormId;
  }
});

test('validateContactPayloadForFormspark blocks credentials and accepts clean contact data', () => {
  const blocked = validateContactPayloadForFormspark({
    name: 'Alex Morgan',
    email: 'alex@example.com',
    message: 'Valid inquiry text',
    password: 'secret-should-not-forward',
  });
  assert.equal(blocked.ok, false);

  const blockedOtp = validateContactPayloadForFormspark({
    name: 'Alex Morgan',
    email: 'alex@example.com',
    message: 'Valid inquiry text',
    otp: '12345678',
  });
  assert.equal(blockedOtp.ok, false);

  const valid = validateContactPayloadForFormspark({
    name: 'Alex Morgan',
    email: 'alex@example.com',
    phoneNumber: '555-0100',
    message: 'Please send my invoice receipt.',
  });
  assert.deepEqual(valid, {
    ok: true,
    data: {
      name: 'Alex Morgan',
      email: 'alex@example.com',
      phoneNumber: '555-0100',
      message: 'Please send my invoice receipt.',
    },
  });
});

test('GET /api/submissions and POST /api/submissions reject unauthenticated requests', async () => {
  await withServer(async (baseUrl) => {
    const getRes = await fetch(`${baseUrl}/api/submissions`);
    assert.equal(getRes.status, 401);

    const postRes = await fetch(`${baseUrl}/api/submissions`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name: 'Alex Morgan',
        email: 'alex@example.com',
        message: 'Please send my invoice receipt.',
      }),
    });
    assert.equal(postRes.status, 401);
  });
});

test('signup, login, password reset, and Formspark submission flow work end-to-end without forwarding credentials', async () => {
  const prevFormId = process.env.FORMSPARK_FORM_ID;
  const originalFetch = globalThis.fetch;
  const formsparkCalls: Array<{url: string; body: Record<string, unknown>}> =
    [];

  process.env.FORMSPARK_FORM_ID = 'zp1JrNZlu';
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('https://submit-form.com/')) {
      const parsedBody = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      formsparkCalls.push({url, body: parsedBody});
      return new Response(JSON.stringify({id: 'fs-sub-1'}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    await withServer(async (baseUrl) => {
      const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: 'alex@example.com',
          password: 'InitialPassword1',
        }),
      });
      assert.equal(signupRes.status, 201);
      const signupJson = (await signupRes.json()) as {
        user: {id: string; email: string};
        token: string;
      };
      assert.equal(signupJson.user.email, 'alex@example.com');
      assert.ok(signupJson.token);

      const submitRes = await fetch(`${baseUrl}/api/submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${signupJson.token}`,
        },
        body: JSON.stringify({
          name: 'Alex Morgan',
          email: 'alex@example.com',
          phoneNumber: '555-0100',
          message: 'Please send my invoice receipt.',
        }),
      });
      assert.equal(submitRes.status, 201);
      const submitJson = (await submitRes.json()) as {
        formId: string;
        submission: {id: string; message: string};
      };
      assert.equal(submitJson.formId, 'zp1JrNZlu');
      assert.equal(
        submitJson.submission.message,
        'Please send my invoice receipt.',
      );

      const resetRes = await fetch(`${baseUrl}/api/auth/password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${signupJson.token}`,
        },
        body: JSON.stringify({
          currentPassword: 'InitialPassword1',
          newPassword: 'UpdatedPassword2',
        }),
      });
      assert.equal(resetRes.status, 200);

      const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: 'alex@example.com',
          password: 'InitialPassword1',
        }),
      });
      assert.equal(oldLoginRes.status, 401);

      const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: 'alex@example.com',
          password: 'UpdatedPassword2',
        }),
      });
      assert.equal(newLoginRes.status, 200);
    });

    assert.ok(formsparkCalls.length >= 2);
    for (const call of formsparkCalls) {
      assert.equal(call.url, 'https://submit-form.com/zp1JrNZlu');
      assert.equal('password' in call.body, false);
      assert.equal('currentPassword' in call.body, false);
      assert.equal('newPassword' in call.body, false);
      assert.equal('otp' in call.body, false);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (prevFormId === undefined) delete process.env.FORMSPARK_FORM_ID;
    else process.env.FORMSPARK_FORM_ID = prevFormId;
  }
});

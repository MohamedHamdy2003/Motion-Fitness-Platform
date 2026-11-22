export class ApiError extends Error {
  constructor(status, body) {
    const details = Array.isArray(body?.details)
      ? body.details.map((issue) =>
          [issue.path, issue.message].filter(Boolean).join(': '),
        )
      : [];
    const text = {
      CONTENT_ACCESS_DENIED:
        'This dashboard is available to the Motion administrator.',
      EMAIL_NOT_VERIFIED:
        'Verify your email with Motion before signing in here.',
      CONTENT_MEDIA_NOT_READY:
        'Choose a ready file from the shared media library.',
      CONFLICT:
        'The change conflicts with an existing record. Check for an existing slug.',
      NOT_FOUND: 'This item could not be found.',
    };
    super(
      text[body?.code] || body?.message || `Motion API returned ${status}.`,
    );
    this.code = body?.code;
    this.status = status;
    this.details = details;
    this.requestId = body?.requestId;
  }
}

async function request(path, { body, method = 'GET', token } = {}) {
  let res;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      'Could not reach the Motion API. Check the connection and try again.',
    );
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  if (data === null && res.status !== 204)
    throw new Error('The Motion API returned an unexpected response.');
  return data;
}

export async function login(email, password, onExpired) {
  let tokens = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  let expiresAt = Date.now() + tokens.expiresIn * 1000;
  let refresh;
  let closed = false;

  async function refreshTokens(oldAccessToken) {
    if (closed) throw new Error('This session has ended.');
    if (tokens.accessToken !== oldAccessToken) return;
    refresh ||= request('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: tokens.refreshToken },
    })
      .then((next) => {
        tokens = next;
        expiresAt = Date.now() + next.expiresIn * 1000;
      })
      .catch((error) => {
        if (error.status === 401 || error.status === 403) {
          closed = true;
          onExpired();
        }
        throw error;
      })
      .finally(() => {
        refresh = undefined;
      });
    return refresh;
  }

  async function api(path, options) {
    if (Date.now() >= expiresAt - 5000) await refreshTokens(tokens.accessToken);
    if (closed) throw new Error('This session has ended.');
    const token = tokens.accessToken;
    try {
      return await request(path, { ...options, token });
    } catch (error) {
      if (error.status !== 401) throw error;
      await refreshTokens(token);
      return request(path, { ...options, token: tokens.accessToken });
    }
  }

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      closed = true;
      tokens = {};
    }
  }

  try {
    await api('/admin/programs?limit=1');
  } catch (error) {
    await signOut().catch(() => {});
    throw error;
  }
  return { api, email, signOut };
}

export async function listAll(api, path) {
  const items = [];
  const limit = 100;
  const separator = path.includes('?') ? '&' : '?';
  for (let offset = 0; ; offset += limit) {
    const page = await api(
      `${path}${separator}limit=${limit}&offset=${offset}`,
    );
    const entries = Array.isArray(page) ? page : page.items;
    items.push(...entries);
    if (entries.length < limit) return items;
  }
}

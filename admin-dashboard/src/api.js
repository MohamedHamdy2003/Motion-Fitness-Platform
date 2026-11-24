export class ApiError extends Error {
  constructor(status, body) {
    const details = Array.isArray(body?.details)
      ? body.details.map((issue) =>
          [issue.path, issue.message].filter(Boolean).join(': '),
        )
      : [];
    const text = {
      CONTENT_ACCESS_DENIED: 'هذه البوابة مخصصة لحساب مدير النظام فقط.',
      EMAIL_NOT_VERIFIED:
        'يرجى تأكيد البريد الإلكتروني أولاً قبل تسجيل الدخول.',
      CONTENT_MEDIA_NOT_READY:
        'يرجى اختيار ملف جاهز من مكتبة الوسائط المشتركة.',
      CONFLICT:
        'يوجد تعارض مع سجل حالي. تأكد من عدم تكرار المعرّف النصي (Slug).',
      NOT_FOUND: 'العنصر المطلوب غير موجود.',
      UNAUTHENTICATED: 'بيانات الدخول غير صحيحة أو انتهت الجلسة.',
      RATE_LIMITED: 'تم تجاوز الحد المسموح من المحاولات. حاول مجدداً بعد قليل.',
    };
    super(
      text[body?.code] ||
        body?.message ||
        `تعذر تنفيذ الطلب (رمز الاستجابة ${status}).`,
    );
    this.code = body?.code;
    this.status = status;
    this.details = details;
    this.requestId = body?.requestId;
  }
}

async function request(path, { body, method = 'GET', token, signal } = {}) {
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
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error(
      'تعذر الاتصال بخادم Motion API. تحقق من الاتصال وحاول مرة أخرى.',
    );
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  if (data === null && res.status !== 204)
    throw new Error('استجاب الخادم ببيانات غير متوقعة.');
  return data;
}

const STORAGE_KEY = 'motion.admin.session.v1';

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.email !== 'string' ||
      !parsed.email ||
      typeof parsed.accessToken !== 'string' ||
      !parsed.accessToken ||
      typeof parsed.refreshToken !== 'string' ||
      !parsed.refreshToken ||
      typeof parsed.expiresAt !== 'number' ||
      !Number.isFinite(parsed.expiresAt)
    ) {
      return null;
    }
    return {
      email: parsed.email,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function writeStoredSession(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota or privacy-mode failures; in-memory session still works.
  }
}

function clearStoredSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors on cleanup.
  }
}

export function hasStoredSession() {
  return Boolean(readStoredSession());
}

function createSession({
  email,
  tokens: initialTokens,
  expiresAt: initialExpiresAt,
  onExpired,
}) {
  let tokens = {
    accessToken: initialTokens.accessToken,
    refreshToken: initialTokens.refreshToken,
  };
  let expiresAt = initialExpiresAt;
  let refresh;
  let closed = false;

  writeStoredSession({
    email,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt,
  });

  function handleStorage(event) {
    if (event.key !== STORAGE_KEY || closed) return;
    if (!event.newValue) {
      cleanup();
      onExpired?.();
      return;
    }
    const next = readStoredSession();
    if (!next || next.email !== email) {
      cleanup();
      onExpired?.();
      return;
    }
    tokens = {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
    };
    expiresAt = next.expiresAt;
  }

  function cleanup() {
    if (closed) return;
    closed = true;
    tokens = {};
    clearReferenceCache();
    window.removeEventListener('storage', handleStorage);
  }

  window.addEventListener('storage', handleStorage);

  async function refreshTokens(oldAccessToken) {
    if (closed) throw new Error('انتهت هذه الجلسة.');
    if (tokens.accessToken !== oldAccessToken) return;
    const stored = readStoredSession();
    if (
      stored &&
      stored.email === email &&
      stored.accessToken !== oldAccessToken
    ) {
      tokens = {
        accessToken: stored.accessToken,
        refreshToken: stored.refreshToken,
      };
      expiresAt = stored.expiresAt;
      return;
    }
    refresh ||= request('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: tokens.refreshToken },
    })
      .then((next) => {
        tokens = {
          accessToken: next.accessToken,
          refreshToken: next.refreshToken,
        };
        expiresAt = Date.now() + next.expiresIn * 1000;
        writeStoredSession({
          email,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt,
        });
      })
      .catch((error) => {
        if (error.status === 401 || error.status === 403) {
          cleanup();
          clearStoredSession();
          onExpired?.();
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
    if (closed) throw new Error('انتهت هذه الجلسة.');
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
      cleanup();
      clearStoredSession();
    }
  }

  function destroy() {
    cleanup();
    clearStoredSession();
  }

  return { api, email, signOut, destroy };
}

export async function login(email, password, onExpired) {
  const tokens = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  const expiresAt = Date.now() + tokens.expiresIn * 1000;
  const session = createSession({ email, tokens, expiresAt, onExpired });

  try {
    await session.api('/admin/programs?limit=1');
  } catch (error) {
    await session.signOut().catch(() => {});
    throw error;
  }
  return { api: session.api, email: session.email, signOut: session.signOut };
}

export async function restoreSession(onExpired) {
  const stored = readStoredSession();
  if (!stored) return null;

  let ready = false;
  const session = createSession({
    email: stored.email,
    tokens: {
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
    },
    expiresAt: stored.expiresAt,
    onExpired: () => {
      if (ready) onExpired?.();
    },
  });

  try {
    await session.api('/admin/programs?limit=1');
    ready = true;
    return { api: session.api, email: session.email, signOut: session.signOut };
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      session.destroy();
      return null;
    }
    ready = true;
    return { api: session.api, email: session.email, signOut: session.signOut };
  }
}

const referenceCache = new Map();

export function clearReferenceCache() {
  referenceCache.clear();
}

export function getCachedReference(api, path) {
  if (!referenceCache.has(path)) {
    const pending = api(path).catch((error) => {
      referenceCache.delete(path);
      throw error;
    });
    referenceCache.set(path, pending);
  }
  return referenceCache.get(path);
}

export async function fetchPage(
  api,
  path,
  { limit = 10, offset = 0, search, status, extra, signal } = {},
) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  if (search && search.trim()) qs.set('search', search.trim());
  if (status) qs.set('status', status);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
  }
  const separator = path.includes('?') ? '&' : '?';
  const data = await api(`${path}${separator}${qs.toString()}`, { signal });
  if (Array.isArray(data)) {
    return { items: data, total: data.length, limit, offset };
  }
  return {
    items: data.items || [],
    total:
      typeof data.total === 'number' ? data.total : (data.items || []).length,
    limit: data.limit ?? limit,
    offset: data.offset ?? offset,
    summary: data.summary,
  };
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

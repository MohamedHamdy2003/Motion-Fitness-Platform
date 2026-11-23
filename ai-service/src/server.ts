import { matchingInput, matchProgram } from './agents/ai-assisted-matcher.js';
import {
  exerciseFittingInput,
  fitProgram,
  InvalidFittingOutput,
} from './agents/ai-program-fitter.js';
import { AiTokenUsage } from './agents/usage.js';
import 'dotenv/config';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { inputSchema, rewrite } from './agents/ai-rewriter.js';

if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

const rawModel = (process.env.AI_MODEL || '').trim();
const configuredModel = rawModel
  ? rawModel.includes('/')
    ? rawModel
    : `google/${rawModel}`
  : '';

const FALLBACK_MODELS = [
  'google/gemini-3.5-flash-lite',
  'google/gemini-3.8-flash',
  'google/gemini-3.6-flash',
  'google/gemini-flash-latest',
  'google/gemini-2.5-flash-lite',
];
let activeModel = configuredModel;

const secret = process.env.AI_SERVICE_TOKEN || '';
if (
  secret.length < 32 ||
  !configuredModel ||
  process.env.AI_RETENTION_APPROVED !== 'true' ||
  process.env.DATABASE_URL
)
  throw new Error('Private AI configuration incomplete or unsafe');

async function runWithModelFallback<T>(
  runner: (model: string) => Promise<T>,
): Promise<{ result: T; modelUsed: string }> {
  const candidates = [
    activeModel,
    ...FALLBACK_MODELS.filter((m) => m !== activeModel),
  ];
  let lastError: unknown;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i]!;
    try {
      const result = await runner(candidate);
      if (candidate !== activeModel) {
        console.warn(
          `[ai-service] switched active model from ${activeModel} to ${candidate}`,
        );
        activeModel = candidate;
      }
      return { result, modelUsed: candidate };
    } catch (error) {
      lastError = error;
      const code = classifyAiErrorCode(error);
      if (code === 'MODEL_NOT_FOUND' && i < candidates.length - 1) {
        console.warn(
          `[ai-service] model ${candidate} returned MODEL_NOT_FOUND; trying fallback`,
        );
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function classifyAiErrorCode(error: unknown, url?: string): string {
  const err = error as { name?: string; message?: string; statusCode?: number };
  const msg = String(err?.message || '');
  const upper = msg.toUpperCase();
  if (msg === 'MODEL_MISMATCH') return 'MODEL_MISMATCH';
  if (msg === 'INVALID_SELECTION') return 'INVALID_SELECTION';
  if (msg === 'UNCHANGED_OUTPUT') return 'UNCHANGED_OUTPUT';
  if (
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    upper.includes('ABORT') ||
    upper.includes('TIMEOUT')
  ) {
    return 'AI_TIMEOUT';
  }
  if (
    upper.includes('API KEY') ||
    upper.includes('API_KEY') ||
    err?.statusCode === 401 ||
    err?.statusCode === 403
  ) {
    return 'API_KEY_INVALID';
  }
  if (
    err?.statusCode === 429 ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('QUOTA') ||
    upper.includes('RATE LIMIT')
  ) {
    return 'GEMINI_RATE_LIMITED';
  }
  if (err?.statusCode === 404 || upper.includes('NOT FOUND')) {
    return 'MODEL_NOT_FOUND';
  }
  return url === '/internal/v1/match'
    ? 'MATCHING_FAILED'
    : url === '/internal/v1/fit'
      ? 'FITTING_FAILED'
      : 'REWRITE_FAILED';
}

const stats = {
  startedAt: new Date().toISOString(),
  requestsTotal: 0,
  requestsSucceeded: 0,
  requestsFailed: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
};

function recordUsageHeaders(
  res: import('node:http').ServerResponse,
  model: string,
  usage: AiTokenUsage,
  latencyMs: number,
) {
  stats.requestsSucceeded += 1;
  stats.totalInputTokens += usage.inputTokens;
  stats.totalOutputTokens += usage.outputTokens;
  stats.totalTokens += usage.totalTokens;
  res.setHeader('x-ai-model', model);
  res.setHeader('x-ai-input-tokens', String(usage.inputTokens));
  res.setHeader('x-ai-output-tokens', String(usage.outputTokens));
  res.setHeader('x-ai-total-tokens', String(usage.totalTokens));
  res.setHeader('x-ai-latency-ms', String(latencyMs));
}

const server = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200).end(
      JSON.stringify({
        status: 'ok',
        model: activeModel,
        uptimeSeconds: Math.floor(process.uptime()),
        startedAt: stats.startedAt,
        metrics: {
          requestsTotal: stats.requestsTotal,
          requestsSucceeded: stats.requestsSucceeded,
          requestsFailed: stats.requestsFailed,
          totalInputTokens: stats.totalInputTokens,
          totalOutputTokens: stats.totalOutputTokens,
          totalTokens: stats.totalTokens,
        },
      }),
    );
    return;
  }
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    res.writeHead(401).end(JSON.stringify({ code: 'UNAUTHENTICATED' }));
    return;
  }
  if (
    req.method !== 'POST' ||
    ![
      '/internal/v1/rewrite',
      '/internal/v1/match',
      '/internal/v1/fit',
    ].includes(req.url || '')
  ) {
    res.writeHead(404).end(JSON.stringify({ code: 'NOT_FOUND' }));
    return;
  }
  const started = Date.now();
  stats.requestsTotal += 1;
  try {
    const limit =
      req.url === '/internal/v1/match'
        ? 1000000
        : req.url === '/internal/v1/fit'
          ? 256000
          : 24000;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) {
        stats.requestsFailed += 1;
        res.writeHead(413).end(JSON.stringify({ code: 'PAYLOAD_TOO_LARGE' }));
        return;
      }
      chunks.push(bytes);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      stats.requestsFailed += 1;
      res.writeHead(400).end(JSON.stringify({ code: 'INVALID_INPUT' }));
      return;
    }
    let usage: AiTokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    if (req.url === '/internal/v1/match') {
      const parsed = matchingInput.safeParse(body);
      if (!parsed.success) {
        stats.requestsFailed += 1;
        res.writeHead(400).end(JSON.stringify({ code: 'INVALID_INPUT' }));
        return;
      }
      const { result, modelUsed } = await runWithModelFallback((model) =>
        matchProgram(model, { ...parsed.data, model }, (u) => {
          usage = u;
        }),
      );
      recordUsageHeaders(res, modelUsed, usage, Date.now() - started);
      res.end(JSON.stringify(result));
      return;
    }
    if (req.url === '/internal/v1/fit') {
      const parsed = exerciseFittingInput.safeParse(body);
      if (!parsed.success) {
        stats.requestsFailed += 1;
        res.writeHead(400).end(JSON.stringify({ code: 'INVALID_INPUT' }));
        return;
      }
      const { result, modelUsed } = await runWithModelFallback((model) =>
        fitProgram(model, parsed.data, (u) => {
          usage = u;
        }),
      );
      recordUsageHeaders(res, modelUsed, usage, Date.now() - started);
      res.end(JSON.stringify(result));
      return;
    }
    let input;
    try {
      input = inputSchema.parse(body);
    } catch {
      stats.requestsFailed += 1;
      res.writeHead(400).end(JSON.stringify({ code: 'INVALID_INPUT' }));
      return;
    }
    const { result: output, modelUsed } = await runWithModelFallback((model) =>
      rewrite(model, input, (u) => {
        usage = u;
      }),
    );
    recordUsageHeaders(res, modelUsed, usage, Date.now() - started);
    res.end(JSON.stringify(output));
  } catch (error) {
    stats.requestsFailed += 1;
    const code = classifyAiErrorCode(error, req.url);
    const err = error as {
      name?: string;
      statusCode?: number;
      message?: string;
    };
    console.error(
      `[ai-service] ${req.url} failed (${code}): ${err?.name || 'Error'}${err?.statusCode ? ` [${err.statusCode}]` : ''} ${String(err?.message || '').slice(0, 200)}`,
    );
    if (res.headersSent || res.writableEnded) return;
    if (error instanceof InvalidFittingOutput) {
      res
        .writeHead(502)
        .end(JSON.stringify({ code: 'FITTING_INVALID_OUTPUT' }));
      return;
    }
    res.writeHead(503).end(JSON.stringify({ code }));
  }
});
server.requestTimeout = 45000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 65000;
server.listen(
  Number(process.env.AI_SERVICE_PORT || 3001),
  process.env.AI_SERVICE_HOST || '127.0.0.1',
);
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

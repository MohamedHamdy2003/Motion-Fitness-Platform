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

const secret = process.env.AI_SERVICE_TOKEN || '';
if (
  secret.length < 32 ||
  !process.env.AI_MODEL ||
  process.env.AI_RETENTION_APPROVED !== 'true' ||
  process.env.DATABASE_URL
)
  throw new Error('Private AI configuration incomplete or unsafe');

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
        model: process.env.AI_MODEL,
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
      const result = await matchProgram(
        process.env.AI_MODEL!,
        parsed.data,
        (u) => {
          usage = u;
        },
      );
      recordUsageHeaders(
        res,
        process.env.AI_MODEL!,
        usage,
        Date.now() - started,
      );
      res.end(JSON.stringify(result));
      recordUsageHeaders(
        res,
        process.env.AI_MODEL!,
        usage,
        Date.now() - started,
      );
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
      const result = await fitProgram(
        process.env.AI_MODEL!,
        parsed.data,
        (u) => {
          usage = u;
        },
      );
      recordUsageHeaders(
        res,
        process.env.AI_MODEL!,
        usage,
        Date.now() - started,
      );
      res.end(JSON.stringify(result));
      recordUsageHeaders(
        res,
        process.env.AI_MODEL!,
        usage,
        Date.now() - started,
      );
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
    const output = await rewrite(process.env.AI_MODEL!, input, (u) => {
      usage = u;
    });
    recordUsageHeaders(res, process.env.AI_MODEL!, usage, Date.now() - started);
    res.end(JSON.stringify(output));
  } catch (error) {
    stats.requestsFailed += 1;
    if (error instanceof InvalidFittingOutput) {
      res
        .writeHead(502)
        .end(JSON.stringify({ code: 'FITTING_INVALID_OUTPUT' }));
      return;
    }
    res.writeHead(503).end(
      JSON.stringify({
        code:
          req.url === '/internal/v1/match'
            ? 'MATCHING_FAILED'
            : req.url === '/internal/v1/fit'
              ? 'FITTING_FAILED'
              : 'REWRITE_FAILED',
      }),
    );
  }
});
server.requestTimeout = 30000;
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

import 'dotenv/config';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { inputSchema, rewrite } from './agents/ai-rewriter.js';
const secret = process.env.AI_SERVICE_TOKEN || '';
if (
  secret.length < 32 ||
  !process.env.AI_MODEL ||
  process.env.AI_RETENTION_APPROVED !== 'true' ||
  process.env.DATABASE_URL
)
  throw new Error('Private AI configuration incomplete or unsafe');
const server = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    res.writeHead(401).end(JSON.stringify({ code: 'UNAUTHENTICATED' }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/internal/v1/rewrite') {
    res.writeHead(404).end(JSON.stringify({ code: 'NOT_FOUND' }));
    return;
  }
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
      if (body.length > 12000) {
        res.writeHead(413).end(JSON.stringify({ code: 'PAYLOAD_TOO_LARGE' }));
        return;
      }
    }
    let input;
    try {
      input = inputSchema.parse(JSON.parse(body));
    } catch {
      res.writeHead(400).end(JSON.stringify({ code: 'INVALID_INPUT' }));
      return;
    }
    const output = await rewrite(process.env.AI_MODEL!, input);
    res.end(JSON.stringify(output));
  } catch {
    res.writeHead(503).end(JSON.stringify({ code: 'REWRITE_FAILED' }));
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(
  Number(process.env.AI_SERVICE_PORT || 3001),
  process.env.AI_SERVICE_HOST || '127.0.0.1',
);

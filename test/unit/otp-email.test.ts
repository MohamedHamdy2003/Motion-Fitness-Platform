import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { encrypt } from '../../src/common/crypto';
import { JobsService } from '../../src/infrastructure/jobs/jobs.service';
import {
  getMotionLogoPng,
  OTP_LOGO_CID,
  renderOtpEmail,
} from '../../src/infrastructure/mail/otp-email.template';
import type { SocialService } from '../../src/modules/auth/social.service';
import type { MediaService } from '../../src/modules/media/media.service';

const savedEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  MAIL_MODE: process.env.MAIL_MODE,
  MAIL_ENCRYPTION_KEY: process.env.MAIL_ENCRYPTION_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MAIL_FROM: process.env.MAIL_FROM,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('Branded Motion OTP HTML email template', () => {
  it('renders branded HTML + plain-text fallback for EMAIL_VERIFICATION with inline CID logo', () => {
    const rendered = renderOtpEmail('EMAIL_VERIFICATION', '482917', 2026);

    expect(rendered.subject).toBe('Verify your Motion email');
    expect(rendered.text).toContain('482917');
    expect(rendered.text).toContain('10 minutes');
    expect(rendered.logoCid).toBe(OTP_LOGO_CID);

    expect(rendered.html).toContain('<!doctype html>');
    expect(rendered.html).toContain(`src="cid:${OTP_LOGO_CID}"`);
    expect(rendered.html).toContain('MOTION');
    expect(rendered.html).toContain('#c5f52f');
    expect(rendered.html).toContain('482917');
    expect(rendered.html).toContain('Email Verification');
    expect(rendered.html).toContain('2026');
    expect(rendered.html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('renders branded HTML for PASSWORD_RESET and escapes unsafe HTML input', () => {
    const rendered = renderOtpEmail(
      'PASSWORD_RESET',
      '<script>123456</script>',
      2026,
    );

    expect(rendered.subject).toBe('Reset your Motion password');
    expect(rendered.html).toContain('Password Reset');
    expect(rendered.html).toContain('&lt;script&gt;123456&lt;/script&gt;');
    expect(rendered.html).not.toContain('<script>123456</script>');
    expect(rendered.html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('loads a valid Motion PNG logo asset for inline CID email attachment', () => {
    const png = getMotionLogoPng();
    expect(png.length).toBeGreaterThan(500);
    // PNG magic header: 89 50 4E 47 0D 0A 1A 0A
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('delivers HTML body and inline PNG CID attachment via Resend API', async () => {
    const encryptionKey = randomBytes(32).toString('hex');
    Object.assign(process.env, {
      DATABASE_URL: 'postgres://motion:test@localhost:5432/motion_test',
      JWT_SECRET: 'a'.repeat(48),
      MAIL_MODE: 'resend',
      MAIL_ENCRYPTION_KEY: encryptionKey,
      RESEND_API_KEY: 're_test_12345',
      MAIL_FROM: 'Motion <no-reply@motion.app>',
    });

    const rendered = renderOtpEmail('EMAIL_VERIFICATION', '913524', 2026);
    const encrypted = encrypt(
      JSON.stringify({
        to: 'athlete@example.test',
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        logoCid: rendered.logoCid,
      }),
      encryptionKey,
    );

    const sentPayloads: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        sentPayloads.push(
          JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
        );
        return new Response(JSON.stringify({ id: 'email_123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const jobs = new JobsService(
      {} as DataSource,
      {} as SocialService,
      {} as MediaService,
    );
    await jobs.deliver({
      id: 'job-otp-1',
      payload: { encrypted },
    });

    expect(sentPayloads).toHaveLength(1);
    const [sentPayload] = sentPayloads;
    expect(sentPayload.subject).toBe('Verify your Motion email');
    expect(sentPayload.html).toContain('913524');
    expect(sentPayload.html).toContain(`cid:${OTP_LOGO_CID}`);
    expect(sentPayload.attachments).toEqual([
      {
        filename: 'motion-logo.png',
        content: getMotionLogoPng().toString('base64'),
        content_id: OTP_LOGO_CID,
      },
    ]);
  });
});

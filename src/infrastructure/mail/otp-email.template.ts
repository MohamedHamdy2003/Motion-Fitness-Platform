import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type OtpEmailPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

export const OTP_LOGO_CID = 'motion-logo@motion.app';

export interface RenderedOtpEmail {
  subject: string;
  text: string;
  html: string;
  logoCid: string;
}

let cachedTemplateHtml: string | null = null;
let cachedLogoPng: Buffer | null = null;

function resolveTemplateAsset(filename: string): string {
  const localPath = join(__dirname, 'templates', filename);
  if (existsSync(localPath)) return localPath;
  return join(
    process.cwd(),
    'src',
    'infrastructure',
    'mail',
    'templates',
    filename,
  );
}

function getOtpTemplateHtml(): string {
  if (cachedTemplateHtml === null) {
    cachedTemplateHtml = readFileSync(
      resolveTemplateAsset('otp-email.html'),
      'utf8',
    );
  }
  return cachedTemplateHtml;
}

export function getMotionLogoPng(): Buffer {
  if (cachedLogoPng === null) {
    cachedLogoPng = readFileSync(resolveTemplateAsset('motion-logo.png'));
  }
  return cachedLogoPng;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderOtpEmail(
  purpose: OtpEmailPurpose,
  otpCode: string,
  year = new Date().getUTCFullYear(),
): RenderedOtpEmail {
  const isReset = purpose === 'PASSWORD_RESET';

  const subject = isReset
    ? 'Reset your Motion password'
    : 'Verify your Motion email';

  const text = `Your Motion ${isReset ? 'password reset' : 'email verification'} code is: ${otpCode}. It expires in 10 minutes. Do not share this code.`;

  const preheader = isReset
    ? `Your Motion password reset code is ${otpCode}. Valid for 10 minutes.`
    : `Your Motion verification code is ${otpCode}. Valid for 10 minutes.`;

  const badgeText = isReset ? 'Password Reset' : 'Email Verification';

  const heading = isReset
    ? 'Reset your Motion password'
    : 'Verify your email address';

  const introText = isReset
    ? 'We received a request to reset the password for your Motion account. Enter the 6-digit verification code below in the Motion app to continue.'
    : 'Welcome to Motion! Enter the 6-digit verification code below in the Motion app to confirm your email address and activate your account.';

  const footerNote = isReset
    ? "Didn't request a password reset? You can safely ignore this email—your password will remain unchanged."
    : "Didn't create a Motion account? You can safely ignore this email.";

  const replacements: Record<string, string> = {
    '{{SUBJECT}}': escapeHtml(subject),
    '{{PREHEADER}}': escapeHtml(preheader),
    '{{LOGO_CID}}': escapeHtml(OTP_LOGO_CID),
    '{{BADGE_TEXT}}': escapeHtml(badgeText),
    '{{HEADING}}': escapeHtml(heading),
    '{{INTRO_TEXT}}': escapeHtml(introText),
    '{{OTP_CODE}}': escapeHtml(otpCode),
    '{{FOOTER_NOTE}}': escapeHtml(footerNote),
    '{{YEAR}}': escapeHtml(String(year)),
  };

  let html = getOtpTemplateHtml();
  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.split(placeholder).join(value);
  }

  return {
    subject,
    text,
    html,
    logoCid: OTP_LOGO_CID,
  };
}

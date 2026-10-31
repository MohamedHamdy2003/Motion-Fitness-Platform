import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { SocialService, Provider } from './social.service';
import {
  ApiError,
  ApiRequest,
  email,
  password,
  token,
  uuid,
  parse,
  empty,
} from '../../common/http';
import { AuthGuard } from '../../common/auth.guard';
import { RateLimit } from '../../common/rate-limit';
const local = z.object({ email, password }).strict();
const newPassword = { newPassword: password, confirmPassword: password };
const social = z
  .object({
    idToken: z.string().min(20).max(10000),
    challengeId: uuid,
    authorizationCode: z.string().max(4000).optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
const matching = (v: { newPassword: string; confirmPassword: string }) => {
  if (v.newPassword !== v.confirmPassword)
    throw new ApiError('PASSWORDS_DO_NOT_MATCH');
};
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(SocialService) private social: SocialService,
    @Inject(AuthGuard) private guard: AuthGuard,
    @Inject(RateLimit) private rate: RateLimit,
  ) {}
  async limit(req: ApiRequest, scope: string, identity?: string) {
    await this.rate.take(scope, req.ip || 'unknown', 30);
    if (identity) await this.rate.take(scope, identity, 6);
  }
  @Post('register') async register(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const b = parse(local, body);
    await this.limit(req, 'register', b.email);
    return this.auth.register(b.email, b.password);
  }
  @Post('login') @HttpCode(200) async login(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const b = parse(local, body);
    await this.limit(req, 'login', b.email);
    return this.auth.login(b.email, b.password);
  }
  @Post('refresh') @HttpCode(200) async refresh(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const b = parse(z.object({ refreshToken: token }).strict(), body);
    await this.rate.take('refresh', req.ip || 'unknown', 120);
    return this.auth.refresh(b.refreshToken);
  }
  @Post('verify-email') @HttpCode(200) async verify(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const b = parse(
      z.object({ email, code: z.string().regex(/^\d{6}$/) }).strict(),
      body,
    );
    await this.limit(req, 'verify', b.email);
    return this.auth.verifyEmail(b.email, b.code);
  }
  @Post('verify-reset-code') @HttpCode(200) async verifyReset(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const b = parse(
      z.object({ email, code: z.string().regex(/^\d{6}$/) }).strict(),
      body,
    );
    await this.limit(req, 'verify-reset', b.email);
    return this.auth.verifyOtp(b.email, b.code, 'PASSWORD_RESET');
  }
  @Post('resend-verification') @HttpCode(202) async resend(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const b = parse(z.object({ email }).strict(), body);
    await this.limit(req, 'resend', b.email);
    return this.auth.emailRequest(b.email, 'EMAIL_VERIFICATION');
  }
  @Post('forgot-password') @HttpCode(202) async forgot(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const b = parse(z.object({ email }).strict(), body);
    await this.limit(req, 'forgot', b.email);
    return this.auth.emailRequest(b.email, 'PASSWORD_RESET');
  }
  @Post('reset-password') @HttpCode(200) async reset(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const b = parse(z.object({ token, ...newPassword }).strict(), body);
    matching(b);
    await this.limit(req, 'reset');
    return this.auth.resetPassword(b.token, b.newPassword);
  }
  @Post('change-password') @HttpCode(200) @UseGuards(AuthGuard) async change(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const b = parse(
      z.object({ currentPassword: password, ...newPassword }).strict(),
      body,
    );
    matching(b);
    await this.limit(req, 'change', req.principal.userId);
    return this.auth.changePassword(
      req.principal,
      b.currentPassword,
      b.newPassword,
    );
  }
  @Post('logout') @HttpCode(200) @UseGuards(AuthGuard) async logout(
    @Body() b: unknown,
    @Req() req: ApiRequest,
  ) {
    parse(empty, b);
    return this.auth.logout(req.principal);
  }
  @Post('logout-all') @HttpCode(200) @UseGuards(AuthGuard) async logoutAll(
    @Body() b: unknown,
    @Req() req: ApiRequest,
  ) {
    parse(empty, b);
    return this.auth.logout(req.principal, true);
  }
  @Post('challenges') async challenge(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const b = parse(
      z
        .object({
          provider: z.enum(['GOOGLE', 'APPLE']),
          purpose: z.enum(['SIGN_IN', 'LINK', 'REAUTHENTICATE']),
        })
        .strict(),
      body,
    );
    await this.limit(req, 'challenge');
    if (b.purpose !== 'SIGN_IN') await this.guard.authenticate(req);
    return this.social.challenge(b.provider, b.purpose, req.principal?.userId);
  }
  @Post('google') @HttpCode(200) async google(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    await this.limit(req, 'google');
    return this.social.signIn('GOOGLE', parse(social, body));
  }
  @Post('apple') @HttpCode(200) async apple(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    await this.limit(req, 'apple');
    return this.social.signIn(
      'APPLE',
      parse(social.required({ authorizationCode: true }), body),
    );
  }
  @Post('reauthenticate') @HttpCode(200) @UseGuards(AuthGuard) async reauth(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const b = parse(
      z.discriminatedUnion('method', [
        z
          .object({
            method: z.literal('PASSWORD'),
            password,
            purpose: z.enum(['LINK', 'DELETE']),
          })
          .strict(),
        social.extend({
          method: z.enum(['GOOGLE', 'APPLE']),
          purpose: z.enum(['LINK', 'DELETE']),
        }),
      ]),
      body,
    );
    await this.limit(req, 'reauth', req.principal.userId);
    return b.method === 'PASSWORD'
      ? this.auth.passwordReauth(req.principal, b.password, b.purpose)
      : this.social.reauthenticate(req.principal, b.method, b, b.purpose);
  }
  @Post('identities/:provider/link')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async link(
    @Param('provider') provider: string,
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    const p = parse(
      z.enum(['GOOGLE', 'APPLE']),
      provider.toUpperCase(),
    ) as Provider;
    const b = parse(social.extend({ reauthenticationToken: token }), body);
    await this.limit(req, 'link', req.principal.userId);
    return this.social.link(req.principal, p, b, b.reauthenticationToken);
  }
}
@Controller('me/account-deletion')
export class AccountDeletionController {
  constructor(@Inject(AuthService) private auth: AuthService) {}
  @Post() @HttpCode(202) @UseGuards(AuthGuard) request(
    @Req() req: ApiRequest,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ reauthenticationToken: token }).strict(), body);
    return this.auth.deleteAccount(req.principal, b.reauthenticationToken);
  }
  @Get() status(@Headers('x-deletion-token') value: string) {
    return this.auth.deletionStatus(parse(token, value));
  }
}

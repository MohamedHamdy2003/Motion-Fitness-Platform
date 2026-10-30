import { query } from '../infrastructure/database/query';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import jwt from 'jsonwebtoken';
import { environment } from '../config/environment';
import { ApiError, ApiRequest, uuid } from './http';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(DataSource) private db: DataSource) {}
  async canActivate(ctx: ExecutionContext) {
    await this.authenticate(ctx.switchToHttp().getRequest<ApiRequest>());
    return true;
  }
  async authenticate(req: ApiRequest) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new ApiError('UNAUTHENTICATED', 401);
    const env = environment();
    let claims: jwt.JwtPayload;
    try {
      const c = jwt.verify(header.slice(7), env.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      });
      if (
        typeof c === 'string' ||
        !uuid.safeParse(c.sub).success ||
        !uuid.safeParse(c.sid).success ||
        typeof c.exp !== 'number'
      )
        throw Error();
      claims = c;
    } catch {
      throw new ApiError('UNAUTHENTICATED', 401);
    }
    const [session] = await query(
      this.db,
      `SELECT s.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='ACTIVE'`,
      [claims.sid, claims.sub],
    );
    if (!session) throw new ApiError('SESSION_REVOKED', 401);
    req.principal = { userId: claims.sub!, sessionId: claims.sid };
    return true;
  }
}

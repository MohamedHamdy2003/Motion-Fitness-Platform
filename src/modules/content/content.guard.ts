import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiError, ApiRequest } from '../../common/http';
import { query } from '../../infrastructure/database/query';
@Injectable()
export class ContentGuard implements CanActivate {
  constructor(@Inject(DataSource) private db: DataSource) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<ApiRequest>();
    const rows = await query(
      this.db,
      `SELECT role_code FROM user_roles WHERE user_id=$1 AND role_code IN ('ADMIN','CONTENT_EDITOR')`,
      [req.principal.userId],
    );
    if (!rows.length) throw new ApiError('CONTENT_ACCESS_DENIED', 403);
    return true;
  }
}

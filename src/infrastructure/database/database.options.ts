import { DataSourceOptions } from 'typeorm';
import { environment } from '../../config/environment';
import { Initial1793318400000 } from './migrations/1793318400000-Initial';
import { AvatarUploadKeys1793318401000 } from './migrations/1793318401000-AvatarUploadKeys';
import { UserSchema } from '../../modules/auth/user.entity';
import {
  ProfileSchema,
  MeasurementSchema,
  InjurySchema,
} from '../../modules/profiles/profile.entity';
import { MediaSchema } from '../../modules/media/media.entity';
export function databaseOptions(): DataSourceOptions {
  const env = environment();
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
    entities: [
      UserSchema,
      ProfileSchema,
      MeasurementSchema,
      InjurySchema,
      MediaSchema,
    ],
    migrations: [Initial1793318400000, AvatarUploadKeys1793318401000],
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: { max: 10, connectionTimeoutMillis: 10000 },
  };
}

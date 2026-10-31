import { readFileSync } from 'node:fs';
import { LibraryIntegrity1793448002000 } from './migrations/1793448002000-LibraryIntegrity';
import { EmailOtp1793448001000 } from './migrations/1793448001000-EmailOtp';
import { ContentLibrary1793448000000 } from './migrations/1793448000000-ContentLibrary';
import { DataSourceOptions } from 'typeorm';
import { environment } from '../../config/environment';
import { Initial1793318400000 } from './migrations/1793318400000-Initial';
import { AvatarUploadKeys1793318401000 } from './migrations/1793318401000-AvatarUploadKeys';
import { RemoveBodyFat1793404800000 } from './migrations/1793404800000-RemoveBodyFat';
import { CurrentProfileWeight1793404801000 } from './migrations/1793404801000-CurrentProfileWeight';
import { UserSchema } from '../../modules/auth/user.entity';
import {
  ProfileSchema,
  InjurySchema,
} from '../../modules/profiles/profile.entity';
import { MediaSchema } from '../../modules/media/media.entity';
export function databaseOptions(): DataSourceOptions {
  const env = environment();
  const url = new URL(env.DATABASE_URL);
  if (env.DATABASE_SSL === 'true')
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
      url.searchParams.delete(key);
  return {
    type: 'postgres',
    url: url.toString(),
    ssl:
      env.DATABASE_SSL === 'true'
        ? {
            rejectUnauthorized: true,
            ...(env.DATABASE_CA_CERT_PATH
              ? { ca: readFileSync(env.DATABASE_CA_CERT_PATH, 'utf8') }
              : {}),
          }
        : false,
    entities: [UserSchema, ProfileSchema, InjurySchema, MediaSchema],
    migrations: [
      Initial1793318400000,
      AvatarUploadKeys1793318401000,
      RemoveBodyFat1793404800000,
      CurrentProfileWeight1793404801000,
      ContentLibrary1793448000000,
      EmailOtp1793448001000,
      LibraryIntegrity1793448002000,
    ],
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: { max: 10, connectionTimeoutMillis: 10000 },
  };
}

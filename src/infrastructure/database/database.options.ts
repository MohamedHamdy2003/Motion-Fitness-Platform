import { ProgramMatching1793448017000 } from './migrations/1793448017000-ProgramMatching';
import { ProtectPublishedProgramStructure1793448018000 } from './migrations/1793448018000-ProtectPublishedProgramStructure';
import { DecoupleProgramHintApprovers1793448019000 } from './migrations/1793448019000-DecoupleProgramHintApprovers';
import { AlignTrainingAvailability1793448020000 } from './migrations/1793448020000-AlignTrainingAvailability';
import { DailyActivity1793448021000 } from './migrations/1793448021000-DailyActivity';
import { AutomaticEnrollment1793448022000 } from './migrations/1793448022000-AutomaticEnrollment';
import { ExerciseFitting1793448023000 } from './migrations/1793448023000-ExerciseFitting';
import { SingleAdmin1793448024000 } from './migrations/1793448024000-SingleAdmin';
import { WorkoutExecution1793448025000 } from './migrations/1793448025000-WorkoutExecution';
import { UserNutritionExecution1793448026000 } from './migrations/1793448026000-UserNutritionExecution';
import { NotificationsCheckInsSupportAndIndexes1793448027000 } from './migrations/1793448027000-NotificationsCheckInsSupportAndIndexes';
import { AiUsageAndSystemMetrics1793448028000 } from './migrations/1793448028000-AiUsageAndSystemMetrics';
import { BilingualFaqWithoutSlug1793448029000 } from './migrations/1793448029000-BilingualFaqWithoutSlug';
import { UserSuspendedStatus1793448030000 } from './migrations/1793448030000-UserSuspendedStatus';
import { PerformanceIndexes1793448031000 } from './migrations/1793448031000-PerformanceIndexes';
import { UserPushTokens1793448032000 } from './migrations/1793448032000-UserPushTokens';
import { RemoveIdempotency1793448016000 } from './migrations/1793448016000-RemoveIdempotency';
import { FoodDisplay1793448015000 } from './migrations/1793448015000-FoodDisplay';
import { readFileSync } from 'node:fs';
import { LibraryIntegrity1793448002000 } from './migrations/1793448002000-LibraryIntegrity';
import { NutritionLibrary1793448003000 } from './migrations/1793448003000-NutritionLibrary';
import { ProgramBuilder1793448004000 } from './migrations/1793448004000-ProgramBuilder';
import { ProfileGender1793448005000 } from './migrations/1793448005000-ProfileGender';
import { ExerciseMediaConsistency1793448006000 } from './migrations/1793448006000-ExerciseMediaConsistency';
import { OnboardingWeekdays1793448007000 } from './migrations/1793448007000-OnboardingWeekdays';
import { FitnessLevelLookups1793448008000 } from './migrations/1793448008000-FitnessLevelLookups';
import { ProfileTargetWeight1793448009000 } from './migrations/1793448009000-ProfileTargetWeight';
import { PrimaryGoalLookups1793448010000 } from './migrations/1793448010000-PrimaryGoalLookups';
import { UserAdminRoles1793448011000 } from './migrations/1793448011000-UserAdminRoles';
import { RenameBodyAreasInjuries1793448012000 } from './migrations/1793448012000-RenameBodyAreasInjuries';
import { EditableLookups1793448013000 } from './migrations/1793448013000-EditableLookups';
import { RemoveExcludedFoodPreference1793448014000 } from './migrations/1793448014000-RemoveExcludedFoodPreference';
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
      NutritionLibrary1793448003000,
      ProgramBuilder1793448004000,
      ProfileGender1793448005000,
      ExerciseMediaConsistency1793448006000,
      OnboardingWeekdays1793448007000,
      FitnessLevelLookups1793448008000,
      ProfileTargetWeight1793448009000,
      PrimaryGoalLookups1793448010000,
      UserAdminRoles1793448011000,
      RenameBodyAreasInjuries1793448012000,
      EditableLookups1793448013000,
      RemoveExcludedFoodPreference1793448014000,
      FoodDisplay1793448015000,
      RemoveIdempotency1793448016000,
      ProgramMatching1793448017000,
      ProtectPublishedProgramStructure1793448018000,
      DecoupleProgramHintApprovers1793448019000,
      AlignTrainingAvailability1793448020000,
      DailyActivity1793448021000,
      AutomaticEnrollment1793448022000,
      ExerciseFitting1793448023000,
      SingleAdmin1793448024000,
      WorkoutExecution1793448025000,
      UserNutritionExecution1793448026000,
      NotificationsCheckInsSupportAndIndexes1793448027000,
      AiUsageAndSystemMetrics1793448028000,
      BilingualFaqWithoutSlug1793448029000,
      UserSuspendedStatus1793448030000,
      PerformanceIndexes1793448031000,
      UserPushTokens1793448032000,
    ],
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: {
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    },
  };
}

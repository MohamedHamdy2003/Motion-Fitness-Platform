import { EntitySchema } from 'typeorm';
export const ProfileSchema = new EntitySchema({
  name: 'Profile',
  tableName: 'user_profiles',
  columns: {
    user_id: { type: 'uuid', primary: true },
    name: { type: 'text', nullable: true },
    phone: { type: 'text', nullable: true },
    height_cm: { type: 'numeric', nullable: true },
    weight_kg: { type: 'numeric', nullable: true },
    primary_goal: { type: 'text', nullable: true },
    fitness_level: { type: 'text', nullable: true },
    training_days_per_week: { type: 'integer', nullable: true },
    timezone: { type: 'text' },
    locale: { type: 'text' },
    date_of_birth: { type: 'date', nullable: true },
    avatar_media_id: { type: 'uuid', nullable: true },
    profile_revision: { type: 'integer' },
    onboarded_at: { type: 'timestamptz', nullable: true },
  },
});
export const InjurySchema = new EntitySchema({
  name: 'UserInjury',
  tableName: 'user_injuries',
  columns: {
    id: { type: 'uuid', primary: true },
    user_id: { type: 'uuid' },
    body_area_code: { type: 'text' },
    side: { type: 'text', nullable: true },
    description: { type: 'text' },
    version: { type: 'integer' },
    status: { type: 'text' },
    confirmed_at: { type: 'timestamptz' },
    removed_at: { type: 'timestamptz', nullable: true },
  },
});

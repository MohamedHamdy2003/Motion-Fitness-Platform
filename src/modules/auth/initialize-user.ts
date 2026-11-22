import { EntityManager } from 'typeorm';
import { query } from '../../infrastructure/database/query';

export async function initializeUser(manager: EntityManager, userId: string) {
  for (const table of [
    'user_profiles',
    'user_settings',
    'user_restriction_states',
    'user_food_preferences',
  ]) {
    await query(manager, `INSERT INTO ${table}(user_id) VALUES($1)`, [userId]);
  }
  await query(
    manager,
    "INSERT INTO user_roles(user_id,role_code) VALUES($1,'USER')",
    [userId],
  );
}

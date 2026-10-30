import { query } from '../query';
import { DataSource } from 'typeorm';
export async function seedLookups(db: DataSource) {
  await db.transaction(async (m) => {
    for (const role of [
      'ATHLETE',
      'CONTENT_EDITOR',
      'NUTRITION_REVIEWER',
      'EXERCISE_REVIEWER',
      'ADMIN',
    ])
      await query(
        m,
        `INSERT INTO roles(code) VALUES($1) ON CONFLICT DO NOTHING`,
        [role],
      );
    for (const code of [
      'HEAD',
      'NECK',
      'SHOULDER',
      'UPPER_ARM',
      'ELBOW',
      'FOREARM',
      'WRIST',
      'HAND',
      'CHEST',
      'UPPER_BACK',
      'LOWER_BACK',
      'ABDOMEN',
      'HIP',
      'THIGH',
      'KNEE',
      'LOWER_LEG',
      'ANKLE',
      'FOOT',
    ])
      await query(
        m,
        `INSERT INTO body_areas(code) VALUES($1) ON CONFLICT DO NOTHING`,
        [code],
      );
    for (const [code, label] of [
      ['MILK', 'Milk'],
      ['EGG', 'Egg'],
      ['PEANUT', 'Peanut'],
      ['TREE_NUT', 'Tree nut'],
      ['SOY', 'Soy'],
      ['WHEAT', 'Wheat'],
      ['FISH', 'Fish'],
      ['CRUSTACEAN', 'Crustacean shellfish'],
      ['SESAME', 'Sesame'],
    ])
      await query(
        m,
        `INSERT INTO allergens(code,label) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET label=excluded.label`,
        [code, label],
      );
  });
}
export async function seedContent(db: DataSource) {
  await db.transaction(async (m) => {
    const [r] = await query(
      m,
      `SELECT count(*)::integer AS count FROM roles WHERE code='ATHLETE'`,
    );
    if (r.count !== 1) throw new Error('Lookup stage required');
    // Intentionally empty: no approved sourced program/food datasets in F00–F02.
  });
}

import { query } from '../query';
import { DataSource } from 'typeorm';
export async function seedLookups(db: DataSource) {
  await db.transaction(async (m) => {
    for (const [code, label, order] of [
      ['FAT_LOSS', 'Fat loss', 1],
      ['STRENGTH_HYPERTROPHY', 'Strength & hypertrophy', 2],
    ] as const)
      await query(
        m,
        `INSERT INTO primary_goals(code,label,display_order) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET label=excluded.label,display_order=excluded.display_order`,
        [code, label, order],
      );
    for (const [code, label, order] of [
      ['BEGINNER', 'Beginner', 1],
      ['INTERMEDIATE', 'Intermediate', 2],
      ['ADVANCED', 'Advanced', 3],
    ] as const)
      await query(
        m,
        `INSERT INTO fitness_levels(code,label,display_order) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET label=excluded.label,display_order=excluded.display_order`,
        [code, label, order],
      );
    for (const gender of ['MALE', 'FEMALE'])
      await query(
        m,
        `INSERT INTO genders(code) VALUES($1) ON CONFLICT DO NOTHING`,
        [gender],
      );
    for (const role of ['USER', 'ADMIN'])
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
        `INSERT INTO body_areas_injuries(code) VALUES($1) ON CONFLICT DO NOTHING`,
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
      `SELECT count(*)::integer AS count FROM roles WHERE code='USER'`,
    );
    if (r.count !== 1) throw new Error('Lookup stage required');
    // Content catalogs are imported separately through the versioned content seeder.
  });
}

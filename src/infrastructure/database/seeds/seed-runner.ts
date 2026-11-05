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
        `INSERT INTO primary_goals(code,label,display_order) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING`,
        [code, label, order],
      );
    for (const [code, label, order] of [
      ['BEGINNER', 'Beginner', 1],
      ['INTERMEDIATE', 'Intermediate', 2],
      ['ADVANCED', 'Advanced', 3],
    ] as const)
      await query(
        m,
        `INSERT INTO fitness_levels(code,label,display_order) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING`,
        [code, label, order],
      );
    for (const [gender, label, order] of [
      ['MALE', 'Male', 2],
      ['FEMALE', 'Female', 1],
    ] as const)
      await query(
        m,
        `INSERT INTO genders(code,label,display_order) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING`,
        [gender, label, order],
      );
    for (const [role, label, order] of [
      ['USER', 'User', 1],
      ['ADMIN', 'Admin', 2],
    ] as const)
      await query(
        m,
        `INSERT INTO roles(code,label,display_order) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING`,
        [role, label, order],
      );
    for (const [order, code] of [
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
    ].entries()) {
      const label = code
        .split('_')
        .map((part) => part[0] + part.slice(1).toLowerCase())
        .join(' ');
      await query(
        m,
        `INSERT INTO body_areas_injuries(code,label,display_order) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING`,
        [code, label, order + 1],
      );
    }
    for (const [order, [code, label]] of [
      ['MILK', 'Milk'],
      ['EGG', 'Egg'],
      ['PEANUT', 'Peanut'],
      ['TREE_NUT', 'Tree nut'],
      ['SOY', 'Soy'],
      ['WHEAT', 'Wheat'],
      ['FISH', 'Fish'],
      ['CRUSTACEAN', 'Crustacean shellfish'],
      ['SESAME', 'Sesame'],
    ].entries())
      await query(
        m,
        `INSERT INTO allergens(code,label,display_order) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING`,
        [code, label, order + 1],
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

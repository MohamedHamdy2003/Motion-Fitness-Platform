import { MigrationInterface, QueryRunner } from 'typeorm';
export class FoodDisplay1793448015000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE food_reference_items ADD COLUMN description text',
    );
    await q.query(`CREATE OR REPLACE VIEW available_food_references AS SELECT r.* FROM food_reference_items r
 WHERE NOT EXISTS(SELECT 1 FROM ingredients i WHERE i.id=r.id AND i.archived)
 AND (NOT EXISTS(SELECT 1 FROM foods f WHERE f.id=r.id) OR EXISTS(SELECT 1 FROM foods f JOIN food_versions v ON v.food_id=f.id WHERE f.id=r.id AND NOT f.archived AND v.status='PUBLISHED'))`);
    for (const [original, name] of [
      [
        'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
        'Roasted chicken breast',
      ],
      [
        'Fish, tuna, light, canned in water, without salt, drained solids',
        'Canned light tuna',
      ],
      ['Egg, whole, cooked, hard-boiled', 'Hard-boiled egg'],
      [
        "Yogurt, Greek, plain, nonfat (Includes foods for USDA's Food Distribution Program)",
        'Plain nonfat Greek yogurt',
      ],
      [
        'Tofu, firm, prepared with calcium sulfate and magnesium chloride (nigari)',
        'Firm tofu',
      ],
      [
        'Fish, salmon, Atlantic, wild, cooked, dry heat',
        'Cooked wild Atlantic salmon',
      ],
      [
        "Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)",
        'Cooked brown rice',
      ],
      ['Quinoa, cooked', 'Cooked quinoa'],
      [
        'Cereals, oats, regular and quick, not fortified, dry',
        'Dry rolled oats',
      ],
      [
        'Sweet potato, cooked, baked in skin, flesh, with salt',
        'Baked sweet potato',
      ],
      ['Potatoes, baked, flesh and skin, without salt', 'Baked potato'],
      ['Bananas, raw', 'Banana'],
      ['Lentils, mature seeds, cooked, boiled, without salt', 'Cooked lentils'],
      [
        'Beans, black, mature seeds, cooked, boiled, without salt',
        'Cooked black beans',
      ],
      ['Broccoli, cooked, boiled, drained, without salt', 'Cooked broccoli'],
      ['Spinach, cooked, boiled, drained, without salt', 'Cooked spinach'],
      ['Carrots, cooked, boiled, drained, without salt', 'Cooked carrots'],
    ]) {
      await q.query(
        'UPDATE food_reference_items SET name=$2,description=$1 WHERE name=$1 AND description IS NULL',
        [original, name],
      );
    }
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP VIEW available_food_references');
    await q.query('ALTER TABLE food_reference_items DROP COLUMN description');
    await q.query(`CREATE VIEW available_food_references AS SELECT r.* FROM food_reference_items r
 WHERE NOT EXISTS(SELECT 1 FROM ingredients i WHERE i.id=r.id AND i.archived)
 AND (NOT EXISTS(SELECT 1 FROM foods f WHERE f.id=r.id) OR EXISTS(SELECT 1 FROM foods f JOIN food_versions v ON v.food_id=f.id WHERE f.id=r.id AND NOT f.archived AND v.status='PUBLISHED'))`);
  }
}

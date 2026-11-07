const seedNames = new Map<string, string>([
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
  ['Cereals, oats, regular and quick, not fortified, dry', 'Dry rolled oats'],
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
]);
export function foodDisplay(title: string, description?: string) {
  const name = seedNames.get(title) ?? title;
  return { name, description: description ?? (name !== title ? title : null) };
}

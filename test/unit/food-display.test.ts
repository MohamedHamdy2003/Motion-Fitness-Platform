import { describe, expect, it } from 'vitest';
import { foodDisplay } from '../../src/modules/content/food-display';
describe('reference food labels', () => {
  it('preserves fish identity and source details', () => {
    const original =
      'Fish, tuna, light, canned in water, without salt, drained solids';
    expect(foodDisplay(original)).toEqual({
      name: 'Canned light tuna',
      description: original,
    });
  });
  it('keeps custom names intact and accepts a separate description', () => {
    expect(foodDisplay('Rice, special blend', 'Details')).toEqual({
      name: 'Rice, special blend',
      description: 'Details',
    });
    expect(foodDisplay('Apple')).toEqual({ name: 'Apple', description: null });
  });
});

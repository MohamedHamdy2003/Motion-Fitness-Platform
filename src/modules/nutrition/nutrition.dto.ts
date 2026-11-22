import { z } from 'zod';
import { uuid } from '../../common/http';

export const completionInput = z
  .object({
    completed: z.boolean(),
  })
  .strict();

export const mealItemSubstitutionInput = z
  .object({
    selectedMemberId: uuid,
  })
  .strict();

export const mealSubstitutionInput = z
  .object({
    selectedMealVersionId: uuid,
  })
  .strict();

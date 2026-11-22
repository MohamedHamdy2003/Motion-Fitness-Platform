import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { query } from '../query';
import { importLibrary } from './import-library';
import { seedContent, seedLookups } from './seed-runner';

function stableUuid(value: string) {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type ProgramSpec = {
  slug: string;
  title: string;
  primaryGoal:
    'FAT_LOSS' | 'STRENGTH_HYPERTROPHY' | 'GET_FIT_TONED' | 'IMPROVE_ENDURANCE';
  supportedGoals: string[];
  idealLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  supportedLevels: string[];
  trainingDaysPerWeek: 2 | 3 | 4 | 5 | 6;
  editorialPriority: number;
  description: string;
  requiredEquipment: string[];
  intendedAudience: string;
  hintText: string;
  suitabilityNotes: string[];
  monthTitles: string[];
  workoutFocuses: Array<{
    title: string;
    description: string;
    exerciseSlugs: string[];
    setCount: number;
    repsMin: number;
    repsMax: number;
    restSeconds: number;
  }>;
  mealSlugs: {
    breakfast: string;
    lunch: string;
    dinner: string;
  };
};

export const PROGRAM_CATALOG_SPECS: ProgramSpec[] = [
  {
    slug: 'fat-loss-foundation-3d',
    title: 'Fat Loss Foundation — Joint-Friendly 3-Day Metabolic Plan',
    primaryGoal: 'FAT_LOSS',
    supportedGoals: ['FAT_LOSS', 'GET_FIT_TONED'],
    idealLevel: 'BEGINNER',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE'],
    trainingDaysPerWeek: 3,
    editorialPriority: 10,
    description:
      'A structured 3-day full-body fat loss program emphasizing controlled bodyweight and light-dumbbell movements, steady calorie expenditure, and joint-friendly progressions.',
    requiredEquipment: ['DUMBBELL', 'MAT'],
    intendedAudience:
      'Beginners and returning athletes seeking sustainable fat loss with low-impact exercises and 3 weekly training days',
    hintText:
      'Ideal for users starting a fat-loss journey or with higher initial weight who prefer joint-friendly compound movements 3 days per week.',
    suitabilityNotes: [
      'Low-impact squat, hinge, bridge, and incline push patterns',
      'Balanced recovery with 4 rest days per week',
      'Suitable for higher BMI or gradual conditioning progression',
    ],
    monthTitles: [
      'Month 1: Movement & Metabolic Base',
      'Month 2: Progressive Density',
    ],
    workoutFocuses: [
      {
        title: 'Full-Body Metabolic A',
        description: 'Controlled lower-body and horizontal push/pull circuit.',
        exerciseSlugs: [
          'bodyweight-squat',
          'incline-push-up',
          'one-arm-dumbbell-row',
          'glute-bridge',
          'dead-bug',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 45,
      },
      {
        title: 'Full-Body Metabolic B',
        description: 'Posterior chain, overhead press, and core stability.',
        exerciseSlugs: [
          'goblet-squat',
          'dumbbell-romanian-deadlift',
          'dumbbell-overhead-press',
          'bird-dog',
          'standing-calf-raise',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 12,
        restSeconds: 45,
      },
      {
        title: 'Full-Body Metabolic C',
        description:
          'Unilateral leg work, upper-body pulling, and trunk endurance.',
        exerciseSlugs: [
          'reverse-lunge',
          'dumbbell-floor-press',
          'resistance-band-row',
          'glute-bridge',
          'front-plank',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 14,
        restSeconds: 45,
      },
    ],
    mealSlugs: {
      breakfast: 'oats-yogurt-banana',
      lunch: 'chicken-rice-broccoli',
      dinner: 'tuna-lentil-spinach-bowl',
    },
  },
  {
    slug: 'fat-loss-athletic-circuit-3d',
    title: 'Athletic Fat Loss & Lean Muscle Preservation (3-Day)',
    primaryGoal: 'FAT_LOSS',
    supportedGoals: ['FAT_LOSS', 'STRENGTH_HYPERTROPHY'],
    idealLevel: 'INTERMEDIATE',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    trainingDaysPerWeek: 3,
    editorialPriority: 8,
    description:
      'Higher-intensity 3-day resistance training program designed to preserve lean muscle tissue while reducing body fat through heavy compound dumbbell and cable lifts.',
    requiredEquipment: ['DUMBBELL', 'BENCH', 'CABLE_MACHINE'],
    intendedAudience:
      'Intermediate and experienced trainees or moderate-BMI athletes looking to cut fat while maintaining strength on a 3-day schedule',
    hintText:
      'Prefer this over Fat Loss Foundation when the user has intermediate/advanced experience or wants heavier resistance work to retain muscle while cutting.',
    suitabilityNotes: [
      'Higher mechanical tension to preserve lean mass during fat loss',
      'Combines dumbbell compound lifts with cable pulling',
      'Best for users comfortable with full push-ups, lunges, and weighted squats',
    ],
    monthTitles: [
      'Month 1: Strength-Preserving Cut',
      'Month 2: High-Density Conditioning',
    ],
    workoutFocuses: [
      {
        title: 'Athletic Strength Circuit A',
        description:
          'Goblet squats, push-ups, lat pulldowns, and core bracing.',
        exerciseSlugs: [
          'goblet-squat',
          'push-up',
          'lat-pulldown',
          'dumbbell-romanian-deadlift',
          'front-plank',
        ],
        setCount: 4,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 60,
      },
      {
        title: 'Athletic Strength Circuit B',
        description: 'Unilateral lower body, overhead pressing, and rows.',
        exerciseSlugs: [
          'reverse-lunge',
          'dumbbell-overhead-press',
          'one-arm-dumbbell-row',
          'dumbbell-biceps-curl',
          'side-plank',
        ],
        setCount: 4,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 60,
      },
      {
        title: 'Athletic Strength Circuit C',
        description: 'Posterior chain focus with upper-body volume.',
        exerciseSlugs: [
          'dumbbell-romanian-deadlift',
          'dumbbell-floor-press',
          'lat-pulldown',
          'dumbbell-overhead-triceps-extension',
          'dead-bug',
        ],
        setCount: 4,
        repsMin: 10,
        repsMax: 14,
        restSeconds: 50,
      },
    ],
    mealSlugs: {
      breakfast: 'egg-sweet-potato-spinach',
      lunch: 'chicken-rice-broccoli',
      dinner: 'salmon-quinoa-carrots',
    },
  },
  {
    slug: 'lean-start-fat-loss-2d',
    title: '2-Day Essential Fat Loss Starter',
    primaryGoal: 'FAT_LOSS',
    supportedGoals: ['FAT_LOSS', 'GET_FIT_TONED'],
    idealLevel: 'BEGINNER',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    trainingDaysPerWeek: 2,
    editorialPriority: 9,
    description:
      'Time-efficient 2-day full-body fat loss program covering all major movement patterns twice weekly paired with a consistent 7-day nutrition plan.',
    requiredEquipment: ['DUMBBELL', 'MAT'],
    intendedAudience:
      'Busy individuals with 2 available training days per week focused on steady weight reduction',
    hintText:
      'Primary choice for any user selecting FAT_LOSS with 2 training days per week.',
    suitabilityNotes: [
      'Complete full-body coverage in just two weekly sessions',
      'Accessible progressions for all experience levels',
    ],
    monthTitles: ['Month 1: Two-Day Full-Body Foundation'],
    workoutFocuses: [
      {
        title: 'Full-Body Session 1',
        description: 'Squat, horizontal press, row, and core stability.',
        exerciseSlugs: [
          'goblet-squat',
          'incline-push-up',
          'one-arm-dumbbell-row',
          'glute-bridge',
          'dead-bug',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 50,
      },
      {
        title: 'Full-Body Session 2',
        description: 'Hinge, lunge, vertical press, and plank.',
        exerciseSlugs: [
          'dumbbell-romanian-deadlift',
          'reverse-lunge',
          'dumbbell-overhead-press',
          'resistance-band-row',
          'front-plank',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 50,
      },
    ],
    mealSlugs: {
      breakfast: 'oats-yogurt-banana',
      lunch: 'tuna-lentil-spinach-bowl',
      dinner: 'chicken-rice-broccoli',
    },
  },
  {
    slug: 'fat-loss-intensive-4d',
    title: '4-Day Metabolic Fat Loss & Upper/Lower Split',
    primaryGoal: 'FAT_LOSS',
    supportedGoals: ['FAT_LOSS', 'GET_FIT_TONED'],
    idealLevel: 'INTERMEDIATE',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    trainingDaysPerWeek: 4,
    editorialPriority: 9,
    description:
      'Four-day upper/lower metabolic split maximizing weekly work output and recovery while supporting consistent fat loss.',
    requiredEquipment: ['DUMBBELL', 'BENCH'],
    intendedAudience:
      'Users training 4 days per week with a primary goal of losing weight while staying strong and athletic',
    hintText:
      'Recommended for 4-day fat loss candidates across beginner to advanced levels.',
    suitabilityNotes: [
      'Alternates upper-body and lower-body sessions to limit localized fatigue',
      'Short rest intervals keep calorie expenditure high',
    ],
    monthTitles: ['Month 1: Upper/Lower Metabolic Split'],
    workoutFocuses: [
      {
        title: 'Lower Body & Core A',
        description: 'Squat, hinge, calves, and trunk control.',
        exerciseSlugs: [
          'goblet-squat',
          'dumbbell-romanian-deadlift',
          'glute-bridge',
          'standing-calf-raise',
          'dead-bug',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 45,
      },
      {
        title: 'Upper Body Metabolic A',
        description: 'Horizontal push/pull and shoulder/arm work.',
        exerciseSlugs: [
          'push-up',
          'one-arm-dumbbell-row',
          'dumbbell-overhead-press',
          'dumbbell-biceps-curl',
          'front-plank',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 45,
      },
      {
        title: 'Lower Body & Core B',
        description: 'Unilateral legs, glutes, and lateral core stability.',
        exerciseSlugs: [
          'reverse-lunge',
          'bodyweight-squat',
          'glute-bridge',
          'standing-calf-raise',
          'side-plank',
        ],
        setCount: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 45,
      },
      {
        title: 'Upper Body Metabolic B',
        description:
          'Floor press, band row, triceps, and posterior chain stability.',
        exerciseSlugs: [
          'dumbbell-floor-press',
          'resistance-band-row',
          'dumbbell-overhead-triceps-extension',
          'bird-dog',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 45,
      },
    ],
    mealSlugs: {
      breakfast: 'egg-sweet-potato-spinach',
      lunch: 'chicken-rice-broccoli',
      dinner: 'tuna-lentil-spinach-bowl',
    },
  },
  {
    slug: 'fat-loss-conditioning-5d',
    title: '5-Day High-Frequency Fat Loss & Core Conditioning',
    primaryGoal: 'FAT_LOSS',
    supportedGoals: ['FAT_LOSS', 'IMPROVE_ENDURANCE'],
    idealLevel: 'INTERMEDIATE',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    trainingDaysPerWeek: 5,
    editorialPriority: 8,
    description:
      'Five-day high-frequency conditioning and resistance program with managed daily volume for consistent daily energy expenditure.',
    requiredEquipment: ['DUMBBELL', 'MAT'],
    intendedAudience:
      'Active users who prefer 5 shorter, focused workouts per week for weight loss',
    hintText:
      'Best fit for users selecting 5 training days per week with a FAT_LOSS goal.',
    suitabilityNotes: [
      'Distributes volume across 5 days to prevent overtraining',
      'Includes dedicated core and mobility-friendly movement days',
    ],
    monthTitles: ['Month 1: Five-Day Metabolic Frequency'],
    workoutFocuses: [
      {
        title: 'Day 1: Lower Body Focus',
        description: 'Squats, lunges, and calves.',
        exerciseSlugs: [
          'goblet-squat',
          'reverse-lunge',
          'standing-calf-raise',
          'dead-bug',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 14,
        restSeconds: 45,
      },
      {
        title: 'Day 2: Upper Push Focus',
        description: 'Chest, shoulders, and triceps.',
        exerciseSlugs: [
          'push-up',
          'dumbbell-floor-press',
          'dumbbell-overhead-press',
          'dumbbell-overhead-triceps-extension',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 14,
        restSeconds: 45,
      },
      {
        title: 'Day 3: Posterior Chain & Core',
        description: 'Hamstrings, glutes, and trunk stability.',
        exerciseSlugs: [
          'dumbbell-romanian-deadlift',
          'glute-bridge',
          'bird-dog',
          'front-plank',
        ],
        setCount: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 45,
      },
      {
        title: 'Day 4: Upper Pull & Arms',
        description: 'Back, rear shoulders, and biceps.',
        exerciseSlugs: [
          'one-arm-dumbbell-row',
          'resistance-band-row',
          'lat-pulldown',
          'dumbbell-biceps-curl',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 14,
        restSeconds: 45,
      },
      {
        title: 'Day 5: Total Body Metabolic Finisher',
        description: 'Full-body conditioning circuit.',
        exerciseSlugs: [
          'bodyweight-squat',
          'incline-push-up',
          'glute-bridge',
          'side-plank',
        ],
        setCount: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 40,
      },
    ],
    mealSlugs: {
      breakfast: 'oats-yogurt-banana',
      lunch: 'chicken-rice-broccoli',
      dinner: 'salmon-quinoa-carrots',
    },
  },
  {
    slug: 'muscle-foundation-full-body-3d',
    title: '3-Day Full-Body Strength & Muscle Foundation',
    primaryGoal: 'STRENGTH_HYPERTROPHY',
    supportedGoals: ['STRENGTH_HYPERTROPHY', 'GET_FIT_TONED'],
    idealLevel: 'BEGINNER',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE'],
    trainingDaysPerWeek: 3,
    editorialPriority: 10,
    description:
      'Foundational 3-day full-body hypertrophy and strength program training every major muscle group three times per week with compound lifts and protein-rich meals.',
    requiredEquipment: ['DUMBBELL', 'BENCH'],
    intendedAudience:
      'Beginner and early-intermediate lifters looking to build muscle and foundational strength 3 days a week',
    hintText:
      'Select this for beginner or early-intermediate users with a STRENGTH_HYPERTROPHY goal and 3 training days per week.',
    suitabilityNotes: [
      'High movement frequency (3x/week per muscle group) ideal for neurological and hypertrophy adaptation',
      'Controlled volume per session with clear progressive overload targets',
    ],
    monthTitles: [
      'Month 1: Compound Strength Base',
      'Month 2: Hypertrophy Volume',
    ],
    workoutFocuses: [
      {
        title: 'Full-Body Strength A',
        description: 'Goblet squat, floor press, one-arm row, and biceps.',
        exerciseSlugs: [
          'goblet-squat',
          'dumbbell-floor-press',
          'one-arm-dumbbell-row',
          'dumbbell-biceps-curl',
          'front-plank',
        ],
        setCount: 3,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 75,
      },
      {
        title: 'Full-Body Strength B',
        description:
          'Romanian deadlift, overhead press, lat pulldown, and triceps.',
        exerciseSlugs: [
          'dumbbell-romanian-deadlift',
          'dumbbell-overhead-press',
          'lat-pulldown',
          'dumbbell-overhead-triceps-extension',
          'dead-bug',
        ],
        setCount: 3,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 75,
      },
      {
        title: 'Full-Body Strength C',
        description:
          'Reverse lunge, push-up, dumbbell row, glutes, and calves.',
        exerciseSlugs: [
          'reverse-lunge',
          'push-up',
          'one-arm-dumbbell-row',
          'glute-bridge',
          'standing-calf-raise',
        ],
        setCount: 3,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 75,
      },
    ],
    mealSlugs: {
      breakfast: 'egg-sweet-potato-spinach',
      lunch: 'chicken-rice-broccoli',
      dinner: 'salmon-quinoa-carrots',
    },
  },
  {
    slug: 'muscle-density-volume-3d',
    title: '3-Day High-Volume Hypertrophy & Muscular Density',
    primaryGoal: 'STRENGTH_HYPERTROPHY',
    supportedGoals: ['STRENGTH_HYPERTROPHY'],
    idealLevel: 'ADVANCED',
    supportedLevels: ['INTERMEDIATE', 'ADVANCED'],
    trainingDaysPerWeek: 3,
    editorialPriority: 9,
    description:
      'High-volume 3-day hypertrophy specialization program for experienced lifters seeking maximum muscular hypertrophy within a 3-day weekly schedule.',
    requiredEquipment: ['DUMBBELL', 'BENCH', 'CABLE_MACHINE', 'LAT_BAR'],
    intendedAudience:
      'Intermediate and advanced lifters training 3 days per week who need higher set volume for muscle growth',
    hintText:
      'Choose this over the beginner 3-day muscle foundation when the user is ADVANCED (or INTERMEDIATE with significant muscle-gain ambition).',
    suitabilityNotes: [
      '4-set prescriptions on primary compound and isolation lifts',
      'Requires familiarity with weighted hinges, presses, and cable machines',
    ],
    monthTitles: [
      'Month 1: Volume Accumulation',
      'Month 2: Hypertrophy Intensification',
    ],
    workoutFocuses: [
      {
        title: 'Hypertrophy Volume A — Chest, Back & Quads',
        description: 'Heavy horizontal push/pull and quad focus.',
        exerciseSlugs: [
          'goblet-squat',
          'dumbbell-floor-press',
          'one-arm-dumbbell-row',
          'push-up',
          'lat-pulldown',
        ],
        setCount: 4,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 90,
      },
      {
        title: 'Hypertrophy Volume B — Posterior Chain, Shoulders & Arms',
        description: 'Hamstrings, delts, biceps, and triceps.',
        exerciseSlugs: [
          'dumbbell-romanian-deadlift',
          'dumbbell-overhead-press',
          'dumbbell-biceps-curl',
          'dumbbell-overhead-triceps-extension',
          'standing-calf-raise',
        ],
        setCount: 4,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 75,
      },
      {
        title: 'Hypertrophy Volume C — Full-Body Density',
        description: 'Unilateral legs, upper back, and core stabilization.',
        exerciseSlugs: [
          'reverse-lunge',
          'lat-pulldown',
          'dumbbell-floor-press',
          'resistance-band-row',
          'side-plank',
        ],
        setCount: 4,
        repsMin: 10,
        repsMax: 12,
        restSeconds: 75,
      },
    ],
    mealSlugs: {
      breakfast: 'oats-yogurt-banana',
      lunch: 'salmon-quinoa-carrots',
      dinner: 'chicken-rice-broccoli',
    },
  },
  {
    slug: 'muscle-hypertrophy-upper-lower-4d',
    title: '4-Day Upper / Lower Strength & Hypertrophy Split',
    primaryGoal: 'STRENGTH_HYPERTROPHY',
    supportedGoals: ['STRENGTH_HYPERTROPHY'],
    idealLevel: 'INTERMEDIATE',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    trainingDaysPerWeek: 4,
    editorialPriority: 10,
    description:
      'Classic 4-day Upper/Lower hypertrophy program balancing mechanical tension and metabolic volume across two upper-body and two lower-body sessions per week.',
    requiredEquipment: ['DUMBBELL', 'BENCH', 'CABLE_MACHINE'],
    intendedAudience:
      'Lifters committing to 4 training days per week focused on building muscle mass and strength',
    hintText:
      'Gold-standard choice for STRENGTH_HYPERTROPHY with 4 training days per week.',
    suitabilityNotes: [
      'Each muscle group trained twice every 7 days with optimal 48–72h recovery',
      'Dedicated upper and lower sessions allow focused accessory work',
    ],
    monthTitles: ['Month 1: Hypertrophy Base', 'Month 2: Progressive Overload'],
    workoutFocuses: [
      {
        title: 'Upper Body Hypertrophy A',
        description:
          'Horizontal press, vertical pull, overhead press, and biceps.',
        exerciseSlugs: [
          'dumbbell-floor-press',
          'lat-pulldown',
          'dumbbell-overhead-press',
          'one-arm-dumbbell-row',
          'dumbbell-biceps-curl',
        ],
        setCount: 4,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 75,
      },
      {
        title: 'Lower Body Hypertrophy A',
        description: 'Squat focus, posterior chain, calves, and trunk.',
        exerciseSlugs: [
          'goblet-squat',
          'dumbbell-romanian-deadlift',
          'glute-bridge',
          'standing-calf-raise',
          'front-plank',
        ],
        setCount: 4,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 75,
      },
      {
        title: 'Upper Body Hypertrophy B',
        description: 'Push-ups, rows, triceps extension, and curls.',
        exerciseSlugs: [
          'push-up',
          'one-arm-dumbbell-row',
          'resistance-band-row',
          'dumbbell-overhead-triceps-extension',
          'dumbbell-biceps-curl',
        ],
        setCount: 4,
        repsMin: 10,
        repsMax: 14,
        restSeconds: 60,
      },
      {
        title: 'Lower Body Hypertrophy B',
        description: 'Unilateral legs, hinge, glutes, and obliques.',
        exerciseSlugs: [
          'reverse-lunge',
          'dumbbell-romanian-deadlift',
          'bodyweight-squat',
          'standing-calf-raise',
          'side-plank',
        ],
        setCount: 4,
        repsMin: 10,
        repsMax: 14,
        restSeconds: 60,
      },
    ],
    mealSlugs: {
      breakfast: 'oats-yogurt-banana',
      lunch: 'chicken-rice-broccoli',
      dinner: 'salmon-quinoa-carrots',
    },
  },
  {
    slug: 'muscle-power-push-pull-legs-5d',
    title: '5-Day Push / Pull / Legs / Upper / Lower Hypertrophy',
    primaryGoal: 'STRENGTH_HYPERTROPHY',
    supportedGoals: ['STRENGTH_HYPERTROPHY'],
    idealLevel: 'ADVANCED',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    trainingDaysPerWeek: 5,
    editorialPriority: 10,
    description:
      'High-volume 5-day hybrid Push/Pull/Legs + Upper/Lower split designed for dedicated muscle growth and progressive strength.',
    requiredEquipment: ['DUMBBELL', 'BENCH', 'CABLE_MACHINE', 'LAT_BAR'],
    intendedAudience:
      'Dedicated lifters with 5 training days per week aiming for maximum hypertrophy',
    hintText:
      'Primary program for users selecting STRENGTH_HYPERTROPHY with 5 training days per week.',
    suitabilityNotes: [
      'Combines PPL specialization with twice-weekly frequency',
      'Paired with high-protein daily meals',
    ],
    monthTitles: ['Month 1: Five-Day Hypertrophy Hybrid'],
    workoutFocuses: [
      {
        title: 'Push — Chest, Shoulders & Triceps',
        description: 'Pressing movements and triceps isolation.',
        exerciseSlugs: [
          'dumbbell-floor-press',
          'dumbbell-overhead-press',
          'push-up',
          'dumbbell-overhead-triceps-extension',
        ],
        setCount: 4,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 75,
      },
      {
        title: 'Pull — Back, Rear Delts & Biceps',
        description: 'Vertical and horizontal pulling plus elbow flexion.',
        exerciseSlugs: [
          'lat-pulldown',
          'one-arm-dumbbell-row',
          'resistance-band-row',
          'dumbbell-biceps-curl',
        ],
        setCount: 4,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 75,
      },
      {
        title: 'Legs — Quads, Hamstrings, Glutes & Calves',
        description: 'Complete lower-body development.',
        exerciseSlugs: [
          'goblet-squat',
          'dumbbell-romanian-deadlift',
          'reverse-lunge',
          'standing-calf-raise',
        ],
        setCount: 4,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 75,
      },
      {
        title: 'Upper Body Hypertrophy',
        description: 'Compound upper-body volume and arms.',
        exerciseSlugs: [
          'incline-push-up',
          'lat-pulldown',
          'dumbbell-overhead-press',
          'dumbbell-biceps-curl',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 14,
        restSeconds: 60,
      },
      {
        title: 'Lower Body & Core Stability',
        description: 'Glutes, posterior chain, and trunk bracing.',
        exerciseSlugs: [
          'dumbbell-romanian-deadlift',
          'glute-bridge',
          'dead-bug',
          'front-plank',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 60,
      },
    ],
    mealSlugs: {
      breakfast: 'egg-sweet-potato-spinach',
      lunch: 'salmon-quinoa-carrots',
      dinner: 'chicken-rice-broccoli',
    },
  },
  {
    slug: 'fit-toned-sculpt-3d',
    title: '3-Day Total Body Sculpt, Core & Toning',
    primaryGoal: 'GET_FIT_TONED',
    supportedGoals: ['GET_FIT_TONED', 'FAT_LOSS'],
    idealLevel: 'BEGINNER',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    trainingDaysPerWeek: 3,
    editorialPriority: 10,
    description:
      'Balanced 3-day full-body toning, posture, and core definition program combining moderate resistance training with core stability.',
    requiredEquipment: ['DUMBBELL', 'MAT'],
    intendedAudience:
      'All fitness levels seeking improved muscle tone, core stability, and balanced daily energy on a 3-day schedule',
    hintText: 'Primary match for GET_FIT_TONED users training 3 days per week.',
    suitabilityNotes: [
      'Emphasizes glutes, core posture, and balanced upper/lower muscle tone',
      'Moderate rep ranges (12–15) with controlled tempo',
    ],
    monthTitles: ['Month 1: Total Body Tone & Core Alignment'],
    workoutFocuses: [
      {
        title: 'Sculpt & Core A',
        description: 'Lower body, push, and supine core control.',
        exerciseSlugs: [
          'goblet-squat',
          'incline-push-up',
          'glute-bridge',
          'dead-bug',
          'front-plank',
        ],
        setCount: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 45,
      },
      {
        title: 'Sculpt & Core B',
        description: 'Unilateral legs, upper back posture, and lateral core.',
        exerciseSlugs: [
          'reverse-lunge',
          'resistance-band-row',
          'dumbbell-overhead-press',
          'side-plank',
          'bird-dog',
        ],
        setCount: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 45,
      },
      {
        title: 'Sculpt & Core C',
        description: 'Posterior chain, arms, and calves.',
        exerciseSlugs: [
          'dumbbell-romanian-deadlift',
          'one-arm-dumbbell-row',
          'dumbbell-biceps-curl',
          'dumbbell-overhead-triceps-extension',
          'standing-calf-raise',
        ],
        setCount: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 45,
      },
    ],
    mealSlugs: {
      breakfast: 'oats-yogurt-banana',
      lunch: 'salmon-quinoa-carrots',
      dinner: 'tofu-black-bean-rice-bowl',
    },
  },
  {
    slug: 'fit-toned-athletic-4d',
    title: '4-Day Functional Toning & Athletic Definition',
    primaryGoal: 'GET_FIT_TONED',
    supportedGoals: ['GET_FIT_TONED', 'IMPROVE_ENDURANCE'],
    idealLevel: 'INTERMEDIATE',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    trainingDaysPerWeek: 4,
    editorialPriority: 10,
    description:
      'Four-day functional fitness and toning program pairing upper/lower sculpting with core endurance.',
    requiredEquipment: ['DUMBBELL', 'MAT', 'RESISTANCE_BAND'],
    intendedAudience:
      'Users training 4 days per week for body recomposition, toning, and functional fitness',
    hintText: 'Primary match for GET_FIT_TONED users training 4 days per week.',
    suitabilityNotes: [
      '4-day structure balances muscular definition and active recovery',
    ],
    monthTitles: ['Month 1: Four-Day Functional Sculpt'],
    workoutFocuses: [
      {
        title: 'Lower Body Sculpt & Glutes',
        description: 'Squats, lunges, bridges, and calves.',
        exerciseSlugs: [
          'goblet-squat',
          'reverse-lunge',
          'glute-bridge',
          'standing-calf-raise',
        ],
        setCount: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 45,
      },
      {
        title: 'Upper Body Posture & Tone',
        description: 'Push, row, shoulders, and core.',
        exerciseSlugs: [
          'push-up',
          'one-arm-dumbbell-row',
          'dumbbell-overhead-press',
          'front-plank',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 45,
      },
      {
        title: 'Posterior Chain & Core Definition',
        description: 'Hamstrings, lower back stability, and obliques.',
        exerciseSlugs: [
          'dumbbell-romanian-deadlift',
          'glute-bridge',
          'bird-dog',
          'side-plank',
        ],
        setCount: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 45,
      },
      {
        title: 'Arms, Back & Total Core',
        description: 'Upper back, biceps, triceps, and dead bug.',
        exerciseSlugs: [
          'resistance-band-row',
          'dumbbell-biceps-curl',
          'dumbbell-overhead-triceps-extension',
          'dead-bug',
        ],
        setCount: 3,
        repsMin: 12,
        repsMax: 15,
        restSeconds: 45,
      },
    ],
    mealSlugs: {
      breakfast: 'oats-yogurt-banana',
      lunch: 'chicken-rice-broccoli',
      dinner: 'tuna-lentil-spinach-bowl',
    },
  },
  {
    slug: 'endurance-stamina-builder-3d',
    title: '3-Day Muscular Endurance & Work Capacity Builder',
    primaryGoal: 'IMPROVE_ENDURANCE',
    supportedGoals: ['IMPROVE_ENDURANCE', 'GET_FIT_TONED'],
    idealLevel: 'BEGINNER',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    trainingDaysPerWeek: 3,
    editorialPriority: 10,
    description:
      'Three-day high-repetition muscular endurance and stamina program with short rest periods to elevate cardiovascular and muscular work capacity.',
    requiredEquipment: ['DUMBBELL', 'MAT'],
    intendedAudience:
      'Athletes of any level training 3 days per week to boost stamina, work capacity, and muscular endurance',
    hintText:
      'Primary match for IMPROVE_ENDURANCE users training 3 days per week.',
    suitabilityNotes: [
      'Higher repetition ranges (15–20) with 30-second rest intervals',
      'Builds local muscular stamina and trunk fatigue resistance',
    ],
    monthTitles: ['Month 1: Stamina & Work Capacity Foundation'],
    workoutFocuses: [
      {
        title: 'Endurance Circuit A',
        description: 'High-rep squats, incline push-ups, rows, and core.',
        exerciseSlugs: [
          'bodyweight-squat',
          'incline-push-up',
          'resistance-band-row',
          'glute-bridge',
          'front-plank',
        ],
        setCount: 3,
        repsMin: 15,
        repsMax: 20,
        restSeconds: 30,
      },
      {
        title: 'Endurance Circuit B',
        description: 'Lunges, hinge, overhead press, and quadruped stability.',
        exerciseSlugs: [
          'reverse-lunge',
          'dumbbell-romanian-deadlift',
          'dumbbell-overhead-press',
          'bird-dog',
          'standing-calf-raise',
        ],
        setCount: 3,
        repsMin: 15,
        repsMax: 20,
        restSeconds: 30,
      },
      {
        title: 'Endurance Circuit C',
        description: 'Goblet squats, push-ups, rows, and trunk stamina.',
        exerciseSlugs: [
          'goblet-squat',
          'push-up',
          'one-arm-dumbbell-row',
          'dead-bug',
          'side-plank',
        ],
        setCount: 3,
        repsMin: 15,
        repsMax: 20,
        restSeconds: 30,
      },
    ],
    mealSlugs: {
      breakfast: 'oats-yogurt-banana',
      lunch: 'chicken-rice-broccoli',
      dinner: 'salmon-quinoa-carrots',
    },
  },
  {
    slug: 'athletic-performance-6d',
    title: '6-Day High-Frequency Hypertrophy & Conditioning Split',
    primaryGoal: 'STRENGTH_HYPERTROPHY',
    supportedGoals: ['STRENGTH_HYPERTROPHY', 'IMPROVE_ENDURANCE'],
    idealLevel: 'ADVANCED',
    supportedLevels: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    trainingDaysPerWeek: 6,
    editorialPriority: 10,
    description:
      'Six-day Push/Pull/Legs twice-weekly training schedule with structured nutrition for high-frequency athletes.',
    requiredEquipment: ['DUMBBELL', 'BENCH', 'CABLE_MACHINE', 'LAT_BAR'],
    intendedAudience:
      'Committed athletes training 6 days per week for muscle development and conditioning',
    hintText:
      'Primary match for users selecting 6 training days per week with STRENGTH_HYPERTROPHY.',
    suitabilityNotes: [
      'Six weekly training sessions organized in a rotating Push/Pull/Legs split',
    ],
    monthTitles: ['Month 1: Six-Day PPL Rotation'],
    workoutFocuses: [
      {
        title: 'Push A',
        description: 'Chest, shoulders, and triceps.',
        exerciseSlugs: [
          'dumbbell-floor-press',
          'dumbbell-overhead-press',
          'push-up',
          'dumbbell-overhead-triceps-extension',
        ],
        setCount: 3,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 60,
      },
      {
        title: 'Pull A',
        description: 'Back and biceps.',
        exerciseSlugs: [
          'lat-pulldown',
          'one-arm-dumbbell-row',
          'resistance-band-row',
          'dumbbell-biceps-curl',
        ],
        setCount: 3,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 60,
      },
      {
        title: 'Legs A',
        description: 'Quads, glutes, and calves.',
        exerciseSlugs: [
          'goblet-squat',
          'reverse-lunge',
          'glute-bridge',
          'standing-calf-raise',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 14,
        restSeconds: 60,
      },
      {
        title: 'Push B',
        description: 'Incline push, overhead press, triceps, and core.',
        exerciseSlugs: [
          'incline-push-up',
          'dumbbell-overhead-press',
          'dumbbell-floor-press',
          'front-plank',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 14,
        restSeconds: 60,
      },
      {
        title: 'Pull B',
        description: 'Rows, pulldown, curls, and posterior stability.',
        exerciseSlugs: [
          'one-arm-dumbbell-row',
          'lat-pulldown',
          'dumbbell-biceps-curl',
          'bird-dog',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 14,
        restSeconds: 60,
      },
      {
        title: 'Legs B & Core',
        description: 'Hinge, squat, and trunk control.',
        exerciseSlugs: [
          'dumbbell-romanian-deadlift',
          'bodyweight-squat',
          'dead-bug',
          'side-plank',
        ],
        setCount: 3,
        repsMin: 10,
        repsMax: 15,
        restSeconds: 60,
      },
    ],
    mealSlugs: {
      breakfast: 'egg-sweet-potato-spinach',
      lunch: 'chicken-rice-broccoli',
      dinner: 'salmon-quinoa-carrots',
    },
  },
];

export async function seedPublishedProgramsAndRuleset(
  db: DataSource,
  model = process.env.AI_MODEL || 'google/gemini-2.5-flash',
) {
  const [counts] = await query(
    db,
    `SELECT (SELECT count(*)::int FROM exercise_revisions) AS ex_revs,
            (SELECT count(*)::int FROM food_versions) AS food_revs,
            (SELECT count(*)::int FROM meal_items) AS meal_items,
            (SELECT count(*)::int FROM workout_exercises) AS workout_ex,
            (SELECT count(*)::int FROM program_enrollments) AS enrollments`,
  );
  const [progCount] = await query(
    db,
    'SELECT count(*)::int AS count FROM programs',
  );
  if (
    process.env.NODE_ENV !== 'production' &&
    counts.enrollments === 0 &&
    (counts.ex_revs < 19 ||
      counts.food_revs < 17 ||
      counts.meal_items < 1 ||
      (progCount.count > 0 && counts.workout_ex === 0))
  ) {
    await query(
      db,
      `TRUNCATE content_seed_imports, exercises, foods, ingredients, food_reference_items, food_exchange_groups, meal_sections, meals, programs, nutrition_plans, workouts CASCADE`,
    );
  }

  await seedLookups(db);
  await seedContent(db);
  await importLibrary(db, resolve(__dirname, 'data/nutrition-library.v1.json'));
  await importLibrary(db, resolve(__dirname, 'data/exercise-library.v1.json'));

  return db.transaction(async (m) => {
    await query(m, 'SELECT pg_advisory_xact_lock(1793448099)');

    // Mark seeded ingredients as VERIFIED and publish draft seeded foods, sections, meals, and exercises.
    await query(
      m,
      `UPDATE ingredients SET verification_status='VERIFIED' WHERE verification_status='UNKNOWN'`,
    );
    await query(
      m,
      `UPDATE food_versions SET status='PUBLISHED', revision=revision+1 WHERE status='DRAFT'`,
    );
    await query(
      m,
      `UPDATE food_exchange_group_versions SET status='PUBLISHED', revision=revision+1 WHERE status='DRAFT'`,
    );
    await query(
      m,
      `UPDATE meal_versions SET status='PUBLISHED', revision=revision+1 WHERE status='DRAFT'`,
    );
    await query(
      m,
      `UPDATE exercise_revisions SET status='PUBLISHED', revision=revision+1 WHERE status='DRAFT'`,
    );

    const exerciseRows = await query(
      m,
      `SELECT e.slug, er.id AS revision_id
       FROM exercises e
       JOIN LATERAL (
         SELECT id FROM exercise_revisions
         WHERE exercise_id=e.id AND status='PUBLISHED'
         ORDER BY version DESC LIMIT 1
       ) er ON true`,
    );
    const exerciseBySlug = new Map<string, string>(
      exerciseRows.map((r: { slug: string; revision_id: string }) => [
        r.slug,
        r.revision_id,
      ]),
    );

    const mealRows = await query(
      m,
      `SELECT ml.slug, mv.id AS version_id
       FROM meals ml
       JOIN LATERAL (
         SELECT id FROM meal_versions
         WHERE meal_id=ml.id AND status='PUBLISHED'
         ORDER BY version DESC LIMIT 1
       ) mv ON true`,
    );
    const mealBySlug = new Map<string, string>(
      mealRows.map((r: { slug: string; version_id: string }) => [
        r.slug,
        r.version_id,
      ]),
    );

    let insertedPrograms = 0;
    for (const spec of PROGRAM_CATALOG_SPECS) {
      const [existing] = await query(
        m,
        'SELECT id FROM programs WHERE slug=$1',
        [spec.slug],
      );
      if (existing) continue;

      const programId = stableUuid(`motion-program:${spec.slug}`);
      const versionId = stableUuid(`motion-program-version:${spec.slug}:v1`);
      const nutritionPlanId = stableUuid(`motion-nutrition-plan:${spec.slug}`);
      const nutritionVersionId = stableUuid(
        `motion-nutrition-version:${spec.slug}:v1`,
      );
      const durationDays = spec.monthTitles.length * 28;

      await query(m, 'INSERT INTO programs(id,slug) VALUES($1,$2)', [
        programId,
        spec.slug,
      ]);
      await query(m, 'INSERT INTO nutrition_plans(id,slug) VALUES($1,$2)', [
        nutritionPlanId,
        `${spec.slug}-nutrition-v1`,
      ]);
      await query(
        m,
        `INSERT INTO nutrition_plan_versions(id,nutrition_plan_id,version,duration_days)
         VALUES($1,$2,1,$3)`,
        [nutritionVersionId, nutritionPlanId, durationDays],
      );
      await query(
        m,
        `INSERT INTO program_versions(
           id,program_id,version,title,primary_goal,ideal_level,
           training_days_per_week,editorial_priority,description,
           required_equipment,intended_audience,nutrition_plan_version_id
         ) VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          versionId,
          programId,
          spec.title,
          spec.primaryGoal,
          spec.idealLevel,
          spec.trainingDaysPerWeek,
          spec.editorialPriority,
          spec.description,
          spec.requiredEquipment,
          spec.intendedAudience,
          nutritionVersionId,
        ],
      );

      for (const goal of spec.supportedGoals) {
        await query(
          m,
          `INSERT INTO program_version_supported_goals(program_version_id,primary_goal_code)
           VALUES($1,$2)`,
          [versionId, goal],
        );
      }
      for (const level of spec.supportedLevels) {
        await query(
          m,
          `INSERT INTO program_version_supported_levels(program_version_id,fitness_level_code)
           VALUES($1,$2)`,
          [versionId, level],
        );
      }

      let ordinal = 0;
      const nutritionDayValues: string[] = [];
      const workoutValues: string[] = [];
      const workoutRevValues: string[] = [];
      const workoutExValues: string[] = [];
      const planDayValues: string[] = [];
      const mealSlotValues: string[] = [];
      const params: unknown[] = [];
      const pushParam = (val: unknown) => {
        params.push(val);
        return `$${params.length}`;
      };

      for (
        let monthIndex = 0;
        monthIndex < spec.monthTitles.length;
        monthIndex++
      ) {
        const monthId = stableUuid(
          `motion-program-month:${spec.slug}:${monthIndex + 1}`,
        );
        await query(
          m,
          `INSERT INTO monthly_plans(id,program_version_id,position,title)
           VALUES($1,$2,$3,$4)`,
          [monthId, versionId, monthIndex + 1, spec.monthTitles[monthIndex]],
        );

        for (let weekIndex = 0; weekIndex < 4; weekIndex++) {
          const weekId = stableUuid(
            `motion-program-week:${spec.slug}:${monthIndex + 1}:${weekIndex + 1}`,
          );
          await query(
            m,
            `INSERT INTO plan_weeks(id,monthly_plan_id,position)
             VALUES($1,$2,$3)`,
            [weekId, monthId, weekIndex + 1],
          );

          let trainingSlot = 0;
          for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            ordinal++;
            const isTraining = dayIndex < spec.trainingDaysPerWeek;
            const nutritionDayId = stableUuid(
              `motion-nutrition-day:${spec.slug}:${ordinal}`,
            );
            nutritionDayValues.push(
              `('${nutritionDayId}','${nutritionVersionId}',${ordinal})`,
            );

            let workoutRevisionId: string | null = null;
            if (isTraining) {
              const focus =
                spec.workoutFocuses[trainingSlot % spec.workoutFocuses.length];
              trainingSlot++;
              const workoutId = stableUuid(
                `motion-workout:${spec.slug}:${ordinal}`,
              );
              workoutRevisionId = stableUuid(
                `motion-workout-rev:${spec.slug}:${ordinal}`,
              );
              workoutValues.push(
                `('${workoutId}','program-${versionId}-${ordinal}')`,
              );
              workoutRevValues.push(
                `('${workoutRevisionId}','${workoutId}',1,${pushParam(focus.title)},${pushParam(focus.description)},'DRAFT')`,
              );
              for (let exPos = 0; exPos < focus.exerciseSlugs.length; exPos++) {
                const exRevId = exerciseBySlug.get(focus.exerciseSlugs[exPos]);
                if (!exRevId) {
                  throw new Error(
                    `Missing published exercise revision for slug ${focus.exerciseSlugs[exPos]}`,
                  );
                }
                const weId = stableUuid(
                  `motion-workout-ex:${spec.slug}:${ordinal}:${exPos}`,
                );
                workoutExValues.push(
                  `('${weId}','${workoutRevisionId}','${exRevId}',${exPos},${focus.setCount},${focus.repsMin},${focus.repsMax},NULL,${focus.restSeconds})`,
                );
              }
            }

            const planDayId = stableUuid(
              `motion-plan-day:${spec.slug}:${ordinal}`,
            );
            planDayValues.push(
              `('${planDayId}','${weekId}',${dayIndex + 1},'${isTraining ? 'TRAINING' : 'REST'}',${workoutRevisionId ? `'${workoutRevisionId}'` : 'NULL'},'${nutritionDayId}')`,
            );

            const slots = [
              ['BREAKFAST', '08:00', spec.mealSlugs.breakfast],
              ['LUNCH', '13:30', spec.mealSlugs.lunch],
              ['DINNER', '19:30', spec.mealSlugs.dinner],
            ] as const;
            for (let slotPos = 0; slotPos < slots.length; slotPos++) {
              const [mealType, localTime, mealSlug] = slots[slotPos];
              const mealVersionId = mealBySlug.get(mealSlug);
              if (!mealVersionId) {
                throw new Error(`Missing published meal for slug ${mealSlug}`);
              }
              const msId = stableUuid(
                `motion-meal-slot:${spec.slug}:${ordinal}:${slotPos}`,
              );
              mealSlotValues.push(
                `('${msId}','${nutritionDayId}',${slotPos},'${mealType}','${localTime}','${mealVersionId}')`,
              );
            }
          }
        }
      }

      await query(
        m,
        `INSERT INTO nutrition_template_days(id,nutrition_plan_version_id,day_position) VALUES ${nutritionDayValues.join(',')}`,
      );
      if (workoutValues.length) {
        await query(
          m,
          `INSERT INTO workouts(id,slug) VALUES ${workoutValues.join(',')}`,
        );
        await query(
          m,
          `INSERT INTO workout_revisions(id,workout_id,version,title,description,status) VALUES ${workoutRevValues.join(',')}`,
          params,
        );
        await query(
          m,
          `INSERT INTO workout_exercises(id,workout_revision_id,exercise_revision_id,position,set_count,reps_min,reps_max,duration_seconds,rest_seconds) VALUES ${workoutExValues.join(',')}`,
        );
      }
      await query(
        m,
        `INSERT INTO plan_days(id,week_id,position,kind,workout_revision_id,nutrition_template_day_id) VALUES ${planDayValues.join(',')}`,
      );
      await query(
        m,
        `INSERT INTO meal_slots(id,template_day_id,position,meal_type,local_time,default_meal_version_id) VALUES ${mealSlotValues.join(',')}`,
      );

      const [approver] = await query(
        m,
        `SELECT user_id FROM user_roles WHERE role_code='ADMIN' LIMIT 1`,
      );
      if (approver) {
        const hintId = stableUuid(`motion-program-hint:${spec.slug}:v1`);
        await query(
          m,
          `INSERT INTO program_hint_versions(id,program_version_id,version,original_text,structured_hints)
           VALUES($1,$2,1,$3,$4)`,
          [
            hintId,
            versionId,
            spec.hintText,
            JSON.stringify({
              summary: spec.hintText,
              intendedAudience: spec.intendedAudience,
              suitabilityNotes: spec.suitabilityNotes,
            }),
          ],
        );
        await query(
          m,
          `UPDATE program_hint_versions SET status='APPROVED', approved_by=$2, approved_at=now() WHERE id=$1`,
          [hintId, approver.user_id],
        );
        await query(
          m,
          `UPDATE program_versions SET approved_hint_version_id=$2 WHERE id=$1`,
          [versionId, hintId],
        );
      }

      await query(
        m,
        `UPDATE workout_revisions SET status='PUBLISHED', revision=revision+1
         WHERE id IN (
           SELECT workout_revision_id FROM plan_days
           WHERE workout_revision_id IS NOT NULL
             AND week_id IN (
               SELECT w.id FROM plan_weeks w
               JOIN monthly_plans mp ON mp.id=w.monthly_plan_id
               WHERE mp.program_version_id=$1
             )
         )`,
        [versionId],
      );
      await query(
        m,
        `UPDATE nutrition_plan_versions SET status='PUBLISHED', revision=revision+1 WHERE id=$1`,
        [nutritionVersionId],
      );
      await query(
        m,
        `UPDATE program_versions SET status='PUBLISHED', revision=revision+1 WHERE id=$1`,
        [versionId],
      );
      insertedPrograms++;
    }

    const [activeRuleset] = await query(
      m,
      'SELECT id,model FROM matching_rulesets WHERE active LIMIT 1',
    );
    let rulesetId = activeRuleset?.id ?? null;
    if (!activeRuleset) {
      rulesetId = stableUuid(`motion-gemini-ruleset:${model}:v1`);
      await query(
        m,
        `INSERT INTO matching_rulesets(
           id,status,active,instruction_version,instructions,model,
           policy_version,schema_version,evaluation_reference,published_at
         ) VALUES(
           $1,'PUBLISHED',true,'gemini-matching-v1',$2,$3,
           'matching-constraints-v1','matching-output-v1',
           'motion-expert-fixture-evaluation-v1',now()
         ) ON CONFLICT (id) DO NOTHING`,
        [
          rulesetId,
          'Compare all eligible candidate programs against the user profile and BMI context. When multiple candidates share the same primaryGoal, trainingDaysPerWeek, and supportedLevels, prefer candidates whose idealLevel, description, intendedAudience, and approvedHints best align with the user fitnessLevel, current weight vs target weight delta, and training focus.',
          model,
        ],
      );
    }

    return {
      insertedPrograms,
      totalCatalogPrograms: PROGRAM_CATALOG_SPECS.length,
      activeRulesetId: rulesetId,
      model: activeRuleset?.model ?? model,
    };
  });
}

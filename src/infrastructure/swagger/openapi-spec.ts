export type SwaggerAudience = 'customer' | 'admin' | 'all';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface ParamSpec {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  description: string;
  schema: Record<string, unknown>;
  example?: unknown;
}

interface RouteDoc {
  method: HttpMethod;
  path: string;
  audience: 'customer' | 'admin' | 'both';
  tag: string;
  adminTag?: string;
  summary: string;
  description?: string;
  auth?: 'bearer' | 'none';
  params?: ParamSpec[];
  bodyExample?: Record<string, unknown>;
  bodyDescription?: string;
  successStatus?: number;
}

const uuidParam = (name: string, description: string): ParamSpec => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' },
  example: '00000000-0000-4000-8000-000000000001',
});

const datePathParam = (
  name = 'date',
  description = 'Local calendar date (YYYY-MM-DD)',
): ParamSpec => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'date' },
  example: '2026-11-22',
});

const paginationParams = (): ParamSpec[] => [
  {
    name: 'limit',
    in: 'query',
    required: false,
    description: 'Maximum items to return (1–100)',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
  },
  {
    name: 'offset',
    in: 'query',
    required: false,
    description: 'Pagination offset',
    schema: { type: 'integer', minimum: 0, default: 0 },
  },
];

const ROUTES: RouteDoc[] = [
  // =========================================================================
  // 01. AUTHENTICATION
  // =========================================================================
  {
    method: 'post',
    path: '/auth/register',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Register a new user account',
    description:
      'Creates a new athlete account with email & password and sends a 6-digit email verification OTP.',
    auth: 'none',
    successStatus: 201,
    bodyExample: {
      email: 'athlete@example.com',
      password: 'StrongPassword!123',
    },
  },
  {
    method: 'post',
    path: '/auth/verify-email',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Verify email with 6-digit OTP',
    auth: 'none',
    bodyExample: { email: 'athlete@example.com', code: '123456' },
  },
  {
    method: 'post',
    path: '/auth/resend-verification',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Resend email verification OTP',
    auth: 'none',
    bodyExample: { email: 'athlete@example.com' },
  },
  {
    method: 'post',
    path: '/auth/login',
    audience: 'both',
    tag: '01. Authentication',
    adminTag: '12. Admin — Authentication & Health',
    summary: 'Sign in with email and password',
    description:
      'Returns short-lived accessToken (Bearer JWT) and rotatable refreshToken.',
    auth: 'none',
    bodyExample: {
      email: 'athlete@example.com',
      password: 'StrongPassword!123',
    },
  },
  {
    method: 'post',
    path: '/auth/refresh',
    audience: 'both',
    tag: '01. Authentication',
    adminTag: '12. Admin — Authentication & Health',
    summary: 'Rotate refresh token and issue a new access token',
    auth: 'none',
    bodyExample: { refreshToken: '<refresh-token>' },
  },
  {
    method: 'post',
    path: '/auth/logout',
    audience: 'both',
    tag: '01. Authentication',
    adminTag: '12. Admin — Authentication & Health',
    summary: 'Sign out current session',
    auth: 'bearer',
  },
  {
    method: 'post',
    path: '/auth/logout-all',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Revoke all active sessions for the current user',
    auth: 'bearer',
  },
  {
    method: 'post',
    path: '/auth/forgot-password',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Request a 6-digit password reset OTP',
    auth: 'none',
    bodyExample: { email: 'athlete@example.com' },
  },
  {
    method: 'post',
    path: '/auth/verify-reset-code',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Verify password reset OTP and obtain single-use resetToken',
    auth: 'none',
    bodyExample: { email: 'athlete@example.com', code: '123456' },
  },
  {
    method: 'post',
    path: '/auth/reset-password',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Set a new password using a verified resetToken',
    auth: 'none',
    bodyExample: {
      resetToken: '<reset-token>',
      newPassword: 'NewStrongPassword!123',
      confirmPassword: 'NewStrongPassword!123',
    },
  },
  {
    method: 'post',
    path: '/auth/change-password',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Change current password and revoke other sessions',
    auth: 'bearer',
    bodyExample: {
      currentPassword: 'StrongPassword!123',
      newPassword: 'NewStrongPassword!456',
      confirmPassword: 'NewStrongPassword!456',
    },
  },
  {
    method: 'post',
    path: '/auth/challenges',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Create a single-use nonce challenge for Google/Apple sign-in',
    auth: 'none',
    successStatus: 201,
    bodyExample: { provider: 'GOOGLE', purpose: 'LOGIN' },
  },
  {
    method: 'post',
    path: '/auth/google',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Authenticate with Google ID token',
    auth: 'none',
    bodyExample: {
      idToken: '<google-id-token>',
      challengeId: '00000000-0000-4000-8000-000000000001',
    },
  },
  {
    method: 'post',
    path: '/auth/apple',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Authenticate with Apple identity token and authorization code',
    auth: 'none',
    bodyExample: {
      identityToken: '<apple-id-token>',
      authorizationCode: '<apple-auth-code>',
      challengeId: '00000000-0000-4000-8000-000000000001',
    },
  },
  {
    method: 'post',
    path: '/auth/reauthenticate',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Fresh re-authentication proof for sensitive actions',
    description:
      'Returns a short-lived purpose-scoped proof token for LINK or DELETE_ACCOUNT.',
    auth: 'bearer',
    bodyExample: {
      purpose: 'DELETE_ACCOUNT',
      password: 'StrongPassword!123',
    },
  },
  {
    method: 'post',
    path: '/auth/identities/:provider/link',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Link a Google or Apple identity to the signed-in account',
    auth: 'bearer',
    params: [
      {
        name: 'provider',
        in: 'path',
        required: true,
        description: 'Social provider name',
        schema: { type: 'string', enum: ['google', 'apple'] },
      },
    ],
    bodyExample: {
      proofToken: '<reauth-link-proof>',
      challengeId: '00000000-0000-4000-8000-000000000001',
      idToken: '<provider-token>',
    },
  },
  {
    method: 'post',
    path: '/me/account-deletion',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Request permanent account deletion',
    auth: 'bearer',
    bodyExample: { proofToken: '<reauth-delete-proof>' },
  },
  {
    method: 'get',
    path: '/me/account-deletion',
    audience: 'customer',
    tag: '01. Authentication',
    summary: 'Check account deletion job status',
    auth: 'none',
    params: [
      {
        name: 'X-Deletion-Token',
        in: 'header',
        required: true,
        description:
          'Deletion status token returned by POST /me/account-deletion',
        schema: { type: 'string' },
      },
    ],
  },

  // =========================================================================
  // 02. REFERENCES & LOOKUPS
  // =========================================================================
  {
    method: 'get',
    path: '/references/onboarding',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'Fetch all onboarding options in a single request',
    auth: 'none',
  },
  {
    method: 'get',
    path: '/references/genders',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'List active gender lookup options',
    auth: 'none',
  },
  {
    method: 'get',
    path: '/references/primary-goals',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'List active primary fitness goals',
    auth: 'none',
  },
  {
    method: 'get',
    path: '/references/fitness-levels',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'List active fitness level options',
    auth: 'none',
  },
  {
    method: 'get',
    path: '/references/allergens',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'List active allergen codes',
    auth: 'none',
  },
  {
    method: 'get',
    path: '/references/body-areas',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'List active injury body areas',
    auth: 'none',
  },
  {
    method: 'get',
    path: '/references/roles',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'List available role lookup codes',
    auth: 'none',
  },
  {
    method: 'get',
    path: '/references/foods',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'List selectable foods and ingredients for dislike preferences',
    auth: 'none',
    params: paginationParams(),
  },
  {
    method: 'get',
    path: '/references/ingredients',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'List published reference ingredients',
    auth: 'none',
    params: paginationParams(),
  },
  {
    method: 'get',
    path: '/references/ingredients/:id',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'Get a single reference ingredient by ID',
    auth: 'none',
    params: [uuidParam('id', 'Ingredient ID')],
  },
  {
    method: 'get',
    path: '/references/meal-sections',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'List published meal sections',
    auth: 'none',
    params: paginationParams(),
  },
  {
    method: 'get',
    path: '/references/meals',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'List published reference meals',
    auth: 'none',
    params: paginationParams(),
  },
  {
    method: 'get',
    path: '/references/meals/:id',
    audience: 'customer',
    tag: '02. References & Lookups',
    summary: 'Get a published reference meal with its items',
    auth: 'none',
    params: [uuidParam('id', 'Meal ID')],
  },

  // =========================================================================
  // 03. PROFILE, ONBOARDING & SETTINGS
  // =========================================================================
  {
    method: 'get',
    path: '/me',
    audience: 'customer',
    tag: '03. Profile, Onboarding & Settings',
    summary:
      'Get current user profile, active injuries, preferences, and matching status',
    auth: 'bearer',
  },
  {
    method: 'patch',
    path: '/me',
    audience: 'customer',
    tag: '03. Profile, Onboarding & Settings',
    summary: 'Update user profile fields',
    description:
      'Updates profile fields, logs weight snapshots automatically when weight_kg changes, and triggers AI program rematching if matching criteria changed.',
    auth: 'bearer',
    bodyExample: {
      name: 'Mohamed',
      weight_kg: 82.5,
      target_weight_kg: 76,
      training_days_per_week: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
    },
  },
  {
    method: 'put',
    path: '/me/onboarding',
    audience: 'customer',
    tag: '03. Profile, Onboarding & Settings',
    summary:
      'Complete initial onboarding and queue automatic AI program matching',
    auth: 'bearer',
    bodyExample: {
      name: 'Mohamed',
      gender: 'MALE',
      date_of_birth: '1997-05-10',
      timezone: 'Africa/Cairo',
      locale: 'ar',
      height_cm: 180,
      weight_kg: 85,
      target_weight_kg: 76,
      primary_goal: 'FAT_LOSS',
      fitness_level: 'BEGINNER',
      training_days_per_week: ['SUNDAY', 'TUESDAY', 'THURSDAY'],
      food_preferences: {
        allergen_codes: ['PEANUT'],
        disliked_food_ids: [],
      },
    },
  },
  {
    method: 'get',
    path: '/me/settings',
    audience: 'customer',
    tag: '03. Profile, Onboarding & Settings',
    summary: 'Get user app settings (theme, reminders, quiet hours)',
    auth: 'bearer',
  },
  {
    method: 'patch',
    path: '/me/settings',
    audience: 'customer',
    tag: '03. Profile, Onboarding & Settings',
    summary: 'Update user app settings',
    auth: 'bearer',
    bodyExample: {
      theme: 'DARK',
      reminders: { workout: true, water: true },
    },
  },
  {
    method: 'get',
    path: '/me/food-preferences',
    audience: 'customer',
    tag: '03. Profile, Onboarding & Settings',
    summary: 'Get user allergies and disliked foods',
    auth: 'bearer',
  },
  {
    method: 'put',
    path: '/me/food-preferences',
    audience: 'customer',
    tag: '03. Profile, Onboarding & Settings',
    summary: 'Replace user allergies and disliked foods',
    auth: 'bearer',
    bodyExample: {
      allergen_codes: ['MILK', 'PEANUT'],
      disliked_food_ids: [],
    },
  },

  // =========================================================================
  // 04. INJURIES & AI REWRITER
  // =========================================================================
  {
    method: 'get',
    path: '/me/injuries',
    audience: 'customer',
    tag: '04. Injuries & AI Rewriter',
    summary: 'List active user injuries',
    auth: 'bearer',
    params: paginationParams(),
  },
  {
    method: 'post',
    path: '/me/injuries',
    audience: 'customer',
    tag: '04. Injuries & AI Rewriter',
    summary: 'Add a confirmed user injury',
    auth: 'bearer',
    successStatus: 201,
    bodyExample: {
      body_area_code: 'KNEE',
      side: 'LEFT',
      description: 'Mild sharp pain when squatting below parallel.',
    },
  },
  {
    method: 'patch',
    path: '/me/injuries/:id',
    audience: 'customer',
    tag: '04. Injuries & AI Rewriter',
    summary: 'Edit an active user injury',
    auth: 'bearer',
    params: [uuidParam('id', 'Injury ID')],
    bodyExample: {
      body_area_code: 'KNEE',
      side: 'LEFT',
      description: 'Pain occurs mainly during deep lunges and jumps.',
    },
  },
  {
    method: 'delete',
    path: '/me/injuries/:id',
    audience: 'customer',
    tag: '04. Injuries & AI Rewriter',
    summary: 'Remove (deactivate) an active injury',
    auth: 'bearer',
    params: [uuidParam('id', 'Injury ID')],
  },
  {
    method: 'post',
    path: '/me/injuries/rewrite',
    audience: 'customer',
    tag: '04. Injuries & AI Rewriter',
    summary: 'Preview AI-rewritten injury description (Gemini)',
    description:
      'Preview-only rewrite that clarifies user injury text without saving until confirmed.',
    auth: 'bearer',
    bodyExample: {
      body_area_code: 'KNEE',
      side: 'LEFT',
      description: 'left knee hurts when I go down deep',
      draftVersion: 1,
    },
  },

  // =========================================================================
  // 05. PROGRAM, MATCHING & SCHEDULE
  // =========================================================================
  {
    method: 'get',
    path: '/me/matching/status',
    audience: 'customer',
    tag: '05. Program, Matching & Schedule',
    summary: 'Get latest AI program matching run status',
    auth: 'bearer',
  },
  {
    method: 'post',
    path: '/me/matching/retry',
    audience: 'customer',
    tag: '05. Program, Matching & Schedule',
    summary: 'Retry failed or stale AI program matching',
    auth: 'bearer',
  },
  {
    method: 'get',
    path: '/me/program',
    audience: 'customer',
    tag: '05. Program, Matching & Schedule',
    summary:
      'Get current assigned program and any pending replacement proposal',
    auth: 'bearer',
  },
  {
    method: 'post',
    path: '/me/program/change/accept',
    audience: 'customer',
    tag: '05. Program, Matching & Schedule',
    summary: 'Accept and activate a pending replacement program recommendation',
    auth: 'bearer',
    bodyExample: {
      recommendationRunId: '00000000-0000-4000-8000-000000000001',
    },
  },
  {
    method: 'get',
    path: '/me/program/months',
    audience: 'customer',
    tag: '05. Program, Matching & Schedule',
    summary: 'List program months with unlock progress and adherence metrics',
    auth: 'bearer',
  },
  {
    method: 'get',
    path: '/me/program/months/:monthId/weeks',
    audience: 'customer',
    tag: '05. Program, Matching & Schedule',
    summary: 'List scheduled weeks inside an unlocked program month',
    auth: 'bearer',
    params: [uuidParam('monthId', 'Monthly plan ID')],
  },
  {
    method: 'get',
    path: '/me/program/weeks/:weekId/days',
    audience: 'customer',
    tag: '05. Program, Matching & Schedule',
    summary: 'List scheduled training/rest days inside a week',
    auth: 'bearer',
    params: [uuidParam('weekId', 'Plan week ID')],
  },
  {
    method: 'get',
    path: '/me/days/:date',
    audience: 'customer',
    tag: '05. Program, Matching & Schedule',
    summary: 'Get complete daily training & meal overview for a specific date',
    description:
      'Automatically runs daily injury exercise fitting for due training days and returns restriction statuses and video URLs.',
    auth: 'bearer',
    params: [datePathParam('date', 'Local date in YYYY-MM-DD format')],
  },

  // =========================================================================
  // 06. DAILY WORKOUTS & EXERCISE FITTING
  // =========================================================================
  {
    method: 'get',
    path: '/me/workouts/current',
    audience: 'customer',
    tag: '06. Daily Workouts & Exercise Fitting',
    summary: 'Get the currently in-progress workout session (if any)',
    auth: 'bearer',
  },
  {
    method: 'get',
    path: '/me/workouts/days/:dayId/fitting',
    audience: 'customer',
    tag: '06. Daily Workouts & Exercise Fitting',
    summary:
      'Get or trigger daily AI injury exercise fitting for a scheduled day',
    auth: 'bearer',
    params: [uuidParam('dayId', 'Scheduled day ID')],
  },
  {
    method: 'post',
    path: '/me/workouts/days/:dayId/fitting/retry',
    audience: 'customer',
    tag: '06. Daily Workouts & Exercise Fitting',
    summary: 'Retry failed daily AI exercise fitting for a due day',
    auth: 'bearer',
    params: [uuidParam('dayId', 'Scheduled day ID')],
  },
  {
    method: 'post',
    path: '/me/workouts/days/:dayId/start',
    audience: 'customer',
    tag: '06. Daily Workouts & Exercise Fitting',
    summary: 'Start a workout session for a due scheduled training day',
    auth: 'bearer',
    successStatus: 201,
    params: [uuidParam('dayId', 'Scheduled day ID')],
  },
  {
    method: 'get',
    path: '/me/workouts/:sessionId',
    audience: 'customer',
    tag: '06. Daily Workouts & Exercise Fitting',
    summary: 'Get workout session details, exercises, and logged sets',
    auth: 'bearer',
    params: [uuidParam('sessionId', 'Workout session ID')],
  },
  {
    method: 'put',
    path: '/me/workouts/:sessionId/exercises/:exerciseId/sets/:setNumber',
    audience: 'customer',
    tag: '06. Daily Workouts & Exercise Fitting',
    summary: 'Log or update a set inside an active workout session',
    auth: 'bearer',
    params: [
      uuidParam('sessionId', 'Workout session ID'),
      uuidParam('exerciseId', 'Workout exercise occurrence ID'),
      {
        name: 'setNumber',
        in: 'path',
        required: true,
        description: '1-based set number',
        schema: { type: 'integer', minimum: 1 },
        example: 1,
      },
    ],
    bodyExample: {
      status: 'COMPLETED',
      actualReps: 12,
      weightKg: 20,
      durationSeconds: null,
    },
  },
  {
    method: 'put',
    path: '/me/workouts/:sessionId/exercises/:exerciseId/completion',
    audience: 'customer',
    tag: '06. Daily Workouts & Exercise Fitting',
    summary:
      'Mark an entire exercise as completed or incomplete in the session',
    auth: 'bearer',
    params: [
      uuidParam('sessionId', 'Workout session ID'),
      uuidParam('exerciseId', 'Workout exercise occurrence ID'),
    ],
    bodyExample: { completed: true },
  },
  {
    method: 'post',
    path: '/me/workouts/:sessionId/complete',
    audience: 'customer',
    tag: '06. Daily Workouts & Exercise Fitting',
    summary:
      'Complete an active workout session (and unlock next month when eligible)',
    auth: 'bearer',
    params: [uuidParam('sessionId', 'Workout session ID')],
  },
  {
    method: 'post',
    path: '/me/workouts/:sessionId/abandon',
    audience: 'customer',
    tag: '06. Daily Workouts & Exercise Fitting',
    summary: 'Abandon an in-progress workout session',
    auth: 'bearer',
    params: [uuidParam('sessionId', 'Workout session ID')],
  },

  // =========================================================================
  // 07. DAILY NUTRITION & SWAPS
  // =========================================================================
  {
    method: 'get',
    path: '/me/nutrition/assignment',
    audience: 'customer',
    tag: '07. Daily Nutrition & Swaps',
    summary: 'Get active nutrition plan assignment summary',
    auth: 'bearer',
  },
  {
    method: 'get',
    path: '/me/nutrition/days/:date',
    audience: 'customer',
    tag: '07. Daily Nutrition & Swaps',
    summary:
      'Get scheduled meals, scaled macros, and allergen/dislike flags for a date',
    auth: 'bearer',
    params: [datePathParam('date', 'Local date (YYYY-MM-DD)')],
  },
  {
    method: 'get',
    path: '/me/meals/:mealId',
    audience: 'customer',
    tag: '07. Daily Nutrition & Swaps',
    summary: 'Get detailed scheduled meal with items and macro breakdown',
    auth: 'bearer',
    params: [uuidParam('mealId', 'Scheduled meal ID')],
  },
  {
    method: 'put',
    path: '/me/meals/:mealId/completion',
    audience: 'customer',
    tag: '07. Daily Nutrition & Swaps',
    summary: 'Mark an entire scheduled meal as completed or pending',
    auth: 'bearer',
    params: [uuidParam('mealId', 'Scheduled meal ID')],
    bodyExample: { completed: true },
  },
  {
    method: 'get',
    path: '/me/meals/:mealId/alternatives',
    audience: 'customer',
    tag: '07. Daily Nutrition & Swaps',
    summary:
      'List same-section replacement meal alternatives filtered by user allergies',
    auth: 'bearer',
    params: [uuidParam('mealId', 'Scheduled meal ID')],
  },
  {
    method: 'post',
    path: '/me/meals/:mealId/substitutions',
    audience: 'customer',
    tag: '07. Daily Nutrition & Swaps',
    summary: 'Swap an entire scheduled meal with a same-section alternative',
    auth: 'bearer',
    successStatus: 201,
    params: [uuidParam('mealId', 'Scheduled meal ID')],
    bodyExample: {
      selectedMealVersionId: '00000000-0000-4000-8000-000000000001',
    },
  },
  {
    method: 'put',
    path: '/me/meal-items/:itemId/completion',
    audience: 'customer',
    tag: '07. Daily Nutrition & Swaps',
    summary: 'Toggle completion of a single item inside a scheduled meal',
    auth: 'bearer',
    params: [uuidParam('itemId', 'Scheduled meal item ID')],
    bodyExample: { completed: true },
  },
  {
    method: 'get',
    path: '/me/meal-items/:itemId/alternatives',
    audience: 'customer',
    tag: '07. Daily Nutrition & Swaps',
    summary: 'List same-food-section swap alternatives with scaled portions',
    auth: 'bearer',
    params: [uuidParam('itemId', 'Scheduled meal item ID')],
  },
  {
    method: 'post',
    path: '/me/meal-items/:itemId/substitutions',
    audience: 'customer',
    tag: '07. Daily Nutrition & Swaps',
    summary:
      'Swap a single meal item with a portion-scaled alternative from its exchange group',
    auth: 'bearer',
    successStatus: 201,
    params: [uuidParam('itemId', 'Scheduled meal item ID')],
    bodyExample: {
      selectedMemberId: '00000000-0000-4000-8000-000000000001',
    },
  },

  // =========================================================================
  // 08. DAILY ACTIVITY (WATER & STEPS)
  // =========================================================================
  {
    method: 'get',
    path: '/me/activity/daily',
    audience: 'customer',
    tag: '08. Daily Activity (Water & Steps)',
    summary: 'Get daily water logs and step count progress',
    auth: 'bearer',
    params: [
      {
        name: 'date',
        in: 'query',
        required: false,
        description: 'Local date (defaults to today in user timezone)',
        schema: { type: 'string', format: 'date' },
      },
    ],
  },
  {
    method: 'post',
    path: '/me/activity/water',
    audience: 'customer',
    tag: '08. Daily Activity (Water & Steps)',
    summary: 'Add a water intake entry in milliliters',
    auth: 'bearer',
    successStatus: 201,
    bodyExample: { milliliters: 250 },
  },
  {
    method: 'delete',
    path: '/me/activity/water/:id',
    audience: 'customer',
    tag: '08. Daily Activity (Water & Steps)',
    summary: 'Delete a logged water intake entry',
    auth: 'bearer',
    params: [uuidParam('id', 'Water log ID')],
  },
  {
    method: 'put',
    path: '/me/activity/steps',
    audience: 'customer',
    tag: '08. Daily Activity (Water & Steps)',
    summary: 'Update daily step count or manual goal completion',
    auth: 'bearer',
    bodyExample: { steps: 8500, manuallyCompleted: false },
  },
  {
    method: 'put',
    path: '/me/activity/goals',
    audience: 'customer',
    tag: '08. Daily Activity (Water & Steps)',
    summary: 'Update daily water (ml) and steps targets',
    auth: 'bearer',
    bodyExample: { waterGoalMl: 3000, stepsGoal: 10000 },
  },

  // =========================================================================
  // 09. HOME DASHBOARD, PROGRESS & CHECK-INS
  // =========================================================================
  {
    method: 'get',
    path: '/me/dashboard',
    audience: 'customer',
    tag: '09. Home Dashboard, Progress & Check-ins',
    summary:
      'Unified Home screen payload (profile, program, today workout & nutrition, activity, check-in status, unread count)',
    auth: 'bearer',
    params: [
      {
        name: 'date',
        in: 'query',
        required: false,
        description: 'Optional local date (YYYY-MM-DD)',
        schema: { type: 'string', format: 'date' },
      },
    ],
  },
  {
    method: 'get',
    path: '/me/progress',
    audience: 'customer',
    tag: '09. Home Dashboard, Progress & Check-ins',
    summary:
      'Aggregated progress analytics (workouts, sets, meals, activity, weight history, check-in status)',
    auth: 'bearer',
    params: [
      {
        name: 'from',
        in: 'query',
        required: false,
        description: 'Start date (YYYY-MM-DD, bounded to max 93 days)',
        schema: { type: 'string', format: 'date' },
      },
      {
        name: 'to',
        in: 'query',
        required: false,
        description: 'End date (YYYY-MM-DD)',
        schema: { type: 'string', format: 'date' },
      },
    ],
  },
  {
    method: 'get',
    path: '/me/weight-history',
    audience: 'customer',
    tag: '09. Home Dashboard, Progress & Check-ins',
    summary: 'Get chronological weight history curve and change summary',
    auth: 'bearer',
    params: [
      {
        name: 'from',
        in: 'query',
        required: false,
        description: 'Start date (YYYY-MM-DD)',
        schema: { type: 'string', format: 'date' },
      },
      {
        name: 'to',
        in: 'query',
        required: false,
        description: 'End date (YYYY-MM-DD)',
        schema: { type: 'string', format: 'date' },
      },
    ],
  },
  {
    method: 'get',
    path: '/me/check-ins',
    audience: 'customer',
    tag: '09. Home Dashboard, Progress & Check-ins',
    summary: 'Get periodic 3-day check-in status, next due date, and history',
    auth: 'bearer',
    params: paginationParams(),
  },
  {
    method: 'post',
    path: '/me/check-ins',
    audience: 'customer',
    tag: '09. Home Dashboard, Progress & Check-ins',
    summary:
      'Submit a periodic 3-day check-in and receive an automated progress summary',
    auth: 'bearer',
    successStatus: 201,
    bodyExample: {
      workoutDifficulty: 'MODERATE',
      nutritionAdherence: 'HIGH',
      weightKg: 82.4,
      notes: 'Energy felt great across all 3 sessions.',
    },
  },

  // =========================================================================
  // 10. NOTIFICATIONS & WATER REMINDERS
  // =========================================================================
  {
    method: 'get',
    path: '/me/notifications',
    audience: 'customer',
    tag: '10. Notifications & Water Reminders',
    summary: 'List in-app notifications inbox and unread count',
    auth: 'bearer',
    params: [
      ...paginationParams(),
      {
        name: 'unreadOnly',
        in: 'query',
        required: false,
        description: 'Filter to unread notifications only',
        schema: { type: 'string', enum: ['true', 'false'] },
      },
    ],
  },
  {
    method: 'put',
    path: '/me/notifications/:id/read',
    audience: 'customer',
    tag: '10. Notifications & Water Reminders',
    summary: 'Mark a single notification as read',
    auth: 'bearer',
    params: [uuidParam('id', 'Notification ID')],
  },
  {
    method: 'post',
    path: '/me/notifications/read-all',
    audience: 'customer',
    tag: '10. Notifications & Water Reminders',
    summary: 'Mark all unread notifications as read',
    auth: 'bearer',
  },
  {
    method: 'get',
    path: '/me/water-reminders',
    audience: 'customer',
    tag: '10. Notifications & Water Reminders',
    summary: 'Get smart water reminder settings and next local reminder time',
    auth: 'bearer',
  },
  {
    method: 'put',
    path: '/me/water-reminders',
    audience: 'customer',
    tag: '10. Notifications & Water Reminders',
    summary: 'Update smart water reminder schedule',
    auth: 'bearer',
    bodyExample: {
      enabled: true,
      intervalMinutes: 60,
      windowStart: '08:00',
      windowEnd: '22:00',
      stopWhenGoalReached: true,
    },
  },

  // =========================================================================
  // 11. SUPPORT, FAQ & LEGAL
  // =========================================================================
  {
    method: 'get',
    path: '/faq',
    audience: 'customer',
    tag: '11. Support, FAQ & Legal',
    summary: 'Search and filter active FAQ entries (English & Arabic)',
    auth: 'none',
    params: [
      {
        name: 'locale',
        in: 'query',
        required: false,
        description: 'Language locale',
        schema: { type: 'string', enum: ['en', 'ar'] },
      },
      {
        name: 'category',
        in: 'query',
        required: false,
        description:
          'FAQ category (e.g. PROGRAMS, WORKOUTS, NUTRITION, PROGRESS)',
        schema: { type: 'string' },
      },
      {
        name: 'q',
        in: 'query',
        required: false,
        description: 'Search keyword',
        schema: { type: 'string' },
      },
    ],
  },
  {
    method: 'get',
    path: '/legal/terms',
    audience: 'customer',
    tag: '11. Support, FAQ & Legal',
    summary: 'Get active Terms & Conditions document',
    auth: 'none',
    params: [
      {
        name: 'locale',
        in: 'query',
        required: false,
        description: 'Document locale (default en)',
        schema: { type: 'string', enum: ['en', 'ar'], default: 'en' },
      },
    ],
  },
  {
    method: 'get',
    path: '/legal/privacy',
    audience: 'customer',
    tag: '11. Support, FAQ & Legal',
    summary: 'Get active Privacy Policy document',
    auth: 'none',
    params: [
      {
        name: 'locale',
        in: 'query',
        required: false,
        description: 'Document locale (default en)',
        schema: { type: 'string', enum: ['en', 'ar'], default: 'en' },
      },
    ],
  },
  {
    method: 'get',
    path: '/me/legal-acceptances',
    audience: 'customer',
    tag: '11. Support, FAQ & Legal',
    summary: 'List user legal acceptances and active document status',
    auth: 'bearer',
  },
  {
    method: 'post',
    path: '/me/legal-acceptances',
    audience: 'customer',
    tag: '11. Support, FAQ & Legal',
    summary: 'Record user acceptance of a legal document version',
    auth: 'bearer',
    bodyExample: {
      documentId: '82000000-0000-4000-8000-000000000001',
    },
  },

  // =========================================================================
  // 12. MEDIA & AVATARS
  // =========================================================================
  {
    method: 'post',
    path: '/media/upload-intents',
    audience: 'customer',
    tag: '12. Media & Avatars',
    summary: 'Request a presigned S3 upload URL for a user avatar image',
    auth: 'bearer',
    successStatus: 201,
    bodyExample: { mime: 'image/jpeg', sizeBytes: 120000 },
  },
  {
    method: 'post',
    path: '/media/:id/finalize',
    audience: 'customer',
    tag: '12. Media & Avatars',
    summary: 'Verify and finalize an uploaded user avatar image',
    auth: 'bearer',
    params: [uuidParam('id', 'Media asset ID')],
  },
  {
    method: 'get',
    path: '/media/:id',
    audience: 'customer',
    tag: '12. Media & Avatars',
    summary: 'Get a presigned download URL for an authorized media asset',
    auth: 'bearer',
    params: [uuidParam('id', 'Media asset ID')],
  },

  // =========================================================================
  // 13. SYSTEM HEALTH
  // =========================================================================
  {
    method: 'get',
    path: '/health',
    audience: 'both',
    tag: '13. System Health',
    adminTag: '12. Admin — Authentication & Health',
    summary: 'Liveness probe with API version and uptime',
    auth: 'none',
  },
  {
    method: 'get',
    path: '/health/ready',
    audience: 'both',
    tag: '13. System Health',
    adminTag: '12. Admin — Authentication & Health',
    summary:
      'Readiness probe verifying PostgreSQL connectivity, lookups, migrations, and dependency status',
    auth: 'none',
  },

  // =========================================================================
  // ADMIN ROUTES
  // =========================================================================
  // 01. Admin — Analytics, Gemini Usage & Uptime
  {
    method: 'get',
    path: '/admin/analytics/overview',
    audience: 'admin',
    tag: '01. Admin — Analytics, Gemini Usage & Uptime',
    summary:
      'Get platform KPIs, Gemini API token & cost analytics, uptime metrics, and integrations status',
    auth: 'bearer',
    params: [
      {
        name: 'days',
        in: 'query',
        required: false,
        description: 'Lookback period in days (1–90, default 30)',
        schema: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
      },
    ],
  },
  {
    method: 'post',
    path: '/admin/analytics/uptime-check',
    audience: 'admin',
    tag: '01. Admin — Analytics, Gemini Usage & Uptime',
    summary:
      'Trigger an immediate live DB & Gemini AI sidecar health probe and record it',
    auth: 'bearer',
  },

  // 02. Admin — Programs & Hints
  {
    method: 'get',
    path: '/admin/programs',
    audience: 'admin',
    tag: '02. Admin — Programs & Hints',
    summary: 'List all training & nutrition programs',
    auth: 'bearer',
    params: paginationParams(),
  },
  {
    method: 'post',
    path: '/admin/programs',
    audience: 'admin',
    tag: '02. Admin — Programs & Hints',
    summary: 'Create a new draft paired training and nutrition program',
    auth: 'bearer',
    successStatus: 201,
  },
  {
    method: 'get',
    path: '/admin/programs/:id',
    audience: 'admin',
    tag: '02. Admin — Programs & Hints',
    summary: 'Get a program with all versions, months, weeks, days, and hints',
    auth: 'bearer',
    params: [uuidParam('id', 'Program ID')],
  },
  {
    method: 'patch',
    path: '/admin/programs/:id',
    audience: 'admin',
    tag: '02. Admin — Programs & Hints',
    summary:
      'Update draft program or create a new draft version from a published one',
    auth: 'bearer',
    params: [uuidParam('id', 'Program ID')],
  },
  {
    method: 'post',
    path: '/admin/programs/:id/publish',
    audience: 'admin',
    tag: '02. Admin — Programs & Hints',
    summary: 'Publish a validated draft program version',
    auth: 'bearer',
    params: [uuidParam('id', 'Program ID')],
  },
  {
    method: 'delete',
    path: '/admin/programs/:id',
    audience: 'admin',
    tag: '02. Admin — Programs & Hints',
    summary: 'Archive a program',
    auth: 'bearer',
    params: [uuidParam('id', 'Program ID')],
  },
  {
    method: 'post',
    path: '/admin/programs/:id/hints',
    audience: 'admin',
    tag: '02. Admin — Programs & Hints',
    summary: 'Create a draft AI matching hint version for a program',
    auth: 'bearer',
    successStatus: 201,
    params: [uuidParam('id', 'Program ID')],
  },
  {
    method: 'post',
    path: '/admin/programs/:id/hints/rewrite',
    audience: 'admin',
    tag: '02. Admin — Programs & Hints',
    summary: 'Preview AI-structured program matching hints using Gemini',
    auth: 'bearer',
    successStatus: 201,
    params: [uuidParam('id', 'Program ID')],
    bodyExample: {
      originalText:
        'Ideal for beginners looking for 3-day joint-friendly fat loss.',
    },
  },
  {
    method: 'post',
    path: '/admin/programs/:id/hints/:hintId/approve',
    audience: 'admin',
    tag: '02. Admin — Programs & Hints',
    summary: 'Approve a draft program hint version for AI matching',
    auth: 'bearer',
    params: [
      uuidParam('id', 'Program ID'),
      uuidParam('hintId', 'Program hint ID'),
    ],
  },

  // 03. Admin — Exercises & Foods (Versioned Content)
  {
    method: 'get',
    path: '/admin/:kind',
    audience: 'admin',
    tag: '03. Admin — Exercises & Foods (Versioned Content)',
    summary: 'List shared exercises or foods',
    auth: 'bearer',
    params: [
      {
        name: 'kind',
        in: 'path',
        required: true,
        description: 'Content kind',
        schema: { type: 'string', enum: ['exercises', 'foods'] },
      },
      ...paginationParams(),
    ],
  },
  {
    method: 'post',
    path: '/admin/:kind',
    audience: 'admin',
    tag: '03. Admin — Exercises & Foods (Versioned Content)',
    summary: 'Create a new draft exercise or food',
    auth: 'bearer',
    successStatus: 201,
    params: [
      {
        name: 'kind',
        in: 'path',
        required: true,
        description: 'Content kind',
        schema: { type: 'string', enum: ['exercises', 'foods'] },
      },
    ],
  },
  {
    method: 'get',
    path: '/admin/:kind/:id',
    audience: 'admin',
    tag: '03. Admin — Exercises & Foods (Versioned Content)',
    summary: 'Get a shared exercise or food with version history',
    auth: 'bearer',
    params: [
      {
        name: 'kind',
        in: 'path',
        required: true,
        description: 'Content kind',
        schema: { type: 'string', enum: ['exercises', 'foods'] },
      },
      uuidParam('id', 'Exercise or Food ID'),
    ],
  },
  {
    method: 'patch',
    path: '/admin/:kind/:id',
    audience: 'admin',
    tag: '03. Admin — Exercises & Foods (Versioned Content)',
    summary:
      'Revise an exercise or food (updates draft or creates new draft version)',
    auth: 'bearer',
    params: [
      {
        name: 'kind',
        in: 'path',
        required: true,
        description: 'Content kind',
        schema: { type: 'string', enum: ['exercises', 'foods'] },
      },
      uuidParam('id', 'Exercise or Food ID'),
    ],
  },
  {
    method: 'post',
    path: '/admin/:kind/:id/publish',
    audience: 'admin',
    tag: '03. Admin — Exercises & Foods (Versioned Content)',
    summary: 'Publish the latest draft version of an exercise or food',
    auth: 'bearer',
    params: [
      {
        name: 'kind',
        in: 'path',
        required: true,
        description: 'Content kind',
        schema: { type: 'string', enum: ['exercises', 'foods'] },
      },
      uuidParam('id', 'Exercise or Food ID'),
    ],
  },
  {
    method: 'delete',
    path: '/admin/:kind/:id',
    audience: 'admin',
    tag: '03. Admin — Exercises & Foods (Versioned Content)',
    summary: 'Archive an exercise or food',
    auth: 'bearer',
    params: [
      {
        name: 'kind',
        in: 'path',
        required: true,
        description: 'Content kind',
        schema: { type: 'string', enum: ['exercises', 'foods'] },
      },
      uuidParam('id', 'Exercise or Food ID'),
    ],
  },

  // 04. Admin — Ingredients
  {
    method: 'get',
    path: '/admin/ingredients',
    audience: 'admin',
    tag: '04. Admin — Ingredients',
    summary: 'List all ingredients and allergen tags',
    auth: 'bearer',
    params: paginationParams(),
  },
  {
    method: 'post',
    path: '/admin/ingredients',
    audience: 'admin',
    tag: '04. Admin — Ingredients',
    summary: 'Create a new ingredient with allergen metadata',
    auth: 'bearer',
    successStatus: 201,
  },
  {
    method: 'get',
    path: '/admin/ingredients/:id',
    audience: 'admin',
    tag: '04. Admin — Ingredients',
    summary: 'Get a single ingredient by ID',
    auth: 'bearer',
    params: [uuidParam('id', 'Ingredient ID')],
  },
  {
    method: 'patch',
    path: '/admin/ingredients/:id',
    audience: 'admin',
    tag: '04. Admin — Ingredients',
    summary: 'Update an ingredient',
    auth: 'bearer',
    params: [uuidParam('id', 'Ingredient ID')],
  },
  {
    method: 'delete',
    path: '/admin/ingredients/:id',
    audience: 'admin',
    tag: '04. Admin — Ingredients',
    summary: 'Archive an ingredient',
    auth: 'bearer',
    params: [uuidParam('id', 'Ingredient ID')],
  },

  // 05. Admin — Food Sections
  {
    method: 'get',
    path: '/admin/food-sections',
    audience: 'admin',
    tag: '05. Admin — Food Sections',
    summary: 'List all food exchange sections',
    auth: 'bearer',
    params: paginationParams(),
  },
  {
    method: 'post',
    path: '/admin/food-sections',
    audience: 'admin',
    tag: '05. Admin — Food Sections',
    summary: 'Create a new draft food exchange section',
    auth: 'bearer',
    successStatus: 201,
  },
  {
    method: 'get',
    path: '/admin/food-sections/:id',
    audience: 'admin',
    tag: '05. Admin — Food Sections',
    summary: 'Get a food exchange section and its members',
    auth: 'bearer',
    params: [uuidParam('id', 'Food section ID')],
  },
  {
    method: 'patch',
    path: '/admin/food-sections/:id',
    audience: 'admin',
    tag: '05. Admin — Food Sections',
    summary: 'Revise a food exchange section',
    auth: 'bearer',
    params: [uuidParam('id', 'Food section ID')],
  },
  {
    method: 'post',
    path: '/admin/food-sections/:id/publish',
    audience: 'admin',
    tag: '05. Admin — Food Sections',
    summary:
      'Publish a food exchange section (requires at least 2 published foods)',
    auth: 'bearer',
    params: [uuidParam('id', 'Food section ID')],
  },
  {
    method: 'delete',
    path: '/admin/food-sections/:id',
    audience: 'admin',
    tag: '05. Admin — Food Sections',
    summary: 'Archive a food exchange section',
    auth: 'bearer',
    params: [uuidParam('id', 'Food section ID')],
  },

  // 06. Admin — Meal Sections
  {
    method: 'get',
    path: '/admin/meal-sections',
    audience: 'admin',
    tag: '06. Admin — Meal Sections',
    summary: 'List all meal sections',
    auth: 'bearer',
    params: paginationParams(),
  },
  {
    method: 'post',
    path: '/admin/meal-sections',
    audience: 'admin',
    tag: '06. Admin — Meal Sections',
    summary: 'Create a new meal section',
    auth: 'bearer',
    successStatus: 201,
    bodyExample: {
      slug: 'high-protein-breakfast',
      title: 'High-Protein Breakfast',
    },
  },
  {
    method: 'get',
    path: '/admin/meal-sections/:id',
    audience: 'admin',
    tag: '06. Admin — Meal Sections',
    summary: 'Get a meal section by ID',
    auth: 'bearer',
    params: [uuidParam('id', 'Meal section ID')],
  },
  {
    method: 'patch',
    path: '/admin/meal-sections/:id',
    audience: 'admin',
    tag: '06. Admin — Meal Sections',
    summary: 'Update a meal section',
    auth: 'bearer',
    params: [uuidParam('id', 'Meal section ID')],
  },
  {
    method: 'delete',
    path: '/admin/meal-sections/:id',
    audience: 'admin',
    tag: '06. Admin — Meal Sections',
    summary: 'Archive a meal section',
    auth: 'bearer',
    params: [uuidParam('id', 'Meal section ID')],
  },

  // 07. Admin — Meals & Meal Items
  {
    method: 'get',
    path: '/admin/meals',
    audience: 'admin',
    tag: '07. Admin — Meals & Meal Items',
    summary: 'List all shared meals',
    auth: 'bearer',
    params: paginationParams(),
  },
  {
    method: 'post',
    path: '/admin/meals',
    audience: 'admin',
    tag: '07. Admin — Meals & Meal Items',
    summary: 'Create a new draft shared meal',
    auth: 'bearer',
    successStatus: 201,
  },
  {
    method: 'get',
    path: '/admin/meals/:id',
    audience: 'admin',
    tag: '07. Admin — Meals & Meal Items',
    summary: 'Get a shared meal with its versions and food items',
    auth: 'bearer',
    params: [uuidParam('id', 'Meal ID')],
  },
  {
    method: 'patch',
    path: '/admin/meals/:id',
    audience: 'admin',
    tag: '07. Admin — Meals & Meal Items',
    summary: 'Revise a shared meal',
    auth: 'bearer',
    params: [uuidParam('id', 'Meal ID')],
  },
  {
    method: 'post',
    path: '/admin/meals/:id/publish',
    audience: 'admin',
    tag: '07. Admin — Meals & Meal Items',
    summary: 'Publish the latest draft version of a meal',
    auth: 'bearer',
    params: [uuidParam('id', 'Meal ID')],
  },
  {
    method: 'delete',
    path: '/admin/meals/:id',
    audience: 'admin',
    tag: '07. Admin — Meals & Meal Items',
    summary: 'Archive a shared meal',
    auth: 'bearer',
    params: [uuidParam('id', 'Meal ID')],
  },
  {
    method: 'get',
    path: '/admin/meals/:id/items',
    audience: 'admin',
    tag: '07. Admin — Meals & Meal Items',
    summary: 'List items in the current version of a meal',
    auth: 'bearer',
    params: [uuidParam('id', 'Meal ID')],
  },
  {
    method: 'post',
    path: '/admin/meals/:id/items',
    audience: 'admin',
    tag: '07. Admin — Meals & Meal Items',
    summary: 'Add a food item to a meal',
    auth: 'bearer',
    successStatus: 201,
    params: [uuidParam('id', 'Meal ID')],
  },
  {
    method: 'get',
    path: '/admin/meals/:id/items/:position',
    audience: 'admin',
    tag: '07. Admin — Meals & Meal Items',
    summary: 'Get a specific meal item by position',
    auth: 'bearer',
    params: [
      uuidParam('id', 'Meal ID'),
      {
        name: 'position',
        in: 'path',
        required: true,
        description: '0-based item position',
        schema: { type: 'integer', minimum: 0 },
      },
    ],
  },
  {
    method: 'patch',
    path: '/admin/meals/:id/items/:position',
    audience: 'admin',
    tag: '07. Admin — Meals & Meal Items',
    summary: 'Update a meal item at position',
    auth: 'bearer',
    params: [
      uuidParam('id', 'Meal ID'),
      {
        name: 'position',
        in: 'path',
        required: true,
        description: '0-based item position',
        schema: { type: 'integer', minimum: 0 },
      },
    ],
  },
  {
    method: 'delete',
    path: '/admin/meals/:id/items/:position',
    audience: 'admin',
    tag: '07. Admin — Meals & Meal Items',
    summary: 'Remove a meal item at position',
    auth: 'bearer',
    params: [
      uuidParam('id', 'Meal ID'),
      {
        name: 'position',
        in: 'path',
        required: true,
        description: '0-based item position',
        schema: { type: 'integer', minimum: 0 },
      },
    ],
  },

  // 08. Admin — Shared Media Library
  {
    method: 'get',
    path: '/admin/media',
    audience: 'admin',
    tag: '08. Admin — Shared Media Library',
    summary: 'List shared library media assets (videos & images)',
    auth: 'bearer',
    params: paginationParams(),
  },
  {
    method: 'post',
    path: '/admin/media/upload-intents',
    audience: 'admin',
    tag: '08. Admin — Shared Media Library',
    summary: 'Request a presigned S3 upload URL for shared exercise/food media',
    auth: 'bearer',
    successStatus: 201,
    bodyExample: { mime: 'video/mp4', sizeBytes: 5242880 },
  },
  {
    method: 'post',
    path: '/admin/media/:id/finalize',
    audience: 'admin',
    tag: '08. Admin — Shared Media Library',
    summary: 'Finalize an uploaded shared library media asset',
    auth: 'bearer',
    params: [uuidParam('id', 'Media asset ID')],
  },
  {
    method: 'get',
    path: '/admin/media/:id',
    audience: 'admin',
    tag: '08. Admin — Shared Media Library',
    summary: 'Get shared media asset metadata and signed URL',
    auth: 'bearer',
    params: [uuidParam('id', 'Media asset ID')],
  },
  {
    method: 'delete',
    path: '/admin/media/:id',
    audience: 'admin',
    tag: '08. Admin — Shared Media Library',
    summary: 'Archive an unreferenced shared media asset',
    auth: 'bearer',
    params: [uuidParam('id', 'Media asset ID')],
  },

  // 09. Admin — AI Matching Rulesets & Simulation
  {
    method: 'get',
    path: '/admin/matching/rulesets',
    audience: 'admin',
    tag: '09. Admin — AI Matching Rulesets & Simulation',
    summary: 'List all AI program matching rulesets',
    auth: 'bearer',
    params: paginationParams(),
  },
  {
    method: 'post',
    path: '/admin/matching/rulesets',
    audience: 'admin',
    tag: '09. Admin — AI Matching Rulesets & Simulation',
    summary: 'Create a new draft AI matching ruleset',
    auth: 'bearer',
    successStatus: 201,
    bodyExample: {
      instructionVersion: 'gemini-ruleset-v2',
      model: 'google/gemini-2.5-flash',
      instructions:
        'Select the single best published program matching goal, level, and weekly training days.',
    },
  },
  {
    method: 'post',
    path: '/admin/matching/rulesets/:id/publish',
    audience: 'admin',
    tag: '09. Admin — AI Matching Rulesets & Simulation',
    summary: 'Publish and activate a draft matching ruleset',
    auth: 'bearer',
    params: [uuidParam('id', 'Ruleset ID')],
    bodyExample: { evaluationReference: 'eval-suite-2026-11-22' },
  },
  {
    method: 'post',
    path: '/admin/matching/rulesets/:id/simulate',
    audience: 'admin',
    tag: '09. Admin — AI Matching Rulesets & Simulation',
    summary: 'Queue a synthetic athlete profile simulation against a ruleset',
    auth: 'bearer',
    successStatus: 201,
    params: [uuidParam('id', 'Ruleset ID')],
    bodyExample: {
      primaryGoal: 'FAT_LOSS',
      fitnessLevel: 'BEGINNER',
      trainingDaysPerWeek: 3,
      age: 29,
      heightCm: 178,
      weightKg: 88,
      targetWeightKg: 78,
      gender: 'MALE',
    },
  },
  {
    method: 'get',
    path: '/admin/matching/runs/:id',
    audience: 'admin',
    tag: '09. Admin — AI Matching Rulesets & Simulation',
    summary: 'Inspect an AI matching or simulation run result',
    auth: 'bearer',
    params: [uuidParam('id', 'Recommendation run ID')],
  },

  // 10. Admin — Reference Lookups
  {
    method: 'post',
    path: '/admin/lookups/:table',
    audience: 'admin',
    tag: '10. Admin — Reference Lookups',
    summary: 'Add an entry to a configurable reference lookup table',
    auth: 'bearer',
    successStatus: 201,
    params: [
      {
        name: 'table',
        in: 'path',
        required: true,
        description: 'Lookup table key',
        schema: {
          type: 'string',
          enum: [
            'genders',
            'primary-goals',
            'fitness-levels',
            'allergens',
            'body-areas',
          ],
        },
      },
    ],
  },
  {
    method: 'patch',
    path: '/admin/lookups/:table/:code',
    audience: 'admin',
    tag: '10. Admin — Reference Lookups',
    summary: 'Update a reference lookup entry',
    auth: 'bearer',
    params: [
      {
        name: 'table',
        in: 'path',
        required: true,
        description: 'Lookup table key',
        schema: { type: 'string' },
      },
      {
        name: 'code',
        in: 'path',
        required: true,
        description: 'Lookup entry code',
        schema: { type: 'string' },
      },
    ],
  },
  {
    method: 'delete',
    path: '/admin/lookups/:table/:code',
    audience: 'admin',
    tag: '10. Admin — Reference Lookups',
    summary: 'Deactivate a reference lookup entry',
    auth: 'bearer',
    params: [
      {
        name: 'table',
        in: 'path',
        required: true,
        description: 'Lookup table key',
        schema: { type: 'string' },
      },
      {
        name: 'code',
        in: 'path',
        required: true,
        description: 'Lookup entry code',
        schema: { type: 'string' },
      },
    ],
  },

  // 11. Admin — Support, FAQ & Legal
  {
    method: 'get',
    path: '/admin/faq',
    audience: 'admin',
    tag: '11. Admin — Support, FAQ & Legal',
    summary: 'List all FAQ entries (including inactive drafts)',
    auth: 'bearer',
  },
  {
    method: 'post',
    path: '/admin/faq',
    audience: 'admin',
    tag: '11. Admin — Support, FAQ & Legal',
    summary: 'Create a new bilingual FAQ entry (Arabic & English together)',
    auth: 'bearer',
    successStatus: 201,
    bodyExample: {
      category: 'NUTRITION',
      questionAr: 'كيف تعمل بدائل الوجبات والأطعمة؟',
      answerAr:
        'يمكنك اختيار أي بديل من نفس القسم مع الحفاظ على السعرات والماكروز.',
      questionEn: 'How do meal swaps work?',
      answerEn: 'Choose any same-section replacement meal or ingredient.',
      displayOrder: 5,
      active: true,
    },
  },
  {
    method: 'patch',
    path: '/admin/faq/:id',
    audience: 'admin',
    tag: '11. Admin — Support, FAQ & Legal',
    summary: 'Update an FAQ entry',
    auth: 'bearer',
    params: [uuidParam('id', 'FAQ entry ID')],
  },
  {
    method: 'delete',
    path: '/admin/faq/:id',
    audience: 'admin',
    tag: '11. Admin — Support, FAQ & Legal',
    summary: 'Delete an FAQ entry',
    auth: 'bearer',
    params: [uuidParam('id', 'FAQ entry ID')],
  },
  {
    method: 'get',
    path: '/admin/legal',
    audience: 'admin',
    tag: '11. Admin — Support, FAQ & Legal',
    summary: 'List all legal document versions (Terms & Privacy)',
    auth: 'bearer',
  },
  {
    method: 'post',
    path: '/admin/legal',
    audience: 'admin',
    tag: '11. Admin — Support, FAQ & Legal',
    summary: 'Publish a new version of Terms & Conditions or Privacy Policy',
    auth: 'bearer',
    successStatus: 201,
    bodyExample: {
      type: 'TERMS',
      version: '1.1.0',
      locale: 'en',
      title: 'Motion Terms & Conditions',
      content: 'Updated terms content...',
      active: true,
    },
  },

  // 12. Admin — Trainees & Accounts
  {
    method: 'get',
    path: '/admin/users',
    audience: 'admin',
    tag: '12. Admin — Trainees & Accounts',
    summary: 'List non-admin trainees with enrollment and activity summaries',
    auth: 'bearer',
    params: [
      {
        name: 'search',
        in: 'query',
        description: 'Filter trainees by email or display name',
        schema: { type: 'string' },
      },
      {
        name: 'status',
        in: 'query',
        description: 'Filter trainees by account status',
        schema: {
          type: 'string',
          enum: ['ACTIVE', 'SUSPENDED', 'DELETION_PENDING'],
        },
      },
    ],
  },
  {
    method: 'patch',
    path: '/admin/users/:id/status',
    audience: 'admin',
    tag: '12. Admin — Trainees & Accounts',
    summary: 'Suspend or reactivate a trainee account',
    auth: 'bearer',
    params: [uuidParam('id', 'Trainee user ID')],
    bodyExample: { status: 'SUSPENDED' },
  },
  {
    method: 'delete',
    path: '/admin/users/:id',
    audience: 'admin',
    tag: '12. Admin — Trainees & Accounts',
    summary: 'Permanently delete a non-admin trainee account',
    auth: 'bearer',
    params: [uuidParam('id', 'Trainee user ID')],
  },
];

function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

export function buildOpenApiDocument(audience: SwaggerAudience) {
  const filtered = ROUTES.filter((route) => {
    if (audience === 'all') return true;
    if (audience === 'customer') {
      return route.audience === 'customer' || route.audience === 'both';
    }
    return route.audience === 'admin' || route.audience === 'both';
  });

  const tagSet = new Set<string>();
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of filtered) {
    const tag =
      audience === 'admin' && route.adminTag ? route.adminTag : route.tag;
    tagSet.add(tag);

    const openApiPath = toOpenApiPath(route.path);
    paths[openApiPath] ||= {};

    const operation: Record<string, unknown> = {
      tags: [tag],
      summary: route.summary,
      ...(route.description ? { description: route.description } : {}),
      operationId: `${route.method}_${openApiPath.replace(/[^A-Za-z0-9]+/g, '_')}`,
      ...(route.auth === 'bearer'
        ? { security: [{ BearerAuth: [] }] }
        : { security: [] }),
      ...(route.params?.length
        ? {
            parameters: route.params.map((p) => ({
              name: p.name,
              in: p.in,
              required: p.in === 'path' ? true : Boolean(p.required),
              description: p.description,
              schema: p.schema,
              ...(p.example !== undefined ? { example: p.example } : {}),
            })),
          }
        : {}),
      responses: {
        [String(route.successStatus ?? 200)]: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        '400': {
          description: 'Validation error or malformed request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
            },
          },
        },
        ...(route.auth === 'bearer'
          ? {
              '401': {
                description: 'Unauthenticated or revoked session',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ApiError' },
                  },
                },
              },
              '403': {
                description: 'Forbidden or insufficient permissions',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ApiError' },
                  },
                },
              },
            }
          : {}),
        '429': {
          description: 'Rate limit exceeded (includes Retry-After header)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
            },
          },
        },
      },
    };

    if (
      route.method === 'post' ||
      route.method === 'put' ||
      route.method === 'patch'
    ) {
      operation.requestBody = {
        required: Boolean(route.bodyExample),
        description: route.bodyDescription || 'JSON request payload',
        content: {
          'application/json': {
            schema: { type: 'object' },
            ...(route.bodyExample ? { example: route.bodyExample } : {}),
          },
        },
      };
    }

    paths[openApiPath][route.method] = operation;
  }

  const titleByAudience: Record<SwaggerAudience, string> = {
    customer: 'Motion Fitness API — Customer (Mobile App)',
    admin: 'Motion Fitness API — Admin (Studio & Operations)',
    all: 'Motion Fitness API — Complete Reference',
  };

  const descriptionByAudience: Record<SwaggerAudience, string> = {
    customer:
      'Complete REST API documentation for Motion mobile developers. Endpoints are organized into sequential folders from Authentication & Onboarding through Daily Workouts, Nutrition Swaps, Activity, Check-ins, Notifications, and Support.',
    admin:
      'Administrator & Studio REST API for managing shared programs, exercises, foods, sections, meals, media library, AI matching rulesets, Gemini usage analytics, uptime monitoring, and bilingual FAQ/Legal documents.',
    all: 'Combined Customer + Admin OpenAPI specification for the Motion Fitness Platform.',
  };

  return {
    openapi: '3.0.3',
    info: {
      title: titleByAudience[audience],
      version: '0.4.0',
      description: descriptionByAudience[audience],
    },
    servers: [
      {
        url: '/api/v1',
        description: 'Current API Server',
      },
    ],
    tags: [...tagSet].sort().map((name) => ({ name })),
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Paste the accessToken returned by POST /auth/login (without the "Bearer " prefix).',
        },
      },
      schemas: {
        ApiError: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            message: {
              type: 'string',
              example: 'Please check the request fields.',
            },
            details: { nullable: true },
            requestId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    paths,
  };
}

const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'bruno');
fs.mkdirSync(path.join(root, 'environments'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'bruno.json'),
  JSON.stringify(
    {
      version: '1',
      name: 'Motion API v1 — F00–F04',
      type: 'collection',
      ignore: ['node_modules', '.git'],
    },
    null,
    2,
  ) + '\n',
);
const variables = {
  baseUrl: 'http://localhost:3100/api/v1',
  email: '',
  password: '',
  accessToken: '',
  refreshToken: '',
  otpCode: '',
  resetToken: '',
  reauthenticationToken: '',
  deletionToken: '',
  idToken: '',
  authorizationCode: '',
  signInChallengeId: '',
  linkChallengeId: '',
  reauthChallengeId: '',
  injuryId: '',
  mediaId: '',
  contentId: '',
  ingredientId: '',
  foodVersionId: '',
  foodVersionId2: '',
  foodSectionId: '',
  foodSectionVersionId: '',
  foodMemberId: '',
  mealSectionId: '',
  mealId: '',
  mealVersionId: '',
  programId: '',
  programHintId: '',
  exerciseRevisionId: '',
  idempotencyKey: '',
  uploadUrl: '',
};
for (const env of ['local', 'staging', 'production'])
  fs.writeFileSync(
    path.join(root, 'environments', env + '.bru'),
    'vars {\n' +
      Object.entries({
        ...variables,
        baseUrl:
          env === 'local'
            ? variables.baseUrl
            : env === 'staging'
              ? 'https://configure-staging-host.invalid/api/v1'
              : 'https://13.49.114.20/api/v1',
      })
        .map(([k, v]) => `  ${k}: ${v}`.trimEnd())
        .join('\n') +
      '\n}\n',
  );
function write(
  folder,
  name,
  method,
  url,
  body,
  {
    status = 200,
    auth = true,
    headers = {},
    pre = '',
    post = '',
    docs = '',
    seq = 1,
  } = {},
) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  const content = `meta {\n  name: ${name}\n  type: http\n  seq: ${seq}\n}\n\n${method.toLowerCase()} {\n  url: {{baseUrl}}${url}\n  body: ${body === undefined ? 'none' : 'json'}\n  auth: ${auth ? 'bearer' : 'none'}\n}\n${auth ? '\nauth:bearer {\n  token: {{accessToken}}\n}\n' : ''}${
    Object.keys(headers).length
      ? '\nheaders {\n' +
        Object.entries(headers)
          .map(([k, v]) => `  ${k}: ${v}`.trimEnd())
          .join('\n') +
        '\n}\n'
      : ''
  }${
    body === undefined
      ? ''
      : '\nbody:json {\n' +
        JSON.stringify(body, null, 2)
          .split('\n')
          .map((l) => '  ' + l)
          .join('\n') +
        '\n}\n'
  }${pre ? '\nscript:pre-request {\n' + pre + '\n}\n' : ''}${post ? '\nscript:post-response {\n' + post + '\n}\n' : ''}\ntests {\n  test("Expected HTTP status", function () { expect(res.getStatus()).to.equal(${status}); });\n  test("Server request ID", function () { expect(res.getHeader("x-request-id")).to.be.a("string"); });\n${status >= 400 ? '  test("Error contract", function () { const e = res.getBody(); expect(e).to.have.all.keys("code", "message", "details", "requestId"); });\n' : ''}}\n\ndocs {\n  Contract version: v1 / 0.4.0.\n  ${docs || 'See docs/API_CONTRACT.md for response shapes and error codes.'}\n  Never commit populated credentials or runtime tokens.\n}\n`;
  fs.writeFileSync(
    path.join(
      dir,
      String(seq).padStart(2, '0') +
        '-' +
        name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() +
        '.bru',
    ),
    content,
  );
}
const saveTokens =
  '  const b = res.getBody(); if (b.accessToken) { bru.setVar("accessToken", b.accessToken); bru.setVar("refreshToken", b.refreshToken); }';
const local = { email: '{{email}}', password: '{{password}}' };
let n = 0;
function referenceFolder(url) {
  const route = url.split('?')[0];
  if (route.startsWith('/health')) return 'Health';
  if (route.startsWith('/auth/')) return 'Auth';
  if (route === '/me/account-deletion') return 'Account';
  if (route === '/me' || route === '/me/onboarding') return 'Profile';
  if (route === '/me/settings') return 'Settings';
  if (route === '/me/food-preferences') return 'Food Preferences';
  if (route.startsWith('/me/injuries')) return 'Injuries';
  if (route.startsWith('/references/')) return 'References';
  if (route.startsWith('/me/matching/')) return 'Matching';
  if (route.startsWith('/media/')) return 'Media';
  throw new Error(`Choose a Bruno reference folder for ${route}`);
}
const add = (name, method, url, body, opts = {}) =>
  write(`reference/${referenceFolder(url)}`, name, method, url, body, {
    ...opts,
    seq: ++n,
  });
add('Liveness', 'GET', '/health', undefined, { auth: false });
add('Readiness', 'GET', '/health/ready', undefined, { auth: false });
add('Register', 'POST', '/auth/register', local, {
  auth: false,
  status: 201,
  post: saveTokens,
  docs: 'Requires real email transport or local capture; returns 503 EMAIL_NOT_CONFIGURED otherwise. Success: accessToken, refreshToken, tokenType, expiresIn, user, emailDelivery QUEUED.',
});
add('Login', 'POST', '/auth/login', local, { auth: false, post: saveTokens });
add(
  'Refresh',
  'POST',
  '/auth/refresh',
  { refreshToken: '{{refreshToken}}' },
  {
    auth: false,
    post: saveTokens,
    docs: 'Rotation is single-use. Serialize refresh calls on mobile. Replay revokes the session family.',
  },
);
add(
  'Verify email',
  'POST',
  '/auth/verify-email',
  { email: '{{email}}', code: '{{otpCode}}' },
  { auth: false },
);
add(
  'Resend verification',
  'POST',
  '/auth/resend-verification',
  { email: '{{email}}' },
  { auth: false, status: 202 },
);
add(
  'Forgot password',
  'POST',
  '/auth/forgot-password',
  { email: '{{email}}' },
  { auth: false, status: 202 },
);
add(
  'Reset password',
  'POST',
  '/auth/reset-password',
  {
    token: '{{resetToken}}',
    newPassword: '{{password}}',
    confirmPassword: '{{password}}',
  },
  { auth: false },
);
add('Change password', 'POST', '/auth/change-password', {
  currentPassword: '{{password}}',
  newPassword: '{{password}}',
  confirmPassword: '{{password}}',
});
add(
  'Google challenge',
  'POST',
  '/auth/challenges',
  { provider: 'GOOGLE', purpose: 'SIGN_IN' },
  {
    auth: false,
    status: 201,
    post: '  const b=res.getBody(); if(b.challengeId) bru.setVar("signInChallengeId",b.challengeId);',
    docs: 'First sign-in step: pass nonce to native Google Sign-In, then send its ID token and signInChallengeId to POST /auth/google. Expires in five minutes and is one-use. Bruno cannot mint a real Google token.',
  },
);
add(
  'Google sign in',
  'POST',
  '/auth/google',
  { idToken: '{{idToken}}', challengeId: '{{signInChallengeId}}' },
  { auth: false, post: saveTokens },
);
add(
  'Apple challenge',
  'POST',
  '/auth/challenges',
  { provider: 'APPLE', purpose: 'SIGN_IN' },
  {
    auth: false,
    status: 201,
    post: '  const b=res.getBody(); if(b.challengeId) bru.setVar("signInChallengeId",b.challengeId);',
  },
);
add(
  'Apple sign in',
  'POST',
  '/auth/apple',
  {
    idToken: '{{idToken}}',
    authorizationCode: '{{authorizationCode}}',
    challengeId: '{{signInChallengeId}}',
  },
  { auth: false, post: saveTokens },
);
add(
  'Password reauthentication',
  'POST',
  '/auth/reauthenticate',
  { method: 'PASSWORD', password: '{{password}}', purpose: 'LINK' },
  {
    post: '  const b=res.getBody(); if(b.reauthenticationToken) bru.setVar("reauthenticationToken",b.reauthenticationToken);',
    docs: 'Re-proves the signed-in password account. Use purpose=LINK before adding Google or purpose=DELETE before deletion. It returns a short-lived purpose-bound reauthenticationToken.',
  },
);
add(
  'Social reauthentication challenge',
  'POST',
  '/auth/challenges',
  { provider: 'GOOGLE', purpose: 'REAUTHENTICATE' },
  {
    status: 201,
    post: '  const b=res.getBody(); if(b.challengeId) bru.setVar("reauthChallengeId",b.challengeId);',
    docs: 'Requires Bearer auth. Use this nonce with an identity already linked to the current Motion account, then call /auth/reauthenticate. This produces a reauthentication proof, not a login session or a link challenge.',
  },
);
add(
  'Social reauthentication',
  'POST',
  '/auth/reauthenticate',
  {
    method: 'GOOGLE',
    idToken: '{{idToken}}',
    challengeId: '{{reauthChallengeId}}',
    purpose: 'LINK',
  },
  {
    post: '  const b=res.getBody(); if(b.reauthenticationToken) bru.setVar("reauthenticationToken",b.reauthenticationToken);',
    docs: 'Proves the existing Google identity again and stores a short-lived LINK proof for the final link request. For a password account, use Password reauthentication instead.',
  },
);
add(
  'Link challenge',
  'POST',
  '/auth/challenges',
  { provider: 'GOOGLE', purpose: 'LINK' },
  {
    status: 201,
    post: '  const b=res.getBody(); if(b.challengeId) bru.setVar("linkChallengeId",b.challengeId);',
    docs: 'Requires Bearer auth. Pass this nonce to Google Sign-In to get the identity being added, then combine its ID token and linkChallengeId with a reauthenticationToken at /auth/identities/google/link.',
  },
);
add(
  'Link Google identity',
  'POST',
  '/auth/identities/google/link',
  {
    idToken: '{{idToken}}',
    challengeId: '{{linkChallengeId}}',
    reauthenticationToken: '{{reauthenticationToken}}',
  },
  {
    docs: 'Final step: provide Bearer auth for the current Motion account, the ID token made with the LINK challenge nonce, that linkChallengeId, and fresh reauthenticationToken with purpose LINK. This links the provider; it does not merge accounts.',
  },
);
add('Link Apple identity', 'POST', '/auth/identities/apple/link', {
  idToken: '{{idToken}}',
  authorizationCode: '{{authorizationCode}}',
  challengeId: '{{linkChallengeId}}',
  reauthenticationToken: '{{reauthenticationToken}}',
});
add('Get me', 'GET', '/me', undefined, {});
add('Patch profile', 'PATCH', '/me', {
  name: 'Motion Athlete',
  height_cm: 175,
  primary_goal: 'STRENGTH_HYPERTROPHY',
  fitness_level: 'BEGINNER',
  training_days_per_week: ['SUNDAY', 'TUESDAY', 'THURSDAY'],
  timezone: 'Africa/Cairo',
  locale: 'ar',
  date_of_birth: '1998-03-14',
});
add(
  'Onboarding',
  'PUT',
  '/me/onboarding',
  {
    name: 'Motion Athlete',
    gender: 'FEMALE',
    height_cm: 175,
    primary_goal: 'FAT_LOSS',
    fitness_level: 'BEGINNER',
    training_days_per_week: ['SUNDAY', 'TUESDAY', 'THURSDAY'],
    timezone: 'Africa/Cairo',
    locale: 'ar',
    date_of_birth: '1998-03-14',
    weight_kg: 80,
    target_weight_kg: 72,
    food_preferences: {
      allergen_codes: ['MILK'],
      disliked_food_ids: [],
    },
  },
  {
    headers: { 'Idempotency-Key': '{{idempotencyKey}}' },
    docs: 'Requires gender, age strictly greater than 18, 2-5 unique fixed weekdays and food_preferences with allergen_codes and disliked_food_ids. Current and target weights have no measurement date or history. Matching remains PENDING until F05.',
  },
);
add('Get settings', 'GET', '/me/settings');
add('Patch settings', 'PATCH', '/me/settings', {
  reminders: true,
  theme: 'SYSTEM',
  quiet_hours: { start: '22:00', end: '07:00' },
});
add('Get food preferences', 'GET', '/me/food-preferences');
add('Replace food preferences', 'PUT', '/me/food-preferences', {
  allergen_codes: ['MILK'],
  disliked_food_ids: [],
});
add('List injuries', 'GET', '/me/injuries?limit=30&offset=0');
add(
  'Injury rewrite preview',
  'POST',
  '/me/injuries/rewrite',
  {
    body_area_code: 'KNEE',
    side: 'LEFT',
    description: 'My left knee sometimes hurts',
    draftVersion: 1,
  },
  {
    status: 201,
    docs: 'Requires configured private AI service and approved provider retention. Returns description, draftVersion, previewOnly. Discard if form version changed. Saves nothing.',
  },
);
add(
  'Confirm injury',
  'POST',
  '/me/injuries',
  {
    body_area_code: 'KNEE',
    side: 'LEFT',
    description: 'Final user-confirmed description',
    confirmed: true,
  },
  {
    status: 201,
    headers: { 'Idempotency-Key': '{{idempotencyKey}}' },
    post: '  const b=res.getBody(); if(b.injury) bru.setVar("injuryId",b.injury.id);',
  },
);
add('Edit injury', 'PATCH', '/me/injuries/{{injuryId}}', {
  body_area_code: 'KNEE',
  side: 'LEFT',
  description: 'Edited final user-confirmed description',
  confirmed: true,
});
add('Remove injury', 'DELETE', '/me/injuries/{{injuryId}}', {
  confirmed: true,
});
for (const route of ['body-areas', 'allergens', 'foods', 'onboarding'])
  add('Reference ' + route, 'GET', '/references/' + route);
add('Matching status', 'GET', '/me/matching/status');
add(
  'Avatar upload intent',
  'POST',
  '/media/upload-intents',
  { mime: 'image/png', size: 1024 },
  {
    status: 201,
    docs: 'Requires configured S3 storage. Upload bytes to uploadUrl with returned headers, then finalize. 503 STORAGE_NOT_CONFIGURED otherwise.',
  },
);
add(
  'Finalize avatar',
  'POST',
  '/media/{{mediaId}}/finalize',
  {},
  { status: 201 },
);
add('Media metadata', 'GET', '/media/{{mediaId}}');
add('Logout', 'POST', '/auth/logout', {});
add('Logout all', 'POST', '/auth/logout-all', {});
add(
  'Request deletion',
  'POST',
  '/me/account-deletion',
  { reauthenticationToken: '{{reauthenticationToken}}' },
  {
    status: 202,
    docs: 'Requires DELETE proof. Revokes all sessions. Does not cancel store subscriptions.',
    post: '  const b=res.getBody(); if(b.trackingToken) bru.setVar("deletionToken",b.trackingToken);',
  },
);
add('Deletion status', 'GET', '/me/account-deletion', undefined, {
  auth: false,
  headers: { 'X-Deletion-Token': '{{deletionToken}}' },
});
let s = 0;
const smoke = (name, method, url, body, opts = {}) =>
  write('smoke', name, method, url, body, { ...opts, seq: ++s });
smoke('Ready', 'GET', '/health/ready', undefined, { auth: false });
smoke('Register ephemeral athlete', 'POST', '/auth/register', local, {
  auth: false,
  status: 201,
  post: saveTokens,
});
smoke('Login', 'POST', '/auth/login', local, { auth: false, post: saveTokens });
smoke('Aggregate profile', 'GET', '/me');
smoke('Patch profile', 'PATCH', '/me', {
  name: 'Bruno Athlete',
  height_cm: 175,
  primary_goal: 'FAT_LOSS',
  fitness_level: 'BEGINNER',
  training_days_per_week: ['SUNDAY', 'TUESDAY', 'THURSDAY'],
  timezone: 'Africa/Cairo',
  locale: 'en',
});
smoke('Update current weight', 'PATCH', '/me', {
  weight_kg: 80,
});
smoke('Read current weight', 'GET', '/me', undefined, {
  post: '  test("Current weight without measurement history",()=>{const b=res.getBody();expect(Number(b.profile.weight_kg)).to.equal(80);expect(b).not.to.have.property("latest_weight");expect(b.profile).not.to.have.property("measured_at");});',
});
smoke('Body areas', 'GET', '/references/body-areas');
smoke('Allergens', 'GET', '/references/allergens');
smoke(
  'Add confirmed injury',
  'POST',
  '/me/injuries',
  {
    body_area_code: 'KNEE',
    side: 'LEFT',
    description: 'Final confirmed fixture text',
    confirmed: true,
  },
  {
    status: 201,
    headers: { 'Idempotency-Key': 'bruno-injury-001' },
    post: '  bru.setVar("injuryId",res.getBody().injury.id);',
  },
);
smoke(
  'Update injury without a version field',
  'PATCH',
  '/me/injuries/{{injuryId}}',
  {
    body_area_code: 'KNEE',
    side: 'LEFT',
    description: 'Last successful change',
    confirmed: true,
  },
  { status: 200 },
);
smoke('Edit confirmed injury', 'PATCH', '/me/injuries/{{injuryId}}', {
  body_area_code: 'KNEE',
  side: 'LEFT',
  description: 'Edited final confirmed fixture text',
  confirmed: true,
});
smoke('Remove injury', 'DELETE', '/me/injuries/{{injuryId}}', {
  confirmed: true,
});
smoke('Update preferences', 'PUT', '/me/food-preferences', {
  allergen_codes: ['MILK'],
  disliked_food_ids: [],
});
smoke('Settings', 'PATCH', '/me/settings', {
  theme: 'DARK',
});
smoke('Matching honest status', 'GET', '/me/matching/status', undefined, {
  post: '  test("F05 is not implemented",()=>expect(res.getBody().reason).to.equal("F05_NOT_IMPLEMENTED"));',
});
smoke(
  'Rotate refresh',
  'POST',
  '/auth/refresh',
  { refreshToken: '{{refreshToken}}' },
  {
    auth: false,
    pre: '  bru.setVar("previousRefreshToken",bru.getVar("refreshToken"));',
    post: saveTokens,
  },
);
smoke(
  'Reject refresh replay',
  'POST',
  '/auth/refresh',
  { refreshToken: '{{previousRefreshToken}}' },
  { auth: false, status: 401 },
);
smoke('Session immediately revoked', 'GET', '/me', undefined, { status: 401 });
process.stdout.write(
  `Generated ${n} reference requests and ${s} PostgreSQL smoke requests\n`,
);

// F03 administration: these requests require a current ADMIN role.
const contentFixture = {
  title: 'Draft exercise',
  description: 'Replace with sourced editorial content',
  instructions: ['Replace with reviewed movement instructions'],
  muscleGroups: ['Replace'],
  equipment: [],
  source: {
    title: 'Required source',
    reference: 'Required source record or URL',
    licenseNotes: 'Required reuse notes',
  },
  mediaId: null,
};
for (const kind of ['exercises', 'foods', 'ingredients']) {
  const folder = 'reference/Admin ' + kind;
  write(folder, '01-list', 'GET', '/admin/' + kind);
  write(folder, '02-get', 'GET', '/admin/' + kind + '/{{contentId}}');
  if (kind === 'exercises') {
    write(
      folder,
      '03-create-draft',
      'POST',
      '/admin/exercises',
      { slug: 'replace-with-unique-slug', content: contentFixture },
      { status: 201 },
    );
    write(folder, '04-edit', 'PATCH', '/admin/exercises/{{contentId}}', {
      content: contentFixture,
    });
  }
  if (kind !== 'ingredients')
    write(
      folder,
      '05-publish',
      'POST',
      '/admin/' + kind + '/{{contentId}}/publish',
      {},
      { status: 201 },
    );
  write(
    folder,
    '06-archive',
    'DELETE',
    '/admin/' + kind + '/{{contentId}}',
    {},
  );
}
write(
  'reference/Admin Media',
  '01-upload-intent',
  'POST',
  '/admin/media/upload-intents',
  { mime: 'video/mp4', size: 1024 },
  { status: 201 },
);
write(
  'reference/Admin Media',
  '02-finalize',
  'POST',
  '/admin/media/{{mediaId}}/finalize',
  {},
  { status: 201 },
);
write('reference/Admin Media', '03-get', 'GET', '/admin/media/{{mediaId}}');

const ingredientFixture = {
  title: 'Draft ingredient',
  dietaryTags: [],
  allergenCodes: [],
  verificationStatus: 'UNKNOWN',
};
const foodFixture = {
  title: 'Draft food',
  preparation: 'Required preparation description',
  preparationState: 'RAW',
  prepMinutes: 0,
  energyKcal100g: null,
  proteinG100g: null,
  carbohydrateG100g: null,
  fatG100g: null,
  fiberG100g: null,
  nutrientSource: {
    title: 'Required source',
    reference: 'Required record',
    licenseNotes: 'Required reuse notes',
  },
  mediaId: null,
  ingredients: [{ ingredientId: '{{ingredientId}}', quantityG: 100 }],
};
for (const [kind, content] of [
  ['ingredients', ingredientFixture],
  ['foods', foodFixture],
]) {
  write(
    'reference/Admin ' + kind,
    '03-create-draft',
    'POST',
    '/admin/' + kind,
    { slug: 'replace-with-unique-slug', content },
    { status: 201 },
  );
  write(
    'reference/Admin ' + kind,
    '04-edit',
    'PATCH',
    '/admin/' + kind + '/{{contentId}}',
    { content },
  );
}
write(
  'reference/Admin Media',
  '04-archive',
  'DELETE',
  '/admin/media/{{mediaId}}',
  {},
);

write(
  'reference/Auth',
  'verify-reset-code',
  'POST',
  '/auth/verify-reset-code',
  { email: '{{email}}', code: '{{otpCode}}' },
  { status: 200 },
);
write('reference/Admin Media', '05-list', 'GET', '/admin/media');

// F08 reusable food and meal library administration.
const foodSectionFixture = {
  slug: 'replace-with-unique-food-section',
  title: 'Protein options — draft; review portions before publication',
  members: [
    {
      foodVersionId: '{{foodVersionId}}',
      portionGPerUnit: 100,
      displayPortion: '100 g cooked',
    },
    {
      foodVersionId: '{{foodVersionId2}}',
      portionGPerUnit: 100,
      displayPortion: '100 g cooked',
    },
  ],
};
write(
  'reference/Admin Food Library',
  '01-food-sections-list',
  'GET',
  '/admin/food-sections',
);
write(
  'reference/Admin Food Library',
  '02-food-section-create-draft',
  'POST',
  '/admin/food-sections',
  foodSectionFixture,
  {
    status: 201,
    post: '  const b=res.getBody(); if(b.id) bru.setVar("foodSectionId",b.id); if(b.version_id) bru.setVar("foodSectionVersionId",b.version_id);',
  },
);
write(
  'reference/Admin Food Library',
  '03-food-section-get',
  'GET',
  '/admin/food-sections/{{foodSectionId}}',
  undefined,
  {
    post: '  const b=res.getBody(); const v=(b.versions||[]).find(x=>x.status==="PUBLISHED")||(b.versions||[])[0]; if(v&&v.members&&v.members[0]) bru.setVar("foodMemberId",v.members[0].id);',
  },
);
write(
  'reference/Admin Food Library',
  '04-food-section-edit',
  'PATCH',
  '/admin/food-sections/{{foodSectionId}}',
  {
    title: foodSectionFixture.title,
    members: foodSectionFixture.members,
  },
);
write(
  'reference/Admin Food Library',
  '05-food-section-publish',
  'POST',
  '/admin/food-sections/{{foodSectionId}}/publish',
  {},
  { status: 201 },
);
write(
  'reference/Admin Food Library',
  '07-meal-sections-list',
  'GET',
  '/admin/meal-sections',
);
write(
  'reference/Admin Food Library',
  '08-meal-section-create',
  'POST',
  '/admin/meal-sections',
  { slug: 'replace-with-unique-meal-section', title: 'Breakfast ideas' },
  {
    status: 201,
    post: '  const b=res.getBody(); if(b.id) bru.setVar("mealSectionId",b.id);',
  },
);
write(
  'reference/Admin Food Library',
  '09-meal-section-get',
  'GET',
  '/admin/meal-sections/{{mealSectionId}}',
);
write(
  'reference/Admin Food Library',
  '10-meal-section-edit',
  'PATCH',
  '/admin/meal-sections/{{mealSectionId}}',
  { slug: 'replace-with-unique-meal-section', title: 'Edited meal section' },
);
write('reference/Admin Food Library', '11-meals-list', 'GET', '/admin/meals');
write(
  'reference/Admin Food Library',
  '12-meal-create-draft',
  'POST',
  '/admin/meals',
  {
    slug: 'replace-with-unique-meal-slug',
    sectionId: '{{mealSectionId}}',
    title: 'Draft meal idea',
    items: [{ memberId: '{{foodMemberId}}', exchangeUnits: 1, position: 0 }],
  },
  {
    status: 201,
    post: '  const b=res.getBody(); if(b.id) bru.setVar("mealId",b.id); if(b.version_id) bru.setVar("mealVersionId",b.version_id);',
  },
);
write(
  'reference/Admin Food Library',
  '13-meal-get',
  'GET',
  '/admin/meals/{{mealId}}',
);
write(
  'reference/Admin Food Library',
  '14-meal-edit',
  'PATCH',
  '/admin/meals/{{mealId}}',
  {
    sectionId: '{{mealSectionId}}',
    title: 'Edited draft meal',
    items: [{ memberId: '{{foodMemberId}}', exchangeUnits: 1, position: 0 }],
  },
);
write(
  'reference/Admin Food Library',
  '15-meal-publish',
  'POST',
  '/admin/meals/{{mealId}}/publish',
  {},
  { status: 201 },
);
write(
  'reference/Admin Food Library',
  '16-meal-archive',
  'DELETE',
  '/admin/meals/{{mealId}}',
  {},
);

// F04 combined admin program and nutrition schedule builder.
const programDayMeals = [
  {
    mealType: 'LUNCH',
    localTime: '12:00',
    mealVersionId: '{{mealVersionId}}',
  },
];
const programWeeks = Array.from({ length: 4 }, () => ({
  days: Array.from({ length: 7 }, (_, index) =>
    index === 0 || index === 3
      ? {
          kind: 'TRAINING',
          workout: {
            title: 'Draft workout',
            description: 'Replace with reviewed workout notes.',
            exercises: [
              {
                exerciseRevisionId: '{{exerciseRevisionId}}',
                prescription: {
                  mode: 'REPS',
                  setCount: 3,
                  repsMin: 8,
                  repsMax: 12,
                  restSeconds: 60,
                },
              },
            ],
          },
          meals: programDayMeals,
        }
      : { kind: 'REST', meals: programDayMeals },
  ),
}));
const programAggregate = {
  slug: 'replace-with-unique-program-slug',
  title: 'Draft program title',
  primaryGoal: 'STRENGTH_HYPERTROPHY',
  supportedGoals: ['STRENGTH_HYPERTROPHY'],
  idealLevel: 'BEGINNER',
  supportedLevels: ['BEGINNER'],
  trainingDaysPerWeek: 2,
  editorialPriority: 0,
  description: 'Replace with accurate program description.',
  requiredEquipment: [],
  intendedAudience: null,
  months: [{ title: 'Month 1', weeks: programWeeks }],
};
write('reference/Admin Programs', '01-programs-list', 'GET', '/admin/programs');
write(
  'reference/Admin Programs',
  '02-program-create-draft',
  'POST',
  '/admin/programs',
  programAggregate,
  {
    status: 201,
    headers: { 'Idempotency-Key': '{{idempotencyKey}}' },
    post: '  const b=res.getBody(); if(b.id) bru.setVar("programId",b.id);',
    docs: 'The example contains one 28-day month, four seven-day weeks, two training days in each week, and one meal slot for each day. Replace the exercise and meal version variables with published library content before publishing.',
  },
);
write(
  'reference/Admin Programs',
  '03-program-get',
  'GET',
  '/admin/programs/{{programId}}',
);
const programEdit = { ...programAggregate };
delete programEdit.slug;
write(
  'reference/Admin Programs',
  '04-program-edit-draft',
  'PATCH',
  '/admin/programs/{{programId}}',
  programEdit,
  {
    headers: { 'Idempotency-Key': '{{idempotencyKey}}' },
    docs: 'Edit requests do not need a client revision; the latest successful write is retained. Updates are atomic; a published program creates a new draft version. Keep the idempotency key stable only when retrying the same request.',
  },
);
write(
  'reference/Admin Programs',
  '05-program-publish',
  'POST',
  '/admin/programs/{{programId}}/publish',
  {},
  {
    status: 201,
    headers: { 'Idempotency-Key': '{{idempotencyKey}}' },
    docs: 'This sample expects an untouched draft. Publication validates and publishes the workout program and its paired nutrition schedule in one transaction.',
  },
);
write(
  'reference/Admin Programs',
  '06-program-hint-draft',
  'POST',
  '/admin/programs/{{programId}}/hints',
  {
    originalText: 'Replace with reviewed program guidance.',
    structuredHints: { suitabilityNotes: ['Replace with reviewed notes.'] },
  },
  {
    status: 201,
    headers: { 'Idempotency-Key': '{{idempotencyKey}}' },
    post: '  const b=res.getBody(); if(b.id) bru.setVar("programHintId",b.id);',
  },
);
write(
  'reference/Admin Programs',
  '07-program-hint-approve',
  'POST',
  '/admin/programs/{{programId}}/hints/{{programHintId}}/approve',
  {},
  { status: 201, headers: { 'Idempotency-Key': '{{idempotencyKey}}' } },
);
write(
  'reference/Admin Programs',
  '08-program-archive',
  'DELETE',
  '/admin/programs/{{programId}}',
  {},
  { headers: { 'Idempotency-Key': '{{idempotencyKey}}' } },
);
write(
  'reference/Admin Food Library',
  '17-meal-section-archive',
  'DELETE',
  '/admin/meal-sections/{{mealSectionId}}',
  undefined,
);
write(
  'reference/Admin Food Library',
  '18-food-section-archive',
  'DELETE',
  '/admin/food-sections/{{foodSectionId}}',
  {},
);

const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'bruno');
fs.mkdirSync(path.join(root, 'environments'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'bruno.json'),
  JSON.stringify(
    {
      version: '1',
      name: 'Motion API v1 — F00–F02',
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
  challengeId: '',
  injuryId: '',
  mediaId: '',
  contentId: '',
  ingredientId: '',
  profileRevision: '0',
  preferenceRevision: '0',
  injuryVersion: '1',
  settingsVersion: '0',
  idempotencyKey: '',
  uploadUrl: '',
};
for (const env of ['local', 'staging'])
  fs.writeFileSync(
    path.join(root, 'environments', env + '.bru'),
    'vars {\n' +
      Object.entries({
        ...variables,
        baseUrl:
          env === 'local'
            ? variables.baseUrl
            : 'https://configure-staging-host.invalid/api/v1',
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
    post: '  const b=res.getBody(); if(b.challengeId) bru.setVar("challengeId",b.challengeId);',
    docs: 'Configure provider client IDs. Pass nonce to native provider request; send resulting ID token.',
  },
);
add(
  'Google sign in',
  'POST',
  '/auth/google',
  { idToken: '{{idToken}}', challengeId: '{{challengeId}}' },
  { auth: false, post: saveTokens },
);
add(
  'Apple challenge',
  'POST',
  '/auth/challenges',
  { provider: 'APPLE', purpose: 'SIGN_IN' },
  { auth: false, status: 201 },
);
add(
  'Apple sign in',
  'POST',
  '/auth/apple',
  {
    idToken: '{{idToken}}',
    authorizationCode: '{{authorizationCode}}',
    challengeId: '{{challengeId}}',
  },
  { auth: false, post: saveTokens },
);
add(
  'Password reauthentication',
  'POST',
  '/auth/reauthenticate',
  { method: 'PASSWORD', password: '{{password}}', purpose: 'DELETE' },
  {
    post: '  const b=res.getBody(); if(b.reauthenticationToken) bru.setVar("reauthenticationToken",b.reauthenticationToken);',
  },
);
add(
  'Social reauthentication challenge',
  'POST',
  '/auth/challenges',
  { provider: 'GOOGLE', purpose: 'REAUTHENTICATE' },
  { status: 201 },
);
add('Social reauthentication', 'POST', '/auth/reauthenticate', {
  method: 'GOOGLE',
  idToken: '{{idToken}}',
  challengeId: '{{challengeId}}',
  purpose: 'LINK',
});
add(
  'Link challenge',
  'POST',
  '/auth/challenges',
  { provider: 'GOOGLE', purpose: 'LINK' },
  { status: 201 },
);
add('Link Google identity', 'POST', '/auth/identities/google/link', {
  idToken: '{{idToken}}',
  challengeId: '{{challengeId}}',
  reauthenticationToken: '{{reauthenticationToken}}',
});
add('Link Apple identity', 'POST', '/auth/identities/apple/link', {
  idToken: '{{idToken}}',
  authorizationCode: '{{authorizationCode}}',
  challengeId: '{{challengeId}}',
  reauthenticationToken: '{{reauthenticationToken}}',
});
add('Get me', 'GET', '/me', undefined, {
  post: '  const b=res.getBody(); if(b.profile) bru.setVar("profileRevision",String(b.profile.profile_revision));',
});
add('Patch profile', 'PATCH', '/me', {
  expectedRevision: 0,
  name: 'Motion Athlete',
  height_cm: 175,
  primary_goal: 'STRENGTH_HYPERTROPHY',
  fitness_level: 'BEGINNER',
  training_days_per_week: 3,
  timezone: 'Africa/Cairo',
  locale: 'ar',
  date_of_birth: '1998-03-14',
});
add(
  'Onboarding',
  'PUT',
  '/me/onboarding',
  {
    expectedRevision: 0,
    name: 'Motion Athlete',
    height_cm: 175,
    primary_goal: 'FAT_LOSS',
    fitness_level: 'BEGINNER',
    training_days_per_week: 3,
    timezone: 'Africa/Cairo',
    locale: 'ar',
    date_of_birth: '1998-03-14',
    weight_kg: 80,
  },
  {
    headers: { 'Idempotency-Key': '{{idempotencyKey}}' },
    docs: 'Requires age strictly greater than 18. Current weight only; no measurement date or history. Use current profile revision. Matching remains PENDING until F05.',
  },
);
add('Get settings', 'GET', '/me/settings');
add('Patch settings', 'PATCH', '/me/settings', {
  expectedVersion: 0,
  reminders: true,
  theme: 'SYSTEM',
  quiet_hours: { start: '22:00', end: '07:00' },
});
add('Get food preferences', 'GET', '/me/food-preferences');
add('Replace food preferences', 'PUT', '/me/food-preferences', {
  expectedRevision: 0,
  allergen_codes: ['MILK'],
  disliked_food_ids: [],
  excluded_food_ids: [],
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
  expectedVersion: 1,
});
add('Remove injury', 'DELETE', '/me/injuries/{{injuryId}}', {
  confirmed: true,
  expectedVersion: 2,
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
  pre: '  bru.setVar("email", "bruno-"+Date.now()+"-"+Math.floor(Math.random()*100000)+"@example.test");\n  bru.setVar("password", "Disposable-Bruno-Password-123");',
  post: saveTokens,
});
smoke('Login', 'POST', '/auth/login', local, { auth: false, post: saveTokens });
smoke('Aggregate profile', 'GET', '/me');
smoke('Patch profile', 'PATCH', '/me', {
  expectedRevision: 0,
  name: 'Bruno Athlete',
  height_cm: 175,
  primary_goal: 'FAT_LOSS',
  fitness_level: 'BEGINNER',
  training_days_per_week: 3,
  timezone: 'Africa/Cairo',
  locale: 'en',
});
smoke('Update current weight', 'PATCH', '/me', {
  expectedRevision: 1,
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
  'Reject stale injury edit',
  'PATCH',
  '/me/injuries/{{injuryId}}',
  {
    body_area_code: 'KNEE',
    side: 'LEFT',
    description: 'Stale change',
    confirmed: true,
    expectedVersion: 9,
  },
  { status: 409 },
);
smoke('Edit confirmed injury', 'PATCH', '/me/injuries/{{injuryId}}', {
  body_area_code: 'KNEE',
  side: 'LEFT',
  description: 'Edited final confirmed fixture text',
  confirmed: true,
  expectedVersion: 1,
});
smoke('Remove injury', 'DELETE', '/me/injuries/{{injuryId}}', {
  confirmed: true,
  expectedVersion: 2,
});
smoke('Update preferences', 'PUT', '/me/food-preferences', {
  expectedRevision: 0,
  allergen_codes: ['MILK'],
  disliked_food_ids: [],
  excluded_food_ids: [],
});
smoke('Settings', 'PATCH', '/me/settings', {
  expectedVersion: 0,
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

// F03 administration: these requests require a current ADMIN or CONTENT_EDITOR role.
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
      expectedRevision: 1,
      content: contentFixture,
    });
  }
  if (kind !== 'ingredients')
    write(
      folder,
      '05-publish',
      'POST',
      '/admin/' + kind + '/{{contentId}}/publish',
      { expectedRevision: 1 },
      { status: 201 },
    );
  write(folder, '06-archive', 'DELETE', '/admin/' + kind + '/{{contentId}}', {
    expectedRevision: 1,
  });
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
    { expectedRevision: 1, content },
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

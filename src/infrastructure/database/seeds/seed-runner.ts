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

    for (const [id, slug, category, locale, question, answer, order] of [
      [
        '81000000-0000-4000-8000-000000000001',
        'how-program-matching-works-en',
        'PROGRAMS',
        'en',
        'How is my training and nutrition program selected?',
        'Motion evaluates your primary goal, fitness level, weekly training schedule, and body metrics against published programs using an AI-assisted matching ruleset to assign the best-fitting 12-week program.',
        1,
      ],
      [
        '81000000-0000-4000-8000-000000000002',
        'how-exercise-fitting-works-en',
        'WORKOUTS',
        'en',
        'How does Motion handle my reported injuries during workouts?',
        'Before each due training day, Motion runs daily exercise fitting against your active injuries and automatically blocks exercises that conflict with injured body areas.',
        2,
      ],
      [
        '81000000-0000-4000-8000-000000000003',
        'how-nutrition-swaps-work-en',
        'NUTRITION',
        'en',
        'How do meal and ingredient swaps keep my macros balanced?',
        'Motion uses section-based portion scaling so any alternative ingredient or replacement meal from the same section is automatically scaled to preserve your target calories and macros.',
        3,
      ],
      [
        '81000000-0000-4000-8000-000000000004',
        'how-periodic-check-ins-work-en',
        'PROGRESS',
        'en',
        'How often should I complete a progress check-in?',
        'Check-ins are scheduled every 3 days to record your current weight, workout difficulty, and nutrition adherence, generating an automated summary of your recent consistency.',
        4,
      ],
      [
        '81000000-0000-4000-8000-000000000005',
        'how-program-matching-works-ar',
        'PROGRAMS',
        'ar',
        'كيف يتم اختيار برنامجي التدريبي والغذائي؟',
        'يقوم تطبيق Motion بتحليل هدفك الأساسي ومستوى لياقتك وأيام تمرينك الأسبوعية وقياسات جسمك ومطابقتها تلقائياً مع أفضل برنامج تدريبي وغذائي متاح لمدة 12 أسبوعاً.',
        1,
      ],
      [
        '81000000-0000-4000-8000-000000000006',
        'how-exercise-fitting-works-ar',
        'WORKOUTS',
        'ar',
        'كيف يتعامل التطبيق مع الإصابات المسجلة أثناء التمرين؟',
        'قبل كل يوم تدريبي مستحق، يقوم النظام بفحص التمارين مقابل إصاباتك النشطة واستبعاد أي تمرين قد يسبب إجهاداً لمنطقة الإصابة.',
        2,
      ],
    ] as const)
      await query(
        m,
        `INSERT INTO faq_entries(id,slug,category,locale,question,answer,display_order,active)
         VALUES($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT(slug) DO NOTHING`,
        [id, slug, category, locale, question, answer, order],
      );

    for (const [id, type, version, locale, title, content] of [
      [
        '82000000-0000-4000-8000-000000000001',
        'TERMS',
        '1.0.0',
        'en',
        'Motion Terms & Conditions',
        'By using Motion, you agree to use the training and nutrition guidance responsibly, report accurate health and injury details, and consult a qualified healthcare professional before beginning any strenuous exercise program.',
      ],
      [
        '82000000-0000-4000-8000-000000000002',
        'PRIVACY',
        '1.0.0',
        'en',
        'Motion Privacy Policy',
        'Motion collects only the profile, injury, workout, nutrition, and activity data required to personalize and track your fitness program. You may request account deletion at any time.',
      ],
      [
        '82000000-0000-4000-8000-000000000003',
        'TERMS',
        '1.0.0',
        'ar',
        'الشروط والأحكام لتطبيق Motion',
        'باستخدامك لتطبيق Motion، فإنك توافق على استخدام الإرشادات التدريبية والغذائية بمسؤولية، وإدخال بياناتك الصحية والإصابات بدقة، واستشارة مختص طبي قبل البدء بأي مجهود بدني مكثف.',
      ],
      [
        '82000000-0000-4000-8000-000000000004',
        'PRIVACY',
        '1.0.0',
        'ar',
        'سياسة الخصوصية لتطبيق Motion',
        'يجمع تطبيق Motion بيانات الملف الشخصي والإصابات والتمارين والتغذية والنشاط اليومي اللازمة فقط لتخصيص برنامجك ومتابعة تقدمك، ويمكنك طلب حذف حسابك وبياناتك في أي وقت.',
      ],
    ] as const)
      await query(
        m,
        `INSERT INTO legal_documents(id,type,version,locale,title,content,active)
         VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(type,version,locale) DO NOTHING`,
        [id, type, version, locale, title, content],
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

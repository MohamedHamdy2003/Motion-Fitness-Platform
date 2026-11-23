export const DAY_LABELS = [
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
  'الأحد',
];

export const readableCode = (code) => {
  const map = {
    FAT_LOSS: 'خسارة الدهون',
    STRENGTH_HYPERTROPHY: 'القوة وبناء العضلات',
    GET_FIT_TONED: 'اللياقة وشد الجسم',
    IMPROVE_ENDURANCE: 'تحسين التحمل',
    BEGINNER: 'مبتدئ',
    INTERMEDIATE: 'متوسط',
    ADVANCED: 'متقدم',
    MALE: 'ذكر',
    FEMALE: 'أنثى',
  };
  return (
    map[code] ||
    (code || '')
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/^./, (character) => character.toUpperCase())
  );
};

export const slugify = (title) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);

export const splitList = (text) =>
  text
    .split(/[\n,،]/)
    .map((part) => part.trim())
    .filter(Boolean);

export function emptyExercise() {
  return {
    exerciseRevisionId: '',
    prescription: {
      mode: 'REPS',
      setCount: 3,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 60,
    },
  };
}

export function emptyWorkout() {
  return { title: '', description: '', exercises: [emptyExercise()] };
}

export function emptyMealSlot() {
  return { mealType: 'LUNCH', localTime: '12:00', mealVersionId: '' };
}

export function emptyMonth(index) {
  return {
    title: `الشهر ${index + 1}`,
    weeks: Array.from({ length: 4 }, () => ({
      days: Array.from({ length: 7 }, () => ({ kind: 'REST', meals: [] })),
    })),
  };
}

export function emptyProgram() {
  return {
    slug: '',
    title: '',
    description: '',
    primaryGoal: '',
    supportedGoals: [],
    idealLevel: '',
    supportedLevels: [],
    trainingDaysPerWeek: 3,
    editorialPriority: 0,
    requiredEquipment: [],
    intendedAudience: null,
    months: [emptyMonth(0)],
  };
}

export function fromProgram(data) {
  return {
    slug: data.slug,
    title: data.title,
    description: data.description,
    primaryGoal: data.primary_goal,
    supportedGoals: data.supported_goals || [],
    idealLevel: data.ideal_level,
    supportedLevels: data.supported_levels || [],
    trainingDaysPerWeek: data.training_days_per_week,
    editorialPriority: data.editorial_priority,
    requiredEquipment: data.required_equipment || [],
    intendedAudience: data.intended_audience || null,
    months: data.months.map((month) => ({
      title: month.title,
      weeks: month.weeks.map((week) => ({
        days: week.days.map((day) => {
          const meals = day.meals.map((meal) => ({
            mealType: meal.meal_type,
            localTime: meal.local_time.slice(0, 5),
            mealVersionId: meal.default_meal_version_id,
          }));
          if (day.kind === 'REST') return { kind: 'REST', meals };
          return {
            kind: 'TRAINING',
            meals,
            workout: {
              title: day.workout_title,
              description: day.workout_description,
              exercises: day.exercises.map((entry) => ({
                exerciseRevisionId: entry.exercise_revision_id,
                prescription: {
                  mode: entry.duration_seconds === null ? 'REPS' : 'DURATION',
                  setCount: entry.set_count,
                  restSeconds: entry.rest_seconds,
                  ...(entry.duration_seconds === null
                    ? { repsMin: entry.reps_min, repsMax: entry.reps_max }
                    : { durationSeconds: entry.duration_seconds }),
                },
              })),
            },
          };
        }),
      })),
    })),
  };
}

export function validateProgram(form) {
  if (
    !form.title.trim() ||
    !form.description.trim() ||
    !form.slug.trim() ||
    !form.primaryGoal ||
    !form.idealLevel
  ) {
    return {
      message:
        'يرجى إدخال اسم البرنامج، المعرّف النصي (Slug)، الوصف، الهدف الأساسي، والمستوى المثالي.',
      tab: 'details',
    };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
    return {
      message:
        'يجب أن يتكون المعرّف النصي (Slug) من أحرف إنجليزية صغيرة وأرقام وشرطات مفردة فقط.',
      tab: 'details',
    };
  }
  for (const [monthIndex, month] of form.months.entries()) {
    if (!month.title.trim())
      return {
        message: 'يرجى إدخال عنوان لكل شهر في البرنامج.',
        tab: 'schedule',
        month: monthIndex,
      };
    for (const [weekIndex, week] of month.weeks.entries()) {
      const where = { tab: 'schedule', month: monthIndex, week: weekIndex };
      if (
        week.days.filter((day) => day.kind === 'TRAINING').length !==
        form.trainingDaysPerWeek
      ) {
        return {
          ...where,
          message: `الشهر ${monthIndex + 1}، الأسبوع ${weekIndex + 1} يجب أن يحتوي على ${form.trainingDaysPerWeek} أيام تدريب بالضبط.`,
        };
      }
      for (const [dayIndex, day] of week.days.entries()) {
        if (
          day.kind === 'TRAINING' &&
          (!day.workout.title.trim() ||
            !day.workout.description.trim() ||
            !day.workout.exercises.length ||
            day.workout.exercises.some((entry) => !entry.exerciseRevisionId))
        ) {
          return {
            ...where,
            day: dayIndex,
            message: `أضف عنوان التمرين والتعليمات وتمريناً واحداً على الأقل في اليوم ${dayIndex + 1}.`,
          };
        }
        if (
          day.meals.some(
            (meal) =>
              !meal.mealVersionId || !meal.mealType.trim() || !meal.localTime,
          )
        ) {
          return {
            ...where,
            day: dayIndex,
            message: `أكمل بيانات الوجبات في اليوم ${dayIndex + 1}.`,
          };
        }
      }
    }
  }
  return null;
}

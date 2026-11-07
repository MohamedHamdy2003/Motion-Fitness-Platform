-- Motion Fitness Platform — PostgreSQL relationship reference
-- Describes the schema after all migrations currently in this repository.
-- This file is documentation plus a read-only inventory query; it changes no data.

/*
RELATIONSHIP MAP
===============

ACCOUNTS AND AUTHENTICATION
---------------------------
users 1---1 user_profiles
  user_profiles.gender                 -> genders.code
  user_profiles.primary_goal            -> primary_goals.code
  user_profiles.fitness_level           -> fitness_levels.code
  user_profiles.avatar_media_id         -> media_assets.id (optional)
users 1---1 user_settings
users 1---1 user_restriction_states
users 1---1 user_food_preferences
users 1---N auth_sessions
users N---N roles through user_roles (current role codes: USER, ADMIN)
users 1---N auth_challenges (user_id is optional for pre-auth challenges)
users 1---N auth_identities
users 1---N verification_tokens
users 1---N media_assets (owner_user_id is optional for shared library media)
users 1---N user_injuries
users 1---N jobs (user_id is optional)
users 1---N domain_events
users 1---N ai_rewrite_runs
users 1---0..1 account_deletions (user_id becomes NULL after account removal)
users 1---N program_hint_versions through approved_by (optional approver)

auth_sessions 1---N auth_refresh_tokens
auth_refresh_tokens 1---0..1 auth_refresh_tokens through parent_token_id (token rotation chain)
auth_sessions 1---N verification_tokens through optional session_id

PROFILE PREFERENCES AND RESTRICTIONS
-----------------------------------
body_areas_injuries 1---N body_areas_injuries through parent_code (optional hierarchy)
body_areas_injuries 1---N user_injuries
allergens 1---N user_allergies
users N---N allergens through user_allergies
food_reference_items 1---N user_disliked_foods
users N---N food_reference_items through user_disliked_foods

EXERCISE CONTENT
----------------
exercises 1---N exercise_revisions
media_assets 1---N exercise_revisions through optional media_id
workouts 1---N workout_revisions
workout_revisions 1---N workout_exercises
exercise_revisions 1---N workout_exercises

FOOD AND MEAL CONTENT
---------------------
food_reference_items 1---0..1 foods
food_reference_items 1---0..1 ingredients
foods 1---N food_versions
media_assets 1---N food_versions through optional media_id
food_versions N---N ingredients through food_ingredients
ingredients N---N allergens through ingredient_allergens
food_exchange_groups 1---N food_exchange_group_versions
food_exchange_group_versions 1---N food_exchange_members
food_versions 1---N food_exchange_members
meal_sections 1---N meal_versions
meals 1---N meal_versions
meal_versions 1---N meal_items
food_exchange_members 1---N meal_items

PROGRAMS AND SCHEDULES
----------------------
programs 1---N program_versions
primary_goals 1---N program_versions through primary_goal
fitness_levels 1---N program_versions through ideal_level
program_versions N---N primary_goals through program_version_supported_goals
program_versions N---N fitness_levels through program_version_supported_levels
program_versions 1---1 nutrition_plan_versions through nutrition_plan_version_id
program_versions 1---N monthly_plans
program_versions 1---N program_hint_versions
program_versions 0..1---1 program_hint_versions through approved_hint_version_id (optional current approved hint)

nutrition_plans 1---N nutrition_plan_versions
nutrition_plan_versions 1---N nutrition_template_days
nutrition_template_days 1---N meal_slots
meal_versions 1---N meal_slots through default_meal_version_id
monthly_plans 1---N plan_weeks
plan_weeks 1---N plan_days
workout_revisions 1---N plan_days (optional for REST days)
nutrition_template_days 1---0..1 plan_days

SUPPORT TABLES / NON-RELATIONAL REFERENCES
-------------------------------------------
rate_limits: composite key/value counters; no foreign keys.
content_seed_imports: records imported dataset versions; no foreign keys.
available_food_references is a VIEW over food_reference_items, foods,
food_versions and ingredients; it is not a base table.

The user_roles, user_allergies, user_disliked_foods, ingredient_allergens,
food_ingredients, program_version_supported_goals, program_version_supported_levels,
workout_exercises and food_exchange_members tables are relationship/junction tables.
*/

-- Run against the application database to list the actual declared foreign keys.
SELECT
  source_table.relname AS source_table,
  source_column.attname AS source_column,
  referenced_table.relname AS referenced_table,
  referenced_column.attname AS referenced_column,
  CASE foreign_key.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete
FROM pg_constraint AS foreign_key
JOIN pg_class AS source_table
  ON source_table.oid = foreign_key.conrelid
JOIN pg_namespace AS source_schema
  ON source_schema.oid = source_table.relnamespace
JOIN pg_class AS referenced_table
  ON referenced_table.oid = foreign_key.confrelid
CROSS JOIN LATERAL unnest(foreign_key.conkey) WITH ORDINALITY AS source_key(attnum, column_order)
JOIN LATERAL unnest(foreign_key.confkey) WITH ORDINALITY AS referenced_key(attnum, column_order)
  ON referenced_key.column_order = source_key.column_order
JOIN pg_attribute AS source_column
  ON source_column.attrelid = source_table.oid
 AND source_column.attnum = source_key.attnum
JOIN pg_attribute AS referenced_column
  ON referenced_column.attrelid = referenced_table.oid
 AND referenced_column.attnum = referenced_key.attnum
WHERE foreign_key.contype = 'f'
  AND source_schema.nspname = current_schema()
ORDER BY source_table.relname, source_key.column_order;

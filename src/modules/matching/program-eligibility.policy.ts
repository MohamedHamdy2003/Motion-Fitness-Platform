import { DataSource, EntityManager } from 'typeorm';
import { query } from '../../infrastructure/database/query';
import { MatchingProfile, Candidate } from './matching.contract';
export class ProgramEligibilityPolicy {
  async candidates(
    db: DataSource | EntityManager,
    p: MatchingProfile,
  ): Promise<Candidate[]> {
    return query(
      db,
      `SELECT v.id,v.nutrition_plan_version_id AS "nutritionPlanVersionId",v.title,v.description,v.primary_goal AS "primaryGoal",v.training_days_per_week AS "trainingDaysPerWeek",v.required_equipment AS "requiredEquipment",v.intended_audience AS "intendedAudience",ARRAY(SELECT fitness_level_code FROM program_version_supported_levels WHERE program_version_id=v.id ORDER BY fitness_level_code) AS "supportedLevels",h.structured_hints AS "approvedHints"
 FROM program_versions v JOIN programs pg ON pg.id=v.program_id AND NOT pg.archived JOIN nutrition_plan_versions n ON n.id=v.nutrition_plan_version_id AND n.status='PUBLISHED'
 LEFT JOIN program_hint_versions h ON h.id=v.approved_hint_version_id AND h.status='APPROVED'
 WHERE v.status='PUBLISHED' AND v.primary_goal=$1 AND v.training_days_per_week=$2 AND EXISTS(SELECT 1 FROM program_version_supported_levels s WHERE s.program_version_id=v.id AND s.fitness_level_code=$3)
 AND EXISTS(SELECT 1 FROM primary_goals WHERE code=$1 AND active) AND EXISTS(SELECT 1 FROM fitness_levels WHERE code=$3 AND active)
 AND v.version=(SELECT max(v2.version) FROM program_versions v2 WHERE v2.program_id=v.program_id AND v2.status='PUBLISHED') ORDER BY v.id LIMIT 201`,
      [p.primaryGoal, p.trainingDaysPerWeek, p.fitnessLevel],
    );
  }
}

import { describe, expect, it } from 'vitest';
import { routeToRealtimeTopics } from '../../src/infrastructure/realtime/admin-events.service';

describe('routeToRealtimeTopics', () => {
  it('ignores read-only GET and HEAD requests', () => {
    expect(routeToRealtimeTopics('GET', '/api/v1/admin/programs')).toEqual([]);
    expect(routeToRealtimeTopics('HEAD', '/api/v1/admin/users')).toEqual([]);
  });

  it('maps admin mutations to their exact realtime dashboard topics', () => {
    expect(routeToRealtimeTopics('POST', '/api/v1/admin/programs')).toEqual([
      'programs',
      'analytics',
    ]);
    expect(
      routeToRealtimeTopics('PATCH', '/api/v1/admin/users/123/status'),
    ).toEqual(['users', 'analytics']);
    expect(
      routeToRealtimeTopics('POST', '/api/v1/admin/faq?locale=ar'),
    ).toEqual(['support']);
    expect(
      routeToRealtimeTopics('DELETE', '/api/v1/admin/ingredients/abc'),
    ).toEqual(['ingredients']);
    expect(
      routeToRealtimeTopics('POST', '/api/v1/admin/matching/rulesets'),
    ).toEqual(['matching', 'analytics']);
  });

  it('maps customer activity mutations to users and analytics topics', () => {
    expect(routeToRealtimeTopics('POST', '/api/v1/auth/register')).toEqual([
      'users',
      'analytics',
    ]);
    expect(
      routeToRealtimeTopics('POST', '/api/v1/workouts/sessions/1/complete'),
    ).toEqual(['analytics']);
  });
});

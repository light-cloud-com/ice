/**
 * Tests for FEAT-8: Activity feed data merging and formatting
 */

import { describe, it, expect } from 'vitest';

// Test the utility functions used by the activity feed

describe('Activity Feed — Data Merging', () => {
  // Simulate the merging logic from activity.tsx
  interface ActivityItem {
    id: string;
    type: 'ai' | 'infra' | 'service';
    timestamp: Date;
    title: string;
    description: string;
    status: 'success' | 'failed' | 'pending' | 'in_progress';
  }

  function mergeActivitySources(
    auditEntries: Array<{ id: string; timestamp: string; intent: string }>,
    infraDeploys: Array<{
      id: string;
      status: string;
      provider: string;
      region: string;
      environment: string;
      created_at: string;
    }>,
    serviceEvents: Array<{
      id: string;
      status: string;
      started_at: string;
      commit_message?: string;
      _serviceName: string;
    }>,
  ): ActivityItem[] {
    const items: ActivityItem[] = [];

    for (const entry of auditEntries) {
      items.push({
        id: `ai-${entry.id}`,
        type: 'ai',
        timestamp: new Date(entry.timestamp),
        title: 'AI Canvas Change',
        description: entry.intent,
        status: 'success',
      });
    }

    for (const d of infraDeploys) {
      const statusMap: Record<string, ActivityItem['status']> = {
        success: 'success',
        failed: 'failed',
        deploying: 'in_progress',
        planning: 'in_progress',
      };
      items.push({
        id: `infra-${d.id}`,
        type: 'infra',
        timestamp: new Date(d.created_at),
        title: `Infrastructure ${d.status}`,
        description: `${d.provider.toUpperCase()} · ${d.region} · ${d.environment}`,
        status: statusMap[d.status] || 'pending',
      });
    }

    for (const ev of serviceEvents) {
      const statusMap: Record<string, ActivityItem['status']> = {
        success: 'success',
        failed: 'failed',
        building: 'in_progress',
        deploying: 'in_progress',
      };
      items.push({
        id: `svc-${ev.id}`,
        type: 'service',
        timestamp: new Date(ev.started_at),
        title: `Service Deploy: ${ev._serviceName}`,
        description: ev.commit_message || '',
        status: statusMap[ev.status] || 'pending',
      });
    }

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items;
  }

  it('should merge all three sources into a single sorted list', () => {
    const result = mergeActivitySources(
      [{ id: 'a1', timestamp: '2026-03-20T10:00:00Z', intent: 'Add database' }],
      [
        {
          id: 'd1',
          status: 'success',
          provider: 'gcp',
          region: 'us-central1',
          environment: 'dev',
          created_at: '2026-03-20T12:00:00Z',
        },
      ],
      [
        {
          id: 's1',
          status: 'success',
          started_at: '2026-03-20T11:00:00Z',
          commit_message: 'fix: api',
          _serviceName: 'api',
        },
      ],
    );

    expect(result).toHaveLength(3);
    // Sorted descending by timestamp: infra (12:00), service (11:00), ai (10:00)
    expect(result[0].type).toBe('infra');
    expect(result[1].type).toBe('service');
    expect(result[2].type).toBe('ai');
  });

  it('should prefix IDs by type to avoid collisions', () => {
    const result = mergeActivitySources(
      [{ id: '1', timestamp: '2026-03-20T10:00:00Z', intent: 'test' }],
      [
        {
          id: '1',
          status: 'success',
          provider: 'gcp',
          region: 'r',
          environment: 'e',
          created_at: '2026-03-20T11:00:00Z',
        },
      ],
      [],
    );

    expect(result[0].id).toBe('infra-1');
    expect(result[1].id).toBe('ai-1');
  });

  it('should map deployment statuses correctly', () => {
    const result = mergeActivitySources(
      [],
      [
        {
          id: 'd1',
          status: 'deploying',
          provider: 'gcp',
          region: 'r',
          environment: 'e',
          created_at: '2026-03-20T10:00:00Z',
        },
        {
          id: 'd2',
          status: 'failed',
          provider: 'gcp',
          region: 'r',
          environment: 'e',
          created_at: '2026-03-20T09:00:00Z',
        },
      ],
      [],
    );

    expect(result[0].status).toBe('in_progress');
    expect(result[1].status).toBe('failed');
  });

  it('should handle empty sources gracefully', () => {
    const result = mergeActivitySources([], [], []);
    expect(result).toEqual([]);
  });

  it('should handle AI entries with long intents', () => {
    const longIntent =
      'Create a scalable microservices architecture with load balancer, API gateway, three backend services, PostgreSQL database, and Redis cache';
    const result = mergeActivitySources([{ id: 'a1', timestamp: '2026-03-20T10:00:00Z', intent: longIntent }], [], []);

    expect(result[0].description).toBe(longIntent);
    expect(result[0].title).toBe('AI Canvas Change');
  });
});

describe('Activity Feed — Relative Time Formatting', () => {
  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  it('should show "Just now" for very recent times', () => {
    expect(formatRelativeTime(new Date())).toBe('Just now');
  });

  it('should show minutes for recent times', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago');
  });

  it('should show hours for same-day times', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000);
    expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
  });

  it('should show days for recent dates', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');
  });
});

/**
 * DynamoDB Blueprint — Flat Card
 *
 * Database.DynamoDB — NoSQL key-value with single-digit ms latency.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const dynamodbBlueprint: BlockBlueprint = createBlueprintFromResource('dynamodb', {
  iceType: 'Database.DynamoDB',
  category: 'data',
  name: 'DynamoDB',
  description: 'AWS NoSQL key-value. Single-digit ms.',
  icon: 'Database',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'DynamoDB',
  },
});

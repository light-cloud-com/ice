/**
 * DynamoDB Blueprint — Flat Card
 *
 * Database.DynamoDB — NoSQL key-value with single-digit ms latency.
 */

import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const dynamodbBlueprint: BlockBlueprint = createBlueprintFromResource('dynamodb', {
  blockType: 'dynamodb',
  category: 'data',
  name: 'DynamoDB',
  description: 'AWS NoSQL key-value. Single-digit ms.',
  icon: 'Database',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Database.DynamoDB',
    runtime: 'DynamoDB',
  },
});

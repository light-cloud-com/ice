/**
 * Redis Cache canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize Redis.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgRedisCacheNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgRedisCacheNode.displayName = 'SvgRedisCacheNode';

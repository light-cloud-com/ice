/**
 * MongoDB canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize MongoDB.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgMongodbNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgMongodbNode.displayName = 'SvgMongodbNode';

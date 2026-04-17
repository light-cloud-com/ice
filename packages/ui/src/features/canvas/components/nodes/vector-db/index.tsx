/**
 * Vector DB canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize Vector DB.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgVectorDbNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgVectorDbNode.displayName = 'SvgVectorDbNode';

/**
 * Scalable Backend canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize Scalable Backend.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgScalableBackendNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgScalableBackendNode.displayName = 'SvgScalableBackendNode';

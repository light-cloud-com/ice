/**
 * Observability canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize Observability.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgObservabilityNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgObservabilityNode.displayName = 'SvgObservabilityNode';

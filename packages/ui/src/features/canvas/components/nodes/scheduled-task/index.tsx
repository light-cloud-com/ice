/**
 * Scheduled Task canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize Scheduled Task.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgScheduledTaskNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgScheduledTaskNode.displayName = 'SvgScheduledTaskNode';

/**
 * Worker canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize Worker.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgWorkerNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgWorkerNode.displayName = 'SvgWorkerNode';

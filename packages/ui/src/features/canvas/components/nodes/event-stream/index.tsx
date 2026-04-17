/**
 * Event Stream canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize Event Stream.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgEventStreamNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgEventStreamNode.displayName = 'SvgEventStreamNode';

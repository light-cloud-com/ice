/**
 * Private AI Service canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize Private AI.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgPrivateAiServiceNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgPrivateAiServiceNode.displayName = 'SvgPrivateAiServiceNode';

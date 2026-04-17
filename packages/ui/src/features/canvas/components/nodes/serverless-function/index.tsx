/**
 * Serverless Function canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize Serverless Function.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgServerlessFunctionNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgServerlessFunctionNode.displayName = 'SvgServerlessFunctionNode';

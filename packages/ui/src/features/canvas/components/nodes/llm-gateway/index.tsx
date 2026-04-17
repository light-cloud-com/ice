/**
 * LLM Gateway canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize LLM Gateway.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgLlmGatewayNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgLlmGatewayNode.displayName = 'SvgLlmGatewayNode';

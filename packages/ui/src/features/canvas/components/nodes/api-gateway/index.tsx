/**
 * API Gateway canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize API Gateway.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgApiGatewayNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgApiGatewayNode.displayName = 'SvgApiGatewayNode';

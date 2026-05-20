/**
 * Public Traffic canvas node.
 *
 * A symbolic "internet / outside users" source node. The existing
 * floating user icon (use-exposed-services) auto-renders this above
 * public-facing services; this file exists so a user-placed block
 * still has a proper card renderer. Delegates to SvgCompactNode for now.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgPublicTrafficNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgPublicTrafficNode.displayName = 'SvgPublicTrafficNode';

/**
 * Postgres canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize Postgres.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgPostgresNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgPostgresNode.displayName = 'SvgPostgresNode';

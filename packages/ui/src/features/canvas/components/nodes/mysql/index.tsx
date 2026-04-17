/**
 * MySQL canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize MySQL.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgMysqlNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgMysqlNode.displayName = 'SvgMysqlNode';

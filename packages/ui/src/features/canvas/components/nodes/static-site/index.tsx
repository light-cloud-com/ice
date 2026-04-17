/**
 * Static Site canvas node.
 *
 * Currently delegates to the generic SvgCompactNode so it gets the
 * standard card chrome + schema-driven metadata lines. Edit this file
 * directly to give Static Site its own visual without affecting any
 * other block.
 */

import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgStaticSiteNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgStaticSiteNode.displayName = 'SvgStaticSiteNode';

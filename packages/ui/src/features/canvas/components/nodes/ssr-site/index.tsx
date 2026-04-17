/**
 * SSR Site canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize SSR Site.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgSsrSiteNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgSsrSiteNode.displayName = 'SvgSsrSiteNode';

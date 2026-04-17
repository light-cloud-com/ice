/**
 * GitHub Repo canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize GitHub Repo.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgGithubRepoNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgGithubRepoNode.displayName = 'SvgGithubRepoNode';

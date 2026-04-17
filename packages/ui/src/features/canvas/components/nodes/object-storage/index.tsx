/**
 * Object Storage canvas node.
 * Delegates to SvgCompactNode. Edit freely to customize Object Storage.
 */
import React from 'react';
import { SvgCompactNode } from '../compact-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgObjectStorageNode: React.FC<SvgCompactNodeProps> = (props) => <SvgCompactNode {...props} />;
SvgObjectStorageNode.displayName = 'SvgObjectStorageNode';

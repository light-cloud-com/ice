/**
 * SvgObjectStorageNode — Read-only canvas renderer for `Storage.Bucket`.
 *
 * Body is three stacked "drawer" bands suggesting bucket contents, with
 * a globe or padlock glyph on the right side encoding the public/private
 * state. The storage class (Standard / Nearline / Cool / etc.) lands in
 * the live-config footer.
 */

import { BUCKET_BODY_HEIGHT, BUCKET_HEADER_HEIGHT, BUCKET_PADDING, CARD_FOOTER_HEIGHT } from '@ice/constants';
import { Folder, Globe, Lock } from 'lucide-react';
import React from 'react';
import { t } from '../../../../../i18n';
import { CardShell } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { BUCKET_HEADER_HEIGHT, BUCKET_BODY_HEIGHT, BUCKET_PADDING };

export function computeObjectStorageHeight(): number {
  return BUCKET_HEADER_HEIGHT + BUCKET_PADDING + BUCKET_BODY_HEIGHT + BUCKET_PADDING + CARD_FOOTER_HEIGHT;
}

const BUCKET_ACCENT = '#84cc16';

function getStorageClassLabel(k: string): string {
  switch (k) {
    case 'standard':
      return t('canvas.blocks.storage.classStandard');
    case 'nearline':
      return t('canvas.blocks.storage.classNearline');
    case 'coldline':
      return t('canvas.blocks.storage.classColdline');
    case 'archive':
      return t('canvas.blocks.storage.classArchive');
    case 'ia':
      return t('canvas.blocks.storage.classInfrequent');
    case 'glacier':
      return t('canvas.blocks.storage.classGlacier');
    case 'glacier_deep_archive':
      return t('canvas.blocks.storage.classGlacierDeep');
    case 'hot':
      return t('canvas.blocks.storage.classHot');
    case 'cool':
      return t('canvas.blocks.storage.classCool');
    default:
      return k;
  }
}

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const cls = ((data?.storage_class as string) || '').toLowerCase();
  const classLabel = cls ? getStorageClassLabel(cls) : '';
  const isPublic = !!(data?.public ?? data?.publicRead);
  const versioning = !!data?.versioning;
  const parts = [
    isPublic ? t('canvas.blocks.storage.public') : t('canvas.blocks.storage.private'),
    classLabel,
    versioning ? t('canvas.blocks.storage.versioned') : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

interface DrawersProps {
  color: string;
  isPublic: boolean;
}

const BucketDrawers: React.FC<DrawersProps> = ({ color, isPublic }) => {
  const StatusIcon = isPublic ? Globe : Lock;
  const statusColor = isPublic ? '#3b82f6' : '#94a3b8';
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 12,
              borderRadius: 2,
              background: `${color}15`,
              border: `1px solid ${color}40`,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 4,
                right: 4,
                top: '50%',
                transform: 'translateY(-50%)',
                height: 1,
                background: `${color}60`,
                opacity: 0.4,
              }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: `${statusColor}18`,
          border: `1px solid ${statusColor}55`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: statusColor,
          flexShrink: 0,
        }}
        title={isPublic ? t('canvas.blocks.storage.publicBucket') : t('canvas.blocks.storage.privateBucket')}
      >
        <StatusIcon size={14} />
      </div>
    </div>
  );
};

export const SvgObjectStorageNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const isPublic = !!(node.data?.public ?? node.data?.publicRead);
  const liveConfig = buildLiveConfig(node.data) || t('canvas.blocks.storage.private');

  return (
    <CardShell
      node={node}
      isSelected={isSelected}
      isDragOver={isDragOver}
      onNodeHover={onNodeHover}
      connectionDragState={connectionDragState}
      lod={lod}
      pipelineStatus={pipelineStatus}
      icon={Folder}
      accentColor={BUCKET_ACCENT}
      title={node.label || t('canvas.blocks.titles.objectStorage')}
      liveConfig={liveConfig}
      headerHeight={BUCKET_HEADER_HEIGHT}
    >
      <div style={{ height: BUCKET_BODY_HEIGHT, display: 'flex' }} data-testid={`bucket-body-${node.id}`}>
        <BucketDrawers color={BUCKET_ACCENT} isPublic={isPublic} />
      </div>
    </CardShell>
  );
};

SvgObjectStorageNode.displayName = 'SvgObjectStorageNode';

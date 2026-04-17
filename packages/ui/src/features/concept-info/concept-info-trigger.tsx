/**
 * Concept Info Trigger
 *
 * The small (i) button that opens the ConceptInfoModal. Mounted on
 * high-level concept blocks (and in the properties panel once that's wired).
 * Only renders when the given iceType has registered info content.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { hasConceptInfo } from '@ice/blocks';
import type { Provider } from '@ice/blocks';
import { ConceptInfoModal } from './concept-info-modal';

interface ConceptInfoTriggerProps {
  iceType: string;
  displayName: string;
  currentProvider?: Provider;
  size?: number;
  opacity?: number;
}

export const ConceptInfoTrigger: React.FC<ConceptInfoTriggerProps> = ({
  iceType,
  displayName,
  currentProvider,
  size = 14,
  opacity = 0.6,
}) => {
  const [open, setOpen] = useState(false);

  if (!hasConceptInfo(iceType)) return null;

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center justify-center rounded-full"
        title="About this block"
        aria-label="About this block"
        style={{
          width: size,
          height: size,
          fontSize: Math.floor(size * 0.72),
          fontFamily: "'Georgia', serif",
          fontStyle: 'italic',
          fontWeight: 700,
          lineHeight: 1,
          background: 'transparent',
          border: '1px solid var(--ice-text-tertiary)',
          color: 'var(--ice-text-secondary)',
          opacity,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        i
      </button>
      {open &&
        createPortal(
          <ConceptInfoModal
            iceType={iceType}
            displayName={displayName}
            currentProvider={currentProvider}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  );
};

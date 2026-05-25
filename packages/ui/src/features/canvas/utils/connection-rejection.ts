/**
 * Human-readable rejection messages for the connection-drawing flow.
 *
 * `handleConnectionEnd` in `useConnectionDrawing` has three rejection
 * paths (canConnect failure, special-rule conflict, validation hard
 * error). All three previously logged to `console.warn` and silently
 * cancelled the drag, leaving the user with no idea why the connection
 * didn't take. `buildRejectionMessage` translates a rejection cause
 * into the short string the inline tooltip surfaces near the cursor.
 */

import { t } from '../../../i18n';

export type RejectionCause =
  | { kind: 'no-rule' }
  | { kind: 'special-conflict'; label: string }
  | { kind: 'validation-error'; message: string }
  /**
   * The drag started from a typed port (e.g. `repository-out`) and the
   * target block has no matching IN port for that role. Carries the
   * source port's role so the message can be specific.
   */
  | { kind: 'role-mismatch'; role: string };

/** "Database.MySQL" → "MySQL"; "Compute.ServerlessFunction" → "Serverless Function".
 *
 * Split between a lowercase and an uppercase letter ONLY when the
 * uppercase letter is followed by another lowercase letter — that
 * keeps brand-name acronyms like MySQL, MongoDB, PostgreSQL intact
 * while still humanising real CamelCase ("CustomDomain" → "Custom
 * Domain"). */
function humanizeIceType(iceType: string): string {
  const tail = iceType.split('.').pop() || iceType;
  return tail.replace(/([a-z])([A-Z])(?=[a-z])/g, '$1 $2');
}

export function buildRejectionMessage(srcIceType: string, tgtIceType: string, cause: RejectionCause): string {
  if (cause.kind === 'validation-error') return cause.message;
  if (cause.kind === 'special-conflict') {
    return t('canvas.rejection.specialConflict', { label: cause.label });
  }
  if (cause.kind === 'role-mismatch') {
    const tgt = humanizeIceType(tgtIceType) || t('canvas.rejection.fallbackTgt');
    // No i18n key for this yet — inline English with the role surfaced
    // so the user sees exactly what's expected. Translators can take
    // it later via the standard key extraction pass.
    return `${tgt} has no ${cause.role} input`;
  }
  const src = humanizeIceType(srcIceType) || t('canvas.rejection.fallbackSrc');
  const tgt = humanizeIceType(tgtIceType) || t('canvas.rejection.fallbackTgt');
  return t('canvas.rejection.noRule', { src, tgt });
}

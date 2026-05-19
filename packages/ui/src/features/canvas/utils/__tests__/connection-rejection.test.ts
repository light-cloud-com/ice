/**
 * Tests for the rejection-message builder used by `useConnectionDrawing`.
 *
 * Branches:
 *   - `no-rule` → "X can't connect directly to Y", humanised
 *   - `special-conflict` → "Only one ${label} can be connected to a service"
 *   - `validation-error` → forwards the verbatim message from the validator
 *   - empty iceType falls back to "This block"/"that block"
 */

import { describe, it, expect } from 'vitest';
import { buildRejectionMessage } from '../connection-rejection';

describe('buildRejectionMessage', () => {
  it('humanises src/tgt iceTypes and joins them with "can\'t connect directly"', () => {
    expect(buildRejectionMessage('Network.Gateway', 'Database.MySQL', { kind: 'no-rule' })).toBe(
      "Gateway can't connect directly to MySQL",
    );
  });

  it('splits CamelCase tails (ServerlessFunction → Serverless Function)', () => {
    expect(
      buildRejectionMessage('Network.Gateway', 'Compute.ServerlessFunction', { kind: 'no-rule' }),
    ).toBe("Gateway can't connect directly to Serverless Function");
  });

  it('returns the special-conflict template with the label inlined', () => {
    expect(
      buildRejectionMessage('Compute.Worker', 'Source.Repository', {
        kind: 'special-conflict',
        label: 'GitHub Repo',
      }),
    ).toBe('Only one GitHub Repo can be connected to a service');
  });

  it('forwards the validation-error message verbatim', () => {
    expect(
      buildRejectionMessage('Compute.Worker', 'Compute.Worker', {
        kind: 'validation-error',
        message: 'A block cannot connect to itself',
      }),
    ).toBe('A block cannot connect to itself');
  });

  it('falls back to "This block"/"that block" when iceType is empty', () => {
    expect(buildRejectionMessage('', '', { kind: 'no-rule' })).toBe(
      "This block can't connect directly to that block",
    );
  });
});

/**
 * Properties-panel UI helpers.
 *
 * Drives the right-hand properties panel via the data-prop-key attributes
 * we added to TextField/NumberField/SelectField wrappers and to the
 * generic PropertyFields renderer. Falls back to label-text matching for
 * fields that don't yet expose data-prop-key.
 */

import type { Page } from '@playwright/test';
import type { RunLogger } from '../logger/run-logger';

export interface SetPropertyOpts {
  routeId?: string; // for routes.subdomain et al.
  exact?: boolean;
}

export class PropertiesUI {
  constructor(
    private page: Page,
    private logger: RunLogger,
  ) {}

  /**
   * Find the input element bound to a property key. Tries:
   *   1. [data-prop-key="<key>"][data-route-id="<routeId>"] (when routeId given)
   *   2. [data-prop-key="<key>"] (input or select)
   *   3. label-text near an input (case-insensitive contains)
   */
  async findInput(key: string, opts: SetPropertyOpts = {}) {
    if (opts.routeId) {
      const scoped = this.page.locator(`[data-prop-key="${key}"][data-route-id="${opts.routeId}"]`);
      if ((await scoped.count()) > 0) return scoped.first();
    }
    const direct = this.page.locator(`input[data-prop-key="${key}"], select[data-prop-key="${key}"]`);
    if ((await direct.count()) > 0) return direct.first();

    // fallback: label-based
    const wrapper = this.page.locator(`[data-prop-key="${key}"]`);
    if ((await wrapper.count()) > 0) {
      const inner = wrapper.locator('input, select').first();
      if ((await inner.count()) > 0) return inner;
    }

    // last-resort: visible label text → adjacent input
    const labelMatch = this.page.locator(`text=/^${escapeRegExp(key)}$/i`);
    if ((await labelMatch.count()) > 0) {
      const sibling = labelMatch.first().locator('xpath=following::input[1] | xpath=following::select[1]');
      if ((await sibling.count()) > 0) return sibling.first();
    }

    throw new Error(`property input not found for key="${key}"${opts.routeId ? ` routeId=${opts.routeId}` : ''}`);
  }

  async setText(key: string, value: string, opts: SetPropertyOpts = {}): Promise<void> {
    const input = await this.findInput(key, opts);
    this.logger.emit({
      kind: 'ui_action',
      action: 'fill',
      selector: `[data-prop-key="${key}"]`,
      args: { value, ...opts },
    });
    await input.fill(value);
    // Many panel inputs commit on blur/change rather than per-keystroke.
    await input.blur().catch(() => undefined);
  }

  async setSelect(key: string, value: string, opts: SetPropertyOpts = {}): Promise<void> {
    const input = await this.findInput(key, opts);
    const tag = await input.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
    this.logger.emit({
      kind: 'ui_action',
      action: 'select',
      selector: `[data-prop-key="${key}"]`,
      args: { value, ...opts },
    });
    if (tag === 'select') {
      await input.selectOption(value);
    } else {
      // text input that accepts free-form values
      await input.fill(value);
      await input.blur().catch(() => undefined);
    }
  }

  /**
   * Apply a flat map of property values. Strings → setText; arrays/objects
   * are skipped (callers handle complex shapes per-block).
   */
  async applyProperties(props: Record<string, unknown>, opts: SetPropertyOpts = {}): Promise<void> {
    for (const [key, value] of Object.entries(props)) {
      if (value == null) continue;
      if (typeof value === 'string' || typeof value === 'number') {
        await this.setText(key, String(value), opts);
      } else if (typeof value === 'boolean') {
        // booleans render as toggle buttons; click the wrapper if state mismatch
        const wrapper = this.page.locator(`[data-prop-key="${key}"]`).first();
        if ((await wrapper.count()) > 0) {
          this.logger.emit({
            kind: 'ui_action',
            action: 'click',
            selector: `[data-prop-key="${key}"] button`,
            args: { value },
          });
          await wrapper.locator('button').first().click().catch(() => undefined);
        }
      } else {
        this.logger.note(`skipping complex property ${key} (${typeof value})`, 'warn');
      }
    }
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

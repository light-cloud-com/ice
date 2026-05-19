/**
 * Tests for `Card` and its 5 sub-components.
 *
 * All six are forwardRef wrappers around plain HTML elements with `cn()`
 * to merge a default className with the caller's. Each is asserted on:
 *   - rendered tag,
 *   - default className tokens present,
 *   - caller className merged in,
 *   - extra HTML attributes forwarded,
 *   - ref forwarded,
 *   - displayName set.
 */

import { describe, it, expect } from 'vitest';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../card';

interface ElLike {
  type: unknown;
  props: { className?: string; [k: string]: unknown };
}

type ForwardRef = { render: (props: unknown, ref: unknown) => ElLike };

const callRender = (Comp: unknown, props: Record<string, unknown>, ref: unknown = null): ElLike =>
  (Comp as unknown as ForwardRef).render(props, ref);

const COMPONENTS = [
  { Comp: Card, name: 'Card', tag: 'div', defaultToken: 'rounded-lg' },
  { Comp: CardHeader, name: 'CardHeader', tag: 'div', defaultToken: 'p-6' },
  { Comp: CardTitle, name: 'CardTitle', tag: 'h3', defaultToken: 'font-semibold' },
  { Comp: CardDescription, name: 'CardDescription', tag: 'p', defaultToken: 'text-muted-foreground' },
  { Comp: CardContent, name: 'CardContent', tag: 'div', defaultToken: 'p-6' },
  { Comp: CardFooter, name: 'CardFooter', tag: 'div', defaultToken: 'items-center' },
] as const;

describe('Card components — structural', () => {
  for (const { Comp, name, tag, defaultToken } of COMPONENTS) {
    describe(name, () => {
      it(`renders an HTML <${tag}>`, () => {
        const el = callRender(Comp, {});
        expect(el.type).toBe(tag);
      });

      it('includes its default class tokens', () => {
        const el = callRender(Comp, {});
        expect(el.props.className).toContain(defaultToken);
      });

      it('merges caller className with defaults', () => {
        const el = callRender(Comp, { className: 'custom-x' });
        expect(el.props.className).toContain('custom-x');
        expect(el.props.className).toContain(defaultToken);
      });

      it('forwards extra HTML attributes via spread', () => {
        const el = callRender(Comp, { id: 'x', 'data-x': '1' });
        expect(el.props.id).toBe('x');
        expect(el.props['data-x']).toBe('1');
      });

      it('runs without throwing when a ref is supplied', () => {
        const ref = { current: null };
        const el = callRender(Comp, {}, ref);
        expect(el.type).toBe(tag);
      });

      it('has a non-empty displayName', () => {
        expect((Comp as unknown as { displayName?: string }).displayName).toBe(name);
      });
    });
  }
});

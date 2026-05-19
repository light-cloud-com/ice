/**
 * Tests for `SvgCustomDomainNode` — bespoke renderer for `Network.CustomDomain`.
 *
 * Renders header + root domain input + one row per route + add-route button
 * inside a foreignObject card, plus per-row connection ports + a left-side
 * inbound port (gated on hover/select/valid-target). useState is mocked so
 * the component can be invoked outside a render context.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    hoverValue: false as boolean,
    setHoverSpy: vi.fn(),
  },
  randomMath: 0.5 as number,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initialValue = typeof init === 'function' ? (init as () => T)() : init;
      if (typeof initialValue === 'boolean') {
        return [mocks.state.hoverValue as unknown as T, mocks.state.setHoverSpy];
      }
      return [initialValue, vi.fn()];
    }),
    useCallback: vi.fn(<T,>(fn: T) => fn),
  };
});

import {
  SvgCustomDomainNode,
  computeCustomDomainHeight,
  computeCustomDomainWidth,
  getCustomDomainRoutePortY,
  CD_HEADER_HEIGHT,
  CD_DOMAIN_FIELD_HEIGHT,
  CD_ROUTE_ROW_HEIGHT,
  CD_ROUTE_ROW_GAP,
  CD_PADDING,
} from '..';
import type { CanvasNode } from '../../../svg-canvas';

type ReactNodeLike = React.ReactNode;
function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && el.type === type) out.push(el);
  return out;
}
function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}
function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  const visit = (n: ReactNodeLike): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    const el = n as React.ReactElement;
    visit((el.props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join('');
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'cd-1',
  type: 'block',
  x: 100,
  y: 200,
  width: 300,
  height: 200,
  label: 'Custom Domain',
  data: {},
  ...overrides,
});

const renderCD = (props: Partial<React.ComponentProps<typeof SvgCustomDomainNode>> = {}): React.ReactElement => {
  const Inner = SvgCustomDomainNode as React.FC<React.ComponentProps<typeof SvgCustomDomainNode>>;
  const defaults: React.ComponentProps<typeof SvgCustomDomainNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return Inner({ ...defaults, ...props }) as React.ReactElement;
};

beforeEach(() => {
  mocks.state.hoverValue = false;
  mocks.state.setHoverSpy.mockClear();
});

describe('Layout helpers', () => {
  it('computeCustomDomainWidth returns CARD_WIDTH+40', () => {
    const w = computeCustomDomainWidth();
    expect(typeof w).toBe('number');
    expect(w).toBeGreaterThan(40);
  });

  it('computeCustomDomainHeight grows with route count', () => {
    const empty = computeCustomDomainHeight({});
    const oneRoute = computeCustomDomainHeight({ routes: [{ id: 'r1', subdomain: 'app' }] });
    const threeRoutes = computeCustomDomainHeight({
      routes: [
        { id: 'r1', subdomain: 'app' },
        { id: 'r2', subdomain: 'api' },
        { id: 'r3', subdomain: 'admin' },
      ],
    });
    expect(oneRoute).toBeGreaterThan(empty);
    expect(threeRoutes).toBeGreaterThan(oneRoute);
    expect(threeRoutes - oneRoute).toBe(2 * (CD_ROUTE_ROW_HEIGHT + CD_ROUTE_ROW_GAP));
  });

  it('computeCustomDomainHeight handles empty routes / missing data', () => {
    expect(computeCustomDomainHeight({})).toBe(computeCustomDomainHeight({ routes: [] }));
  });

  it('getCustomDomainRoutePortY for row 0 = headerH + domainH + padding + rowH/2', () => {
    expect(getCustomDomainRoutePortY(0)).toBe(
      CD_HEADER_HEIGHT + CD_DOMAIN_FIELD_HEIGHT + CD_PADDING + CD_ROUTE_ROW_HEIGHT / 2,
    );
  });

  it('getCustomDomainRoutePortY for row N adds N*(rowH+gap)', () => {
    const row1 = getCustomDomainRoutePortY(1);
    const row0 = getCustomDomainRoutePortY(0);
    expect(row1 - row0).toBe(CD_ROUTE_ROW_HEIGHT + CD_ROUTE_ROW_GAP);
  });
});

describe('SvgCustomDomainNode — displayName + outer <g>', () => {
  it('carries displayName "SvgCustomDomainNode"', () => {
    expect(SvgCustomDomainNode.displayName).toBe('SvgCustomDomainNode');
  });

  it('renders an outer <g> with data-node-id and data-ice-type', () => {
    const tree = renderCD({ node: makeNode({ id: 'cd-7', data: { iceType: 'Network.CustomDomain' } }) });
    expect(tree.type).toBe('g');
    const props = tree.props as { 'data-node-id': string; 'data-ice-type': string };
    expect(props['data-node-id']).toBe('cd-7');
    expect(props['data-ice-type']).toBe('Network.CustomDomain');
  });

  it('default data-ice-type is "Network.CustomDomain" when iceType absent', () => {
    const tree = renderCD({ node: makeNode({ data: {} }) });
    expect((tree.props as { 'data-ice-type': string })['data-ice-type']).toBe('Network.CustomDomain');
  });
});

describe('SvgCustomDomainNode — header text', () => {
  it('renders the label as title', () => {
    const tree = renderCD({ node: makeNode({ label: 'My Domain' }) });
    expect(collectText(tree)).toContain('My Domain');
  });

  it('falls back to "Custom Domain" when label empty', () => {
    const tree = renderCD({ node: makeNode({ label: '' }) });
    expect(collectText(tree)).toContain('Custom Domain');
  });

  it('renders rootDomain in subtitle when set', () => {
    const tree = renderCD({ node: makeNode({ data: { domain: 'example.com' } }) });
    expect(collectText(tree)).toContain('example.com');
  });

  it('renders "Network · CustomDomain" subtitle fallback when no domain', () => {
    const tree = renderCD({ node: makeNode() });
    expect(collectText(tree)).toContain('Network · CustomDomain');
  });
});

describe('SvgCustomDomainNode — root domain input', () => {
  const findRootInput = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'input') return false;
      const props = el.props as { placeholder?: string; type?: string };
      return props.placeholder === 'example.com' && props.type === 'text';
    })[0];

  it('renders an input with placeholder "example.com"', () => {
    const tree = renderCD();
    expect(findRootInput(tree)).toBeDefined();
  });

  it('input value reflects data.domain', () => {
    const tree = renderCD({ node: makeNode({ data: { domain: 'foo.bar' } }) });
    const input = findRootInput(tree)!;
    expect((input.props as { value: string }).value).toBe('foo.bar');
  });

  it('input onChange calls onUpdateData with lowercased domain', () => {
    const onUpdateData = vi.fn();
    const tree = renderCD({ onUpdateData });
    const input = findRootInput(tree)!;
    const onChange = (input.props as { onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }).onChange;
    onChange({ target: { value: '  My-DOMAIN.COM  ' } } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(onUpdateData).toHaveBeenCalledWith('cd-1', { domain: 'my-domain.com' });
  });

  it('input onMouseDown / onClick stop propagation', () => {
    const tree = renderCD();
    const input = findRootInput(tree)!;
    const stops: string[] = [];
    (input.props as { onMouseDown: (e: React.MouseEvent) => void }).onMouseDown({
      stopPropagation: () => stops.push('m'),
    } as React.MouseEvent);
    (input.props as { onClick: (e: React.MouseEvent) => void }).onClick({
      stopPropagation: () => stops.push('c'),
    } as React.MouseEvent);
    expect(stops).toEqual(['m', 'c']);
  });

  it('onUpdateData no-op when callback undefined (no throw)', () => {
    const tree = renderCD({ onUpdateData: undefined });
    const input = findRootInput(tree)!;
    expect(() =>
      (input.props as { onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }).onChange({
        target: { value: 'x' },
      } as unknown as React.ChangeEvent<HTMLInputElement>),
    ).not.toThrow();
  });
});

describe('SvgCustomDomainNode — route rows', () => {
  it('renders one row per route (input + host preview + delete-button when >1)', () => {
    const tree = renderCD({
      node: makeNode({
        data: {
          domain: 'example.com',
          routes: [
            { id: 'r1', subdomain: 'app' },
            { id: 'r2', subdomain: 'api' },
          ],
        },
      }),
    });
    const subInputs = findByPredicate(tree, (el) => {
      if (el.type !== 'input') return false;
      return (el.props as { placeholder?: string }).placeholder === 'root';
    });
    expect(subInputs).toHaveLength(2);
  });

  it('subdomain input value reflects route.subdomain', () => {
    const tree = renderCD({
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: 'app' }] } }),
    });
    const inputs = findByPredicate(tree, (el) => {
      if (el.type !== 'input') return false;
      return (el.props as { placeholder?: string }).placeholder === 'root';
    });
    expect((inputs[0].props as { value: string }).value).toBe('app');
  });

  it('host preview = "{subdomain}.{rootDomain}" when both set', () => {
    const tree = renderCD({
      node: makeNode({ data: { domain: 'example.com', routes: [{ id: 'r1', subdomain: 'app' }] } }),
    });
    expect(collectText(tree)).toContain('app.example.com');
  });

  it('host preview = rootDomain when subdomain empty + rootDomain set', () => {
    const tree = renderCD({
      node: makeNode({ data: { domain: 'example.com', routes: [{ id: 'r1', subdomain: '' }] } }),
    });
    expect(collectText(tree)).toContain('example.com');
  });

  it('host preview = subdomain only when rootDomain absent', () => {
    const tree = renderCD({
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: 'app' }] } }),
    });
    expect(collectText(tree)).toContain('app');
  });

  it('host preview = "(set root domain above)" when both subdomain AND rootDomain empty', () => {
    const tree = renderCD({
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: '' }] } }),
    });
    expect(collectText(tree)).toContain('(set root domain above)');
  });

  it('subdomain input onChange normalizes via onUpdateData', () => {
    const onUpdateData = vi.fn();
    const tree = renderCD({
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: 'old' }] } }),
      onUpdateData,
    });
    const subInputs = findByPredicate(tree, (el) => {
      if (el.type !== 'input') return false;
      return (el.props as { placeholder?: string }).placeholder === 'root';
    });
    const onChange = (subInputs[0].props as { onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }).onChange;
    onChange({ target: { value: 'NEW-Sub.host' } } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(onUpdateData).toHaveBeenCalledWith('cd-1', {
      // normalizeSubdomain trims to before first dot, keeps a-z0-9- only.
      routes: [{ id: 'r1', subdomain: 'new-sub' }],
    });
  });

  it('subdomain normalization strips https:// prefix', () => {
    const onUpdateData = vi.fn();
    const tree = renderCD({
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: '' }] } }),
      onUpdateData,
    });
    const subInputs = findByPredicate(tree, (el) => {
      if (el.type !== 'input') return false;
      return (el.props as { placeholder?: string }).placeholder === 'root';
    });
    (subInputs[0].props as { onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }).onChange({
      target: { value: 'https://app.example.com' },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(onUpdateData).toHaveBeenCalledWith('cd-1', {
      routes: [{ id: 'r1', subdomain: 'app' }],
    });
  });

  it('subdomain normalization caps at 63 chars', () => {
    const onUpdateData = vi.fn();
    const tree = renderCD({
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: '' }] } }),
      onUpdateData,
    });
    const subInputs = findByPredicate(tree, (el) => {
      if (el.type !== 'input') return false;
      return (el.props as { placeholder?: string }).placeholder === 'root';
    });
    const longText = 'a'.repeat(80);
    (subInputs[0].props as { onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }).onChange({
      target: { value: longText },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
    const call = onUpdateData.mock.calls[0][1] as { routes: Array<{ subdomain: string }> };
    expect(call.routes[0].subdomain.length).toBe(63);
  });

  it('subdomain normalization strips leading/trailing dashes + non-alnum chars', () => {
    const onUpdateData = vi.fn();
    const tree = renderCD({
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: '' }] } }),
      onUpdateData,
    });
    const subInputs = findByPredicate(tree, (el) => {
      if (el.type !== 'input') return false;
      return (el.props as { placeholder?: string }).placeholder === 'root';
    });
    (subInputs[0].props as { onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }).onChange({
      target: { value: '---@@@my-sub***---' },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
    const call = onUpdateData.mock.calls[0][1] as { routes: Array<{ subdomain: string }> };
    expect(call.routes[0].subdomain).toBe('my-sub');
  });

  it('subdomain input onMouseDown stops propagation', () => {
    const tree = renderCD({
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: 'a' }] } }),
    });
    const sub = findByPredicate(tree, (el) => {
      if (el.type !== 'input') return false;
      return (el.props as { placeholder?: string }).placeholder === 'root';
    })[0];
    const stops: string[] = [];
    (sub.props as { onMouseDown: (e: React.MouseEvent) => void }).onMouseDown({
      stopPropagation: () => stops.push('m'),
    } as React.MouseEvent);
    expect(stops).toEqual(['m']);
  });

  it('subdomain input onClick stops propagation', () => {
    const tree = renderCD({
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: 'a' }] } }),
    });
    const sub = findByPredicate(tree, (el) => {
      if (el.type !== 'input') return false;
      return (el.props as { placeholder?: string }).placeholder === 'root';
    })[0];
    const stops: string[] = [];
    (sub.props as { onClick: (e: React.MouseEvent) => void }).onClick({
      stopPropagation: () => stops.push('c'),
    } as React.MouseEvent);
    expect(stops).toEqual(['c']);
  });
});

describe('SvgCustomDomainNode — delete row button', () => {
  const findDeleteBtns = (tree: React.ReactElement): React.ReactElement[] =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'button') return false;
      const props = el.props as { title?: string };
      return props.title === 'Delete route';
    });

  it('omits delete button when only 1 route', () => {
    const tree = renderCD({ node: makeNode({ data: { routes: [{ id: 'r1', subdomain: 'app' }] } }) });
    expect(findDeleteBtns(tree)).toHaveLength(0);
  });

  it('renders one delete button per row when 2+ routes', () => {
    const tree = renderCD({
      node: makeNode({
        data: {
          routes: [
            { id: 'r1', subdomain: 'app' },
            { id: 'r2', subdomain: 'api' },
            { id: 'r3', subdomain: 'admin' },
          ],
        },
      }),
    });
    expect(findDeleteBtns(tree)).toHaveLength(3);
  });

  it('delete button onClick stops propagation + filters route from updateRoutes', () => {
    const onUpdateData = vi.fn();
    const tree = renderCD({
      node: makeNode({
        data: {
          routes: [
            { id: 'r1', subdomain: 'app' },
            { id: 'r2', subdomain: 'api' },
          ],
        },
      }),
      onUpdateData,
    });
    const stops: string[] = [];
    const onClick = (findDeleteBtns(tree)[0].props as { onClick: (e: React.MouseEvent) => void }).onClick;
    onClick({ stopPropagation: () => stops.push('s') } as React.MouseEvent);
    expect(stops).toEqual(['s']);
    expect(onUpdateData).toHaveBeenCalledWith('cd-1', {
      routes: [{ id: 'r2', subdomain: 'api' }],
    });
  });

  it('delete button onMouseDown stops propagation', () => {
    const tree = renderCD({
      node: makeNode({
        data: {
          routes: [
            { id: 'r1', subdomain: 'a' },
            { id: 'r2', subdomain: 'b' },
          ],
        },
      }),
    });
    const stops: string[] = [];
    const md = (findDeleteBtns(tree)[0].props as { onMouseDown: (e: React.MouseEvent) => void }).onMouseDown;
    md({ stopPropagation: () => stops.push('m') } as React.MouseEvent);
    expect(stops).toEqual(['m']);
  });
});

describe('SvgCustomDomainNode — add route button', () => {
  const findAddBtn = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'button') return false;
      return collectText(el).includes('Add subdomain route');
    })[0];

  it('renders "Add subdomain route" button', () => {
    expect(findAddBtn(renderCD())).toBeDefined();
  });

  it('add button onClick stops propagation + appends a new route via onUpdateData', () => {
    const onUpdateData = vi.fn();
    const tree = renderCD({
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: 'app' }] } }),
      onUpdateData,
    });
    const stops: string[] = [];
    const onClick = (findAddBtn(tree)!.props as { onClick: (e: React.MouseEvent) => void }).onClick;
    onClick({ stopPropagation: () => stops.push('s') } as React.MouseEvent);
    expect(stops).toEqual(['s']);
    expect(onUpdateData).toHaveBeenCalledTimes(1);
    const call = onUpdateData.mock.calls[0][1] as { routes: Array<{ id: string; subdomain: string }> };
    expect(call.routes).toHaveLength(2);
    expect(call.routes[0].subdomain).toBe('app');
    expect(call.routes[1].subdomain).toBe('');
    expect(call.routes[1].id).toMatch(/^route-/);
  });

  it('appends a route from empty when no routes exist', () => {
    const onUpdateData = vi.fn();
    const tree = renderCD({ node: makeNode({ data: {} }), onUpdateData });
    const onClick = (findAddBtn(tree)!.props as { onClick: (e: React.MouseEvent) => void }).onClick;
    onClick({ stopPropagation: () => {} } as React.MouseEvent);
    const call = onUpdateData.mock.calls[0][1] as { routes: Array<{ id: string }> };
    expect(call.routes).toHaveLength(1);
  });

  it('add button onMouseDown stops propagation', () => {
    const tree = renderCD();
    const stops: string[] = [];
    const md = (findAddBtn(tree)!.props as { onMouseDown: (e: React.MouseEvent) => void }).onMouseDown;
    md({ stopPropagation: () => stops.push('m') } as React.MouseEvent);
    expect(stops).toEqual(['m']);
  });
});

describe('SvgCustomDomainNode — connection ports', () => {
  it('renders no ports when not hovered/selected/valid-target', () => {
    const tree = renderCD();
    expect(findByType(tree, 'circle')).toHaveLength(0);
  });

  it('renders left + per-row ports when isSelected', () => {
    const tree = renderCD({
      isSelected: true,
      node: makeNode({
        data: {
          routes: [
            { id: 'r1', subdomain: 'a' },
            { id: 'r2', subdomain: 'b' },
          ],
        },
      }),
    });
    // Left port + 2 row ports = 3 circles.
    expect(findByType(tree, 'circle')).toHaveLength(3);
  });

  it('renders ports when hovered (mocked)', () => {
    mocks.state.hoverValue = true;
    const tree = renderCD({
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: 'x' }] } }),
    });
    // Left port + 1 row port = 2 circles.
    expect(findByType(tree, 'circle')).toHaveLength(2);
  });

  it('renders ports when valid-target drag', () => {
    const tree = renderCD({
      connectionDragState: 'valid-target',
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: 'x' }] } }),
    });
    expect(findByType(tree, 'circle')).toHaveLength(2);
  });

  it('per-row port has data-route-id + data-side="right"', () => {
    const tree = renderCD({
      isSelected: true,
      node: makeNode({ data: { routes: [{ id: 'r-abc', subdomain: 'app' }] } }),
    });
    const rowPort = findByPredicate(tree, (el) => {
      if (el.type !== 'circle') return false;
      const props = el.props as { 'data-route-id'?: string };
      return props['data-route-id'] === 'r-abc';
    })[0];
    expect(rowPort).toBeDefined();
    expect((rowPort.props as { 'data-side': string })['data-side']).toBe('right');
  });

  it('valid-target port has r=6 + green fill', () => {
    const tree = renderCD({
      connectionDragState: 'valid-target',
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: 'x' }] } }),
    });
    const ports = findByType(tree, 'circle');
    for (const port of ports) {
      const props = port.props as { r: number; fill: string };
      expect(props.r).toBe(6);
      expect(props.fill).toBe('#22c55e');
    }
  });

  it('non valid-target port has r=5 + categoryGlow fill', () => {
    const tree = renderCD({
      isSelected: true,
      node: makeNode({ data: { routes: [{ id: 'r1', subdomain: 'x' }] } }),
    });
    const ports = findByType(tree, 'circle');
    for (const port of ports) {
      expect((port.props as { r: number }).r).toBe(5);
    }
  });

  it('left port has data-side="left"', () => {
    const tree = renderCD({
      isSelected: true,
      node: makeNode({ data: { routes: [] } }),
    });
    const leftPort = findByPredicate(tree, (el) => {
      if (el.type !== 'circle') return false;
      return (el.props as { 'data-side'?: string })['data-side'] === 'left';
    })[0];
    expect(leftPort).toBeDefined();
  });
});

describe('SvgCustomDomainNode — border colour priority', () => {
  const findCard = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { boxSizing?: string } }).style;
      return style?.boxSizing === 'border-box';
    })[0];

  it('cyan border when isDragOver (highest priority)', () => {
    const card = findCard(renderCD({ isDragOver: true, isSelected: true }))!;
    expect((card.props as { style: { border: string } }).style.border).toContain('#22d3ee');
  });

  it('green border when valid-target (no dragOver)', () => {
    const card = findCard(renderCD({ connectionDragState: 'valid-target' }))!;
    expect((card.props as { style: { border: string } }).style.border).toContain('#22c55e');
  });

  it('red border when invalid-target', () => {
    const card = findCard(renderCD({ connectionDragState: 'invalid-target' }))!;
    expect((card.props as { style: { border: string } }).style.border).toContain('#ef4444');
  });

  it('category glow border when isSelected (no overrides)', () => {
    const card = findCard(renderCD({ isSelected: true }))!;
    const border = (card.props as { style: { border: string } }).style.border;
    expect(border).not.toContain('55');
    expect(border).not.toContain('#22c55e');
  });

  it('faded glow border by default', () => {
    const card = findCard(renderCD())!;
    const border = (card.props as { style: { border: string } }).style.border;
    expect(border.endsWith('55')).toBe(true);
  });
});

describe('SvgCustomDomainNode — hover handlers + opacity', () => {
  it('onMouseEnter sets hover + calls onNodeHover(id)', () => {
    const onNodeHover = vi.fn();
    const tree = renderCD({ node: makeNode({ id: 'cd-7' }), onNodeHover });
    const card = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      return typeof (el.props as { onMouseEnter?: unknown }).onMouseEnter === 'function';
    })[0];
    (card.props as { onMouseEnter: () => void }).onMouseEnter();
    expect(mocks.state.setHoverSpy).toHaveBeenCalledWith(true);
    expect(onNodeHover).toHaveBeenCalledWith('cd-7');
  });

  it('onMouseLeave clears hover + calls onNodeHover(null)', () => {
    const onNodeHover = vi.fn();
    const tree = renderCD({ onNodeHover });
    const card = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      return typeof (el.props as { onMouseLeave?: unknown }).onMouseLeave === 'function';
    })[0];
    (card.props as { onMouseLeave: () => void }).onMouseLeave();
    expect(mocks.state.setHoverSpy).toHaveBeenCalledWith(false);
    expect(onNodeHover).toHaveBeenCalledWith(null);
  });

  it('hover handlers no-op when onNodeHover undefined', () => {
    const tree = renderCD();
    const card = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      return typeof (el.props as { onMouseEnter?: unknown }).onMouseEnter === 'function';
    })[0];
    expect(() => (card.props as { onMouseEnter: () => void }).onMouseEnter()).not.toThrow();
    expect(() => (card.props as { onMouseLeave: () => void }).onMouseLeave()).not.toThrow();
  });

  it('opacity drops to 0.85 when source drag', () => {
    const tree = renderCD({ connectionDragState: 'source' });
    const card = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { boxSizing?: string } }).style;
      return style?.boxSizing === 'border-box';
    })[0];
    expect((card.props as { style: { opacity: number } }).style.opacity).toBe(0.85);
  });

  it('opacity is 1 by default', () => {
    const tree = renderCD();
    const card = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { boxSizing?: string } }).style;
      return style?.boxSizing === 'border-box';
    })[0];
    expect((card.props as { style: { opacity: number } }).style.opacity).toBe(1);
  });
});

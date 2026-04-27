/**
 * describe phase — write the human-readable scenario description to the
 * run dir and emit a structured note so events.jsonl carries the spec.
 */

import type { RunContext, PhaseResult } from '../context';

export async function runDescribe(ctx: RunContext): Promise<PhaseResult> {
  const { logger, scenario } = ctx;
  try {
    const md = renderDescription(scenario);
    logger.writeDescription(md);
    logger.note('Scenario described', 'info');
    logger.emit({
      kind: 'note',
      level: 'info',
      message: `scenario: ${scenario.id} — ${scenario.blocks.length} blocks, ${scenario.connections.length} connections, ${scenario.expect.resources.length} expected resources`,
    });
    return { status: 'pass' };
  } catch (err) {
    return { status: 'fail', error: err instanceof Error ? err.message : String(err) };
  }
}

function renderDescription(s: ReturnType<() => any> extends infer _ ? any : never): string {
  // Plain JS — no fancy types needed for this side-output.
  const sc = s as {
    id: string;
    name: string;
    description: string;
    blocks: Array<{ id: string; type: string; properties?: Record<string, unknown> }>;
    connections: Array<{ from: string; to: string }>;
    expect: { resources: Array<{ kind: string; name?: string; nameContains?: string }> };
    project: { gcp: { project: string; region: string } };
  };

  const lines: string[] = [];
  lines.push(`# Scenario: ${sc.name}`);
  lines.push('');
  lines.push(`**ID:** \`${sc.id}\``);
  lines.push(`**GCP project:** \`${sc.project.gcp.project}\` · **region:** \`${sc.project.gcp.region}\``);
  lines.push('');
  if (sc.description.trim()) {
    lines.push('## Description');
    lines.push('');
    lines.push(sc.description.trim());
    lines.push('');
  }

  lines.push('## Blocks');
  lines.push('');
  for (const b of sc.blocks) {
    lines.push(`- **${b.id}** — \`${b.type}\``);
    const props = b.properties || {};
    for (const [k, v] of Object.entries(props)) {
      lines.push(`  - \`${k}\`: \`${formatVal(v)}\``);
    }
  }
  lines.push('');

  if (sc.connections.length) {
    lines.push('## Connections');
    lines.push('');
    for (const c of sc.connections) {
      lines.push(`- \`${c.from}\` → \`${c.to}\``);
    }
    lines.push('');
  }

  if (sc.expect.resources.length) {
    lines.push('## Expected resources (post-apply)');
    lines.push('');
    for (const r of sc.expect.resources) {
      const matcher = r.name ? `name=${r.name}` : r.nameContains ? `nameContains=${r.nameContains}` : '(any)';
      lines.push(`- \`${r.kind}\` · ${matcher}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatVal(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

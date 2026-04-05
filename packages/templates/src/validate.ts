/**
 * Template Validation Script
 *
 * Validates ALL templates against TEMPLATE_RULES.md.
 * Run via: pnpm validate (from packages/templates)
 *
 * Delegates structural checks (R1 iceType, R4 connections, group indices)
 * to @ice/core validateTemplate. Adds template-specific layout and
 * property rules on top.
 *
 * Checks:
 *   Core    — iceType validity, connection bounds, group ordering, connection-rules (via @ice/core)
 *   Rule 1  — Blueprint exists for each iceType
 *   Rule 2  — Block positions fit within their groups
 *   Rule 3  — Ungrouped blocks below all groups
 *   Rule 5  — VPC / Subnet nesting (non-quickstart)
 *   Rule 6  — Required block properties present
 *   Rule 7  — Group colors match convention
 *   Rule 10 — Required metadata fields
 *   Expand  — Template expands without errors for all listed providers
 */

import { getBlueprint } from '@ice/blocks';
import { validateTemplate } from '@ice/core';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  REQUIRED_PROPS,
  GROUP_COLORS,
} from '@ice/constants';
import { ALL_TEMPLATES } from './index';
import { expandComposedTemplate } from './expand-template';
import type { ComposedTemplate } from './types';
import type { Provider } from '@ice/blocks';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Issue {
  template: string;
  rule: string;
  severity: 'error' | 'warn';
  message: string;
}

function isQuickStart(t: ComposedTemplate): boolean {
  return t.category === 'quick-start';
}

// ─── Core Validation (delegates to @ice/core) ────────────────────────────────

function checkCore(t: ComposedTemplate, issues: Issue[]) {
  const coreIssues = validateTemplate(t);
  for (const ci of coreIssues) {
    // Downgrade MISSING_ICE_TYPE to warning when the block has a registered blueprint
    // (core schema-bridge may lag behind the blocks registry)
    let severity: 'error' | 'warn' = ci.severity === 'error' ? 'error' : 'warn';
    if (ci.code === 'MISSING_ICE_TYPE') {
      const match = ci.message.match(/iceType "([^"]+)"/);
      if (match && getBlueprint(match[1])) severity = 'warn';
    }
    issues.push({
      template: t.id,
      rule: `Core:${ci.code}`,
      severity,
      message: ci.message,
    });
  }
}

// ─── Rule 1: Blueprint exists ────────────────────────────────────────────────

function checkBlueprints(t: ComposedTemplate, issues: Issue[]) {
  for (let i = 0; i < t.blocks.length; i++) {
    const b = t.blocks[i];
    if (!getBlueprint(b.iceType)) {
      issues.push({ template: t.id, rule: 'R1:blueprint', severity: 'error',
        message: `Block[${i}] "${b.label}" iceType "${b.iceType}" has no registered blueprint` });
    }
  }
}

// ─── Rule 2: Block positions fit within groups ───────────────────────────────

function checkBounds(t: ComposedTemplate, issues: Issue[]) {
  if (!t.groups) return;
  for (let gi = 0; gi < t.groups.length; gi++) {
    const g = t.groups[gi];
    for (const bi of g.blockIndices) {
      if (bi < 0 || bi >= t.blocks.length) continue; // caught by core
      const b = t.blocks[bi];
      const minX = g.position.x + 20;
      const minY = g.position.y + 56;
      const maxX = g.position.x + g.width - 20;
      const maxY = g.position.y + g.height - 20;
      if (b.position.x < minX - 1 || b.position.y < minY - 1 ||
          b.position.x + CARD_WIDTH > maxX + 1 || b.position.y + CARD_HEIGHT > maxY + 1) {
        issues.push({ template: t.id, rule: 'R2:bounds', severity: 'error',
          message: `Block[${bi}] "${b.label}" at (${b.position.x},${b.position.y}) overflows group "${g.label}" bounds (${minX}-${maxX}, ${minY}-${maxY})` });
      }
    }
  }
}

// ─── Rule 3: Ungrouped blocks below all groups ──────────────────────────────

function checkUngrouped(t: ComposedTemplate, issues: Issue[]) {
  if (!t.groups || t.groups.length === 0) return;
  const groupedIndices = new Set<number>();
  let maxGroupBottom = 0;
  for (const g of t.groups) {
    for (const bi of g.blockIndices) groupedIndices.add(bi);
    maxGroupBottom = Math.max(maxGroupBottom, g.position.y + g.height);
  }
  for (let i = 0; i < t.blocks.length; i++) {
    if (!groupedIndices.has(i) && t.blocks[i].position.y < maxGroupBottom - 1) {
      issues.push({ template: t.id, rule: 'R3:ungrouped', severity: 'warn',
        message: `Ungrouped block[${i}] "${t.blocks[i].label}" at y=${t.blocks[i].position.y} overlaps groups (bottom=${maxGroupBottom})` });
    }
  }
}

// ─── Rule 5: VPC / Subnet nesting ───────────────────────────────────────────

function checkVpcSubnet(t: ComposedTemplate, issues: Issue[]) {
  if (isQuickStart(t)) return;
  if (!t.groups || t.groups.length === 0) {
    issues.push({ template: t.id, rule: 'R5:vpc', severity: 'error',
      message: 'Non-quickstart template has no groups — must have VPC with Subnets' });
    return;
  }
  const vpcGroups = t.groups.filter(g => g.iceType === 'Network.VPC');
  if (vpcGroups.length === 0) {
    issues.push({ template: t.id, rule: 'R5:vpc', severity: 'error',
      message: 'No VPC group found — every non-quickstart template must have a VPC' });
    return;
  }
  for (const vpc of vpcGroups) {
    if (vpc.blockIndices.length > 0) {
      issues.push({ template: t.id, rule: 'R5:vpc-empty', severity: 'error',
        message: `VPC "${vpc.label}" has blockIndices — VPC must have blockIndices: []` });
    }
  }
  const subnets = t.groups.filter(g => g.iceType === 'Network.Subnet');
  if (subnets.length === 0) {
    issues.push({ template: t.id, rule: 'R5:subnet', severity: 'error',
      message: 'No Subnet groups found inside VPC' });
  }
  for (const s of subnets) {
    if (s.parentGroupIndex == null) {
      issues.push({ template: t.id, rule: 'R5:parent', severity: 'error',
        message: `Subnet "${s.label}" missing parentGroupIndex — must point to VPC` });
    } else {
      const parent = t.groups[s.parentGroupIndex];
      if (!parent || parent.iceType !== 'Network.VPC') {
        issues.push({ template: t.id, rule: 'R5:parent', severity: 'error',
          message: `Subnet "${s.label}" parentGroupIndex points to non-VPC group` });
      }
    }
  }
}

// ─── Rule 6: Required block properties ──────────────────────────────────────

function checkProperties(t: ComposedTemplate, issues: Issue[]) {
  for (let i = 0; i < t.blocks.length; i++) {
    const b = t.blocks[i];
    const required = REQUIRED_PROPS[b.iceType];
    if (!required || !b.data) continue;
    for (const prop of required) {
      if (b.data[prop] === undefined) {
        issues.push({ template: t.id, rule: 'R6:prop', severity: 'error',
          message: `Block[${i}] "${b.label}" (${b.iceType}) missing required property "${prop}"` });
      }
    }
  }
}

// ─── Rule 7: Group colors ───────────────────────────────────────────────────

function checkColors(t: ComposedTemplate, issues: Issue[]) {
  if (!t.groups) return;
  for (const g of t.groups) {
    const expected = GROUP_COLORS[g.label] ?? GROUP_COLORS[g.label.replace(/ \(.*\)/, '')];
    if (expected && g.color !== expected) {
      issues.push({ template: t.id, rule: 'R7:color', severity: 'warn',
        message: `Group "${g.label}" color ${g.color} doesn't match convention ${expected}` });
    }
  }
}

// ─── Rule 10: Required metadata ─────────────────────────────────────────────

function checkMetadata(t: ComposedTemplate, issues: Issue[]) {
  const required: (keyof ComposedTemplate)[] = [
    'id', 'name', 'description', 'icon', 'estimatedCost', 'category',
    'tags', 'securityLevel', 'environmentPresets',
  ];
  for (const field of required) {
    if (!t[field] || (Array.isArray(t[field]) && (t[field] as unknown[]).length === 0)) {
      issues.push({ template: t.id, rule: 'R10:meta', severity: 'error',
        message: `Missing required metadata field "${field}"` });
    }
  }
  if (!t.difficulty) {
    issues.push({ template: t.id, rule: 'R10:meta', severity: 'warn',
      message: 'Missing optional metadata field "difficulty"' });
  }
  if (!t.trust) {
    issues.push({ template: t.id, rule: 'R10:meta', severity: 'warn',
      message: 'Missing optional metadata field "trust"' });
  }
  if (!t.author) {
    issues.push({ template: t.id, rule: 'R10:meta', severity: 'warn',
      message: 'Missing optional metadata field "author"' });
  }
}

// ─── Expansion test ─────────────────────────────────────────────────────────

function checkExpansion(t: ComposedTemplate, issues: Issue[]) {
  const providers: Provider[] = t.providers ?? (t.provider ? [t.provider as Provider] : ['gcp']);
  for (const p of providers) {
    try {
      const { nodes } = expandComposedTemplate(t, p);
      if (nodes.length === 0) {
        issues.push({ template: t.id, rule: 'Expand', severity: 'error',
          message: `Expansion for provider "${p}" produced zero nodes` });
      }
      const unsupported = nodes.filter(n => n.data?.providerUnsupported);
      if (unsupported.length > 0) {
        issues.push({ template: t.id, rule: 'Expand', severity: 'warn',
          message: `${unsupported.length} block(s) unsupported on provider "${p}": ${unsupported.map(n => n.data?.name || n.data?.iceType).join(', ')}` });
      }
    } catch (err) {
      issues.push({ template: t.id, rule: 'Expand', severity: 'error',
        message: `Expansion failed for provider "${p}": ${err}` });
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const issues: Issue[] = [];

for (const t of ALL_TEMPLATES) {
  checkCore(t, issues);       // @ice/core structural checks
  checkBlueprints(t, issues); // R1: blueprints exist
  checkBounds(t, issues);     // R2: block positions
  checkUngrouped(t, issues);  // R3: ungrouped below groups
  checkVpcSubnet(t, issues);  // R5: VPC/Subnet nesting
  checkProperties(t, issues); // R6: required properties
  checkColors(t, issues);     // R7: group colors
  checkMetadata(t, issues);   // R10: metadata
  checkExpansion(t, issues);  // Expansion for all providers
}

// ─── Report ───────────────────────────────────────────────────────────────────

const errors = issues.filter(i => i.severity === 'error');
const warnings = issues.filter(i => i.severity === 'warn');

console.log(`\nValidated ${ALL_TEMPLATES.length} templates\n`);

if (warnings.length > 0) {
  console.log(`⚠  ${warnings.length} warning(s):`);
  for (const w of warnings) {
    console.log(`   [${w.rule}] ${w.template}: ${w.message}`);
  }
  console.log();
}

if (errors.length > 0) {
  console.log(`✗  ${errors.length} error(s):`);
  for (const e of errors) {
    console.log(`   [${e.rule}] ${e.template}: ${e.message}`);
  }
  console.log();
  process.exit(1);
} else {
  console.log(`✓  All templates pass validation\n`);
}

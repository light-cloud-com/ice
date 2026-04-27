/**
 * HTML report — renders events.jsonl into a single-file timeline view per
 * run. Output: <runDir>/index.html. Self-contained; no external assets.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { basename, join, relative } from 'path';
import type { LogEvent, RunSummary } from '../logger/event-types';

export function renderRunReport(runDir: string): string {
  const eventsPath = join(runDir, 'events.jsonl');
  const summaryPath = join(runDir, 'summary.json');
  if (!existsSync(eventsPath)) throw new Error(`events.jsonl not found in ${runDir}`);

  const events: LogEvent[] = readFileSync(eventsPath, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const summary: RunSummary | null = existsSync(summaryPath)
    ? (JSON.parse(readFileSync(summaryPath, 'utf-8')) as RunSummary)
    : null;

  const html = buildHtml(events, summary, runDir);
  const outPath = join(runDir, 'index.html');
  writeFileSync(outPath, html, 'utf-8');
  return outPath;
}

function buildHtml(events: LogEvent[], summary: RunSummary | null, runDir: string): string {
  const title = summary ? `${summary.scenarioName} · ${summary.runId}` : basename(runDir);
  const status = summary?.status ?? 'unknown';
  const totals = summary?.totals;

  const phaseColor: Record<string, string> = {
    setup: '#6366f1',
    describe: '#8b5cf6',
    design: '#06b6d4',
    deploy: '#10b981',
    verify: '#f59e0b',
    cleanup: '#64748b',
    meta: '#94a3b8',
  };

  const lis: string[] = [];
  const startTs = events[0]?.ts ?? 0;
  for (const e of events) {
    const elapsed = ((e.ts - startTs) / 1000).toFixed(2);
    const phaseColorVal = phaseColor[e.phase] ?? '#94a3b8';
    lis.push(`
      <li class="row" data-kind="${e.kind}" data-phase="${e.phase}">
        <span class="t">+${elapsed}s</span>
        <span class="phase" style="background:${phaseColorVal}1a;border-color:${phaseColorVal}66;color:${phaseColorVal}">${e.phase}</span>
        <span class="step">${escape(e.step)}</span>
        <span class="kind kind-${e.kind}">${e.kind}</span>
        <span class="payload">${renderPayload(e, runDir)}</span>
      </li>
    `);
  }

  const phaseSummary = (summary?.phases ?? [])
    .map(
      (p) =>
        `<div class="ph"><b>${p.phase}</b> · ${p.status} · ${(p.durationMs / 1000).toFixed(1)}s${
          p.error ? ` · <span class="err">${escape(p.error)}</span>` : ''
        }</div>`,
    )
    .join('');

  const verifySummary = (summary?.verifyResults ?? [])
    .map(
      (v) =>
        `<div class="vr ${v.exists ? 'ok' : 'no'}"><b>${v.resourceKind}</b>: ${
          v.exists ? 'exists' : 'missing'
        }${v.error ? ` <span class="err">${escape(v.error)}</span>` : ''}</div>`,
    )
    .join('');

  // Aggregate every deploy_log_tail into a single copyable block. Each
  // event is one log line (per-div in the DOM), so we just join with \n.
  const deployLogText = events
    .filter((e) => e.kind === 'deploy_log_tail')
    .map((e, i) => `${String(i + 1).padStart(3, ' ')}  ${(e as { text: string }).text}`)
    .join('\n');

  const deployLogBlock = deployLogText
    ? `
<section class="deploy-log-section">
  <div class="deploy-log-header">
    <h2>Deploy log <span class="hint">(select all + copy)</span></h2>
    <button class="copy-btn" onclick="copyDeployLog()">Copy</button>
  </div>
  <pre id="deploy-log-text" class="deploy-log">${escape(deployLogText)}</pre>
</section>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.4 ui-sans-serif, -apple-system, "Inter", sans-serif; background: #0b0d12; color: #e2e8f0; }
  header { padding: 16px 20px; border-bottom: 1px solid #1f2937; display: flex; gap: 24px; align-items: baseline; flex-wrap: wrap; }
  header h1 { margin: 0; font-size: 16px; font-weight: 600; }
  header .status { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .status.pass { background: #064e3b; color: #6ee7b7; }
  .status.fail { background: #7f1d1d; color: #fca5a5; }
  .status.unknown { background: #334155; color: #cbd5e1; }
  .totals { color: #94a3b8; font-size: 12px; }
  main { display: grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 60px); }
  aside { padding: 16px 20px; border-right: 1px solid #1f2937; background: #0a0d12; }
  aside h2 { margin: 16px 0 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
  aside .ph, aside .vr { padding: 4px 0; font-size: 12px; color: #cbd5e1; }
  aside .err { color: #fca5a5; }
  aside .vr.ok b { color: #6ee7b7; }
  aside .vr.no b { color: #fca5a5; }
  .filter { padding: 12px 20px; border-bottom: 1px solid #1f2937; background: #0d1117; display: flex; gap: 8px; flex-wrap: wrap; }
  .filter button { background: #1f2937; color: #cbd5e1; border: 1px solid #334155; border-radius: 4px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
  .filter button.active { background: #334155; color: #f1f5f9; border-color: #64748b; }
  ul.timeline { list-style: none; margin: 0; padding: 0; }
  li.row { display: grid; grid-template-columns: 60px 80px 130px 110px 1fr; gap: 10px; padding: 4px 20px; border-bottom: 1px solid #111827; align-items: start; font-size: 12px; }
  li.row:hover { background: #0d1117; }
  .t { color: #64748b; font-family: ui-monospace, monospace; font-size: 11px; }
  .phase { padding: 1px 6px; border-radius: 3px; border: 1px solid; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; }
  .step { color: #94a3b8; font-family: ui-monospace, monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kind { padding: 1px 6px; border-radius: 3px; font-size: 10px; background: #1f2937; color: #cbd5e1; text-align: center; font-family: ui-monospace, monospace; }
  .kind-error_classified, .kind-api_error { background: #7f1d1d; color: #fca5a5; }
  .kind-recipe_attempt, .kind-recipe_result { background: #4c1d95; color: #ddd6fe; }
  .kind-screenshot { background: #052e16; color: #a7f3d0; }
  .kind-phase_start, .kind-phase_end { background: #1e3a8a; color: #bfdbfe; }
  .kind-gcloud_check, .kind-gcloud_result { background: #422006; color: #fcd34d; }
  .kind-deploy_log_tail { background: #064e3b; color: #6ee7b7; }
  .payload { color: #e2e8f0; font-family: ui-monospace, monospace; font-size: 11px; word-break: break-word; }
  .payload pre { margin: 0; white-space: pre-wrap; user-select: text; }
  .payload img { max-width: 480px; max-height: 280px; border: 1px solid #1f2937; border-radius: 4px; display: block; margin-top: 4px; }
  .payload .err { color: #fca5a5; }
  .payload details summary { cursor: pointer; color: #94a3b8; }
  .deploy-log-section { padding: 16px 20px; border-bottom: 1px solid #1f2937; background: #07090d; }
  .deploy-log-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .deploy-log-header h2 { margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
  .deploy-log-header .hint { color: #475569; font-weight: 400; text-transform: none; letter-spacing: 0; margin-left: 8px; }
  .copy-btn { background: #1f2937; color: #cbd5e1; border: 1px solid #334155; border-radius: 4px; padding: 4px 12px; font-size: 11px; cursor: pointer; }
  .copy-btn:hover { background: #334155; color: #f1f5f9; }
  .copy-btn.copied { background: #064e3b; color: #6ee7b7; border-color: #047857; }
  pre.deploy-log { margin: 0; padding: 12px; background: #050709; border: 1px solid #1f2937; border-radius: 4px; color: #a7f3d0; font: 11px/1.5 ui-monospace, monospace; white-space: pre-wrap; word-break: break-word; max-height: 360px; overflow: auto; user-select: text; }
</style>
</head>
<body>
<header>
  <h1>${escape(title)}</h1>
  <span class="status ${status}">${status}</span>
  ${totals ? `<span class="totals">${totals.events} events · ${totals.errors} errors · ${totals.recipeAttempts} recipe attempts · ${totals.screenshots} screenshots</span>` : ''}
</header>
<main>
  <aside>
    <h2>Phases</h2>
    ${phaseSummary || '<div class="ph">(no phases)</div>'}
    <h2>Verify</h2>
    ${verifySummary || '<div class="vr">(no verify results)</div>'}
    <h2>Artifacts</h2>
    <div class="ph"><a href="events.jsonl" style="color:#7dd3fc">events.jsonl</a></div>
    <div class="ph"><a href="summary.json" style="color:#7dd3fc">summary.json</a></div>
    <div class="ph"><a href="description.md" style="color:#7dd3fc">description.md</a></div>
  </aside>
  <section>
    ${deployLogBlock}
    <div class="filter" id="filter"></div>
    <ul class="timeline">
      ${lis.join('\n')}
    </ul>
  </section>
</main>
<script>
  function copyDeployLog() {
    const el = document.getElementById('deploy-log-text');
    if (!el) return;
    const text = el.textContent || '';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => flashCopy());
    } else {
      const r = document.createRange();
      r.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      try { document.execCommand('copy'); flashCopy(); } catch {}
    }
  }
  function flashCopy() {
    const btn = document.querySelector('.copy-btn');
    if (!btn) return;
    btn.classList.add('copied');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.classList.remove('copied'); btn.textContent = orig; }, 1500);
  }
  const kinds = [...new Set([...document.querySelectorAll('.row')].map(r => r.dataset.kind))];
  const filter = document.getElementById('filter');
  const all = document.createElement('button');
  all.textContent = 'all';
  all.classList.add('active');
  all.onclick = () => {
    document.querySelectorAll('.row').forEach(r => r.style.display = '');
    filter.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    all.classList.add('active');
  };
  filter.appendChild(all);
  for (const k of kinds) {
    const b = document.createElement('button');
    b.textContent = k;
    b.onclick = () => {
      document.querySelectorAll('.row').forEach(r => {
        r.style.display = r.dataset.kind === k ? '' : 'none';
      });
      filter.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
    filter.appendChild(b);
  }
</script>
</body>
</html>`;
}

function escape(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPayload(e: LogEvent, runDir: string): string {
  switch (e.kind) {
    case 'phase_start':
      return `<b>start ${e.phase}</b>`;
    case 'phase_end':
      return `<b>end ${e.phase}</b> · ${e.status} · ${(e.durationMs / 1000).toFixed(1)}s${e.error ? ` <span class="err">${escape(e.error)}</span>` : ''}`;
    case 'ui_action':
      return `<b>${e.action}</b>${e.selector ? ` <code>${escape(e.selector)}</code>` : ''}${e.args ? ` <span style="color:#94a3b8">${escape(JSON.stringify(e.args))}</span>` : ''}`;
    case 'screenshot': {
      const rel = relative(runDir, e.path);
      return `${escape(e.reason || '')}<br><img src="${escape(rel)}" alt="screenshot" />`;
    }
    case 'api_call':
      return `<b>→</b> ${escape(e.target)}`;
    case 'api_response':
      return `<b>← ${e.status}</b> ${escape(e.target)}${e.durationMs ? ` <span style="color:#94a3b8">${e.durationMs}ms</span>` : ''}`;
    case 'api_error':
      return `<span class="err">← ${e.status ?? '?'}</span> ${escape(e.target)} <details><summary>detail</summary><pre>${escape(JSON.stringify(e.detail, null, 2))}</pre></details>`;
    case 'error_classified':
      return `<span class="err">${escape(e.classified.category)}</span> · ${escape(e.classified.message?.slice(0, 200))} <details><summary>suggestion</summary><pre>${escape(e.classified.suggestion || '')}</pre></details>`;
    case 'recipe_attempt':
      return `<b>${escape(e.recipe)}</b> attempt ${e.attempt} (${escape(e.category)})`;
    case 'recipe_result':
      return `<b>${escape(e.recipe)}</b> attempt ${e.attempt} → <b>${escape(e.status)}</b><br>${e.notes.map((n) => `<div style="color:#94a3b8">${escape(n)}</div>`).join('')}`;
    case 'gcloud_check':
      return `<b>${escape(e.resourceKind)}</b> ${escape(JSON.stringify(e.params))}`;
    case 'gcloud_result':
      return e.exists
        ? `<b style="color:#6ee7b7">${escape(e.resourceKind)} exists</b>`
        : `<span class="err">${escape(e.resourceKind)} missing</span>${e.error ? ` <span class="err">${escape(e.error)}</span>` : ''}`;
    case 'note':
      return `<span style="color:${e.level === 'error' ? '#fca5a5' : e.level === 'warn' ? '#fcd34d' : '#cbd5e1'}">${escape(e.message)}</span>`;
    case 'wait_for_human':
      return `<b>⏸ ${escape(e.reason)}</b>${e.resumeUrl ? ` <a href="${escape(e.resumeUrl)}" target="_blank" style="color:#7dd3fc">resume</a>` : ''}`;
    case 'deploy_log_tail':
      return `<pre>${escape(e.text)}</pre>`;
    default:
      return `<pre>${escape(JSON.stringify(e, null, 2))}</pre>`;
  }
}

// CLI: `npx tsx html-report.ts <runDir>` regenerates a report.
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: html-report.ts <runDir>');
    process.exit(2);
  }
  const out = renderRunReport(dir);
  console.log(`wrote ${out}`);
}

// Re-render an entire runs/ tree into individual reports.
export function renderAllRuns(rootDir: string): string[] {
  const out: string[] = [];
  if (!existsSync(rootDir)) return out;
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(rootDir, entry.name);
    if (existsSync(join(dir, 'events.jsonl'))) {
      try {
        out.push(renderRunReport(dir));
      } catch (err) {
        console.error(`failed to render ${dir}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  return out;
}

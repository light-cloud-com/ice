/**
 * Tests for the tiny markdown renderer in concept-info.
 *
 * Pure function — no DOM, no React. Drive every supported syntax
 * (headings, lists, paragraphs, code blocks, inline code, bold,
 * italic, links) plus the HTML-escape contract.
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../markdown';

describe('renderMarkdown — empty / whitespace', () => {
  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('returns an empty string for blank-line-only input', () => {
    expect(renderMarkdown('\n\n\n')).toBe('');
  });
});

describe('headings', () => {
  it('renders # → h1', () => {
    const html = renderMarkdown('# Hello');
    expect(html).toContain('<h1');
    expect(html).toContain('Hello</h1>');
    expect(html).toContain('font-size:1.2em');
  });

  it('renders ## → h2 with the smaller size', () => {
    const html = renderMarkdown('## Subhead');
    expect(html).toContain('<h2');
    expect(html).toContain('font-size:1.05em');
  });

  it('renders ###### → h6 with the smallest size', () => {
    const html = renderMarkdown('###### Tiny');
    expect(html).toContain('<h6');
    expect(html).toContain('font-size:0.95em');
  });

  it('renders inline syntax inside heading text', () => {
    const html = renderMarkdown('# Hello **bold**');
    expect(html).toContain('<strong>bold</strong>');
  });
});

describe('lists', () => {
  it('groups consecutive `-` items into a single <ul>', () => {
    const html = renderMarkdown('- one\n- two');
    const ulCount = (html.match(/<ul/g) || []).length;
    expect(ulCount).toBe(1);
    expect(html).toContain('<li');
    expect(html.match(/<li/g)?.length).toBe(2);
  });

  it('also accepts `*` bullets', () => {
    const html = renderMarkdown('* a\n* b');
    expect(html).toContain('<ul');
    expect(html.match(/<li/g)?.length).toBe(2);
  });

  it('closes the list on a blank line', () => {
    const html = renderMarkdown('- a\n- b\n\nfollow paragraph');
    expect(html).toMatch(/<\/ul>/);
    expect(html).toMatch(/<p[^>]*>follow paragraph<\/p>/);
  });

  it('closes the list when a heading follows', () => {
    const html = renderMarkdown('- a\n# Heading');
    const ulClose = html.indexOf('</ul>');
    const h1Open = html.indexOf('<h1');
    expect(ulClose).toBeGreaterThan(-1);
    expect(h1Open).toBeGreaterThan(ulClose);
  });

  it('renders inline syntax inside list items', () => {
    const html = renderMarkdown('- `code`');
    expect(html).toContain('<code');
  });
});

describe('code blocks', () => {
  it('wraps fenced ``` in a <pre><code>', () => {
    const html = renderMarkdown('```\nconst x = 1;\n```');
    expect(html).toContain('<pre');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
  });

  it('escapes HTML inside code blocks', () => {
    const html = renderMarkdown('```\n<script>alert(1)</script>\n```');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  it('preserves multi-line content', () => {
    const html = renderMarkdown('```\nline 1\nline 2\nline 3\n```');
    expect(html).toContain('line 1\nline 2\nline 3');
  });

  it('closes an active list before opening a code block', () => {
    const html = renderMarkdown('- a\n- b\n```\ncode\n```');
    const ulClose = html.indexOf('</ul>');
    const preOpen = html.indexOf('<pre');
    expect(ulClose).toBeGreaterThan(-1);
    expect(preOpen).toBeGreaterThan(ulClose);
  });
});

describe('paragraphs', () => {
  it('wraps text in <p>', () => {
    const html = renderMarkdown('Just some text.');
    expect(html).toMatch(/<p[^>]*>Just some text\.<\/p>/);
  });

  it('joins continuation lines with a space', () => {
    const html = renderMarkdown('line one\nline two');
    expect(html).toContain('line one line two');
  });

  it('starts a new paragraph after a blank line', () => {
    const html = renderMarkdown('para one\n\npara two');
    const pCount = (html.match(/<p/g) || []).length;
    expect(pCount).toBe(2);
  });
});

describe('inline syntax', () => {
  it('renders `code` to <code>', () => {
    const html = renderMarkdown('See `foo()` for details.');
    expect(html).toContain('<code');
    expect(html).toContain('foo()');
  });

  it('renders **bold**', () => {
    const html = renderMarkdown('Be **strong**.');
    expect(html).toContain('<strong>strong</strong>');
  });

  it('renders *italic*', () => {
    const html = renderMarkdown('Make it *fancy*.');
    expect(html).toContain('<em>fancy</em>');
  });

  it('renders [text](url) links with target=_blank', () => {
    const html = renderMarkdown('See [docs](https://example.com).');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('>docs</a>');
  });
});

describe('html escape', () => {
  it('escapes &, <, >, and " in raw text', () => {
    const html = renderMarkdown('Tom & Jerry: 1 < 2 > 0 "quoted"');
    expect(html).toContain('Tom &amp; Jerry');
    expect(html).toContain('1 &lt; 2 &gt; 0');
    expect(html).toContain('&quot;quoted&quot;');
  });
});

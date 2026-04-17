/**
 * Tiny markdown renderer for concept info overview tabs.
 *
 * Intentionally minimal — handles headings, paragraphs, inline code,
 * bold, italics, links, lists, and code blocks. No nesting, no tables,
 * no images. Enough for short concept docs, and avoids pulling in a
 * full markdown parser dep for 26 concept overviews.
 *
 * Output is a plain HTML string safe to pass into dangerouslySetInnerHTML.
 * It does NOT sanitize input — but input comes from trusted source files
 * in our own repo, not user-generated content.
 */

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const renderInline = (text: string): string => {
  let out = escapeHtml(text);
  // Inline code: `foo`
  out = out.replace(/`([^`]+)`/g, '<code style="background:var(--ice-bg-raised);padding:1px 4px;border-radius:3px;font-family:ui-monospace,monospace;font-size:0.9em;">$1</code>');
  // Bold: **foo**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic: *foo*
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Links: [text](url)
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--ice-text-primary);text-decoration:underline;">$1</a>',
  );
  return out;
};

export function renderMarkdown(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;
  let inList = false;
  let inCodeBlock = false;
  let codeBuf: string[] = [];

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        out.push(
          `<pre style="background:var(--ice-bg-raised);border:1px solid var(--ice-border);padding:10px;border-radius:4px;overflow:auto;margin:8px 0;"><code style="font-family:ui-monospace,monospace;font-size:0.9em;">${escapeHtml(codeBuf.join('\n'))}</code></pre>`,
        );
        codeBuf = [];
        inCodeBlock = false;
      } else {
        closeList();
        inCodeBlock = true;
      }
      i++;
      continue;
    }
    if (inCodeBlock) {
      codeBuf.push(line);
      i++;
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = h[1].length;
      const text = renderInline(h[2]);
      const fontSize = level === 1 ? '1.2em' : level === 2 ? '1.05em' : '0.95em';
      const marginTop = level === 1 ? '0' : '1em';
      out.push(
        `<h${level} style="color:var(--ice-text-primary);font-size:${fontSize};font-weight:600;margin:${marginTop} 0 0.4em 0;">${text}</h${level}>`,
      );
      i++;
      continue;
    }

    // List
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul style="list-style:disc;padding-left:1.4em;margin:0.4em 0;">');
        inList = true;
      }
      const item = line.replace(/^\s*[-*]\s+/, '');
      out.push(`<li style="margin:0.2em 0;">${renderInline(item)}</li>`);
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      closeList();
      i++;
      continue;
    }

    // Paragraph — collect continuous non-empty, non-list, non-heading lines
    closeList();
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6})\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !lines[i].startsWith('```')) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(`<p style="margin:0.5em 0;">${renderInline(paraLines.join(' '))}</p>`);
  }

  closeList();
  return out.join('\n');
}

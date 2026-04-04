/**
 * notion/rich-text.ts — Markdown → Notion rich_text block converters
 *
 * Converts a subset of Markdown used in relay event content:
 *   **bold**  →  bold annotation
 *   `code`    →  code annotation
 *   ## / ###  →  heading_2 / heading_3 blocks
 *   - / *     →  bulleted_list_item blocks
 *   plain     →  paragraph blocks
 */

export type NotionRichTextSegment = {
  type: 'text';
  text: { content: string };
  annotations?: { bold?: boolean; code?: boolean };
};

export type NotionBlock = {
  object: 'block';
  type: string;
  [key: string]: unknown;
};

/** Simple rich_text array from a plain string. */
export function richText(str: string | null | undefined): NotionRichTextSegment[] {
  return str ? [{ type: 'text', text: { content: String(str) } }] : [];
}

/** Strip Markdown formatting to plain text (for preview fields). */
export function stripMarkdown(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^#{1,3}\s*/gm, '');
}

/**
 * Parse one line of Markdown into Notion rich_text segments.
 * Handles **bold** and `code` inline annotations.
 * Enforces the 2000-char Notion limit per segment.
 */
export function parseMarkdownToRichText(line: string): NotionRichTextSegment[] {
  const segments: NotionRichTextSegment[] = [];
  const re = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(line)) !== null) {
    if (m.index > lastIndex) {
      const plain = line.slice(lastIndex, m.index);
      if (plain) segments.push({ type: 'text', text: { content: plain } });
    }
    if (m[2] !== undefined) {
      segments.push({ type: 'text', text: { content: m[2] }, annotations: { bold: true } });
    } else if (m[3] !== undefined) {
      segments.push({ type: 'text', text: { content: m[3] }, annotations: { code: true } });
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < line.length) {
    segments.push({ type: 'text', text: { content: line.slice(lastIndex) } });
  }

  // Enforce 2000-char Notion limit per segment
  const result: NotionRichTextSegment[] = [];
  for (const seg of segments) {
    const txt = seg.text.content;
    if (txt.length <= 2_000) {
      result.push(seg);
    } else {
      for (let i = 0; i < txt.length; i += 2_000) {
        result.push({ ...seg, text: { content: txt.slice(i, i + 2_000) } });
      }
    }
  }

  return result.length ? result : [{ type: 'text', text: { content: '' } }];
}

/**
 * Convert a multi-line Markdown string into an array of Notion blocks.
 * Handles headings, bullets, and paragraphs.
 */
export function parseContentToBlocks(content: string | null | undefined): NotionBlock[] {
  if (!content) return [];
  const blocks: NotionBlock[] = [];

  for (const raw of content.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    let type: string;
    let textContent: string;

    if (line.startsWith('### ')) {
      type = 'heading_3';
      textContent = line.slice(4);
    } else if (line.startsWith('## ')) {
      type = 'heading_2';
      textContent = line.slice(3);
    } else if (/^[-*] /.test(line.trimStart())) {
      type = 'bulleted_list_item';
      textContent = line.trimStart().slice(2);
    } else {
      type = 'paragraph';
      textContent = line;
    }

    blocks.push({
      object: 'block',
      type,
      [type]: { rich_text: parseMarkdownToRichText(textContent) },
    });
  }

  return blocks;
}

/** Format UTC timestamp as DD/MM/YYYY H:MMam/pm */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  const dd   = String(d.getUTCDate()).padStart(2, '0');
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  let h      = d.getUTCHours();
  const min  = String(d.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${dd}/${mm}/${yyyy} ${h}:${min}${ampm}`;
}

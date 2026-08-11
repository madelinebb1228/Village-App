export interface LinkableTerm {
  id: string;
  term: string;
  aliases?: string[];
}

export interface TextSegment {
  text: string;
  termId?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTermRegex(term: string): RegExp {
  const escaped = escapeRegExp(term);
  const leading = /\w/.test(term[0]) ? '\\b' : '';
  const trailing = /\w/.test(term[term.length - 1]) ? '\\b' : '';
  return new RegExp(`${leading}${escaped}${trailing}`, 'i');
}

// Splits a paragraph into plain-text and linkable-term segments, matching
// against known glossary terms. Longer/more specific terms win over shorter
// overlapping ones. `usedTermIds` is shared across a whole article so each
// term links only on its first mention rather than every repeat.
export function linkifyParagraph(
  text: string,
  terms: LinkableTerm[],
  usedTermIds: Set<string>
): TextSegment[] {
  type Match = { start: number; end: number; termId: string };
  const candidates: Match[] = [];

  for (const t of terms) {
    if (usedTermIds.has(t.id)) continue;
    // Try the display term first, then any aliases, keeping whichever
    // produces the longest (most specific) match for this term.
    let best: { start: number; end: number } | null = null;
    for (const phrase of [t.term, ...(t.aliases ?? [])]) {
      const match = buildTermRegex(phrase).exec(text);
      if (match) {
        const end = match.index + match[0].length;
        if (!best || end - match.index > best.end - best.start) {
          best = { start: match.index, end };
        }
      }
    }
    if (best) candidates.push({ start: best.start, end: best.end, termId: t.id });
  }

  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const chosen: Match[] = [];
  for (const c of candidates) {
    const overlaps = chosen.some(ch => c.start < ch.end && c.end > ch.start);
    if (!overlaps) chosen.push(c);
  }
  chosen.sort((a, b) => a.start - b.start);

  if (chosen.length === 0) return [{ text }];

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const c of chosen) {
    if (c.start > cursor) segments.push({ text: text.slice(cursor, c.start) });
    segments.push({ text: text.slice(c.start, c.end), termId: c.termId });
    usedTermIds.add(c.termId);
    cursor = c.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

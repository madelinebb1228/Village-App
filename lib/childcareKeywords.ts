// Best-effort, non-blocking signal used only to re-surface the permanent
// Patch Request safety guidance (see components/PatchRequestSafetyNotice.tsx)
// at the moment it's most relevant. This is deliberately NOT a moderation
// system: it never blocks submission, never flags/reports anything, and a
// miss carries no safety gap since the same guidance is already shown
// unconditionally on the same screen. Keyword matching is inherently
// imperfect — do not extend this into anything that gates or scores content.
const CHILDCARE_KEYWORDS = [
  'babysit', 'babysitter', 'babysitting', 'nanny', 'sitter',
  'watch my kid', 'watch my kids', 'watch my son', 'watch my daughter', 'watch my child', 'watch my children',
  'look after my kid', 'look after my child', 'look after my son', 'look after my daughter',
  'pick up my kid', 'pick up my son', 'pick up my daughter', 'pick up my child',
  'drop off my kid', 'drop off my son', 'drop off my daughter',
  'daycare pickup', 'daycare drop off', 'after school pickup',
];

export function mentionsChildcare(text: string): boolean {
  const t = text.toLowerCase();
  return CHILDCARE_KEYWORDS.some(k => t.includes(k));
}

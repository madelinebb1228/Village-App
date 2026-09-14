// Shared text-role tokens — size and weight only. Colors stay in theme.ts
// tokens (c.textPrimary, c.textMuted, etc.) since those already vary by
// theme; a screen combines the two, e.g. `{ ...typography.postAuthor,
// color: c.textPrimary }`. This is intentionally a small, flat set covering
// the roles that repeat across screens with visible drift (Phase 5 audit),
// not a full design-system rewrite.

export const typography = {
  screenTitle:      { fontSize: 24, fontWeight: '800' as const },
  sectionTitle:     { fontSize: 18, fontWeight: '800' as const },
  postAuthor:       { fontSize: 14, fontWeight: '700' as const },
  postMeta:         { fontSize: 12, fontWeight: '400' as const },
  body:             { fontSize: 15, fontWeight: '400' as const },
  secondary:        { fontSize: 13, fontWeight: '500' as const },
  buttonLabel:      { fontSize: 15, fontWeight: '700' as const },
  tabLabel:         { fontSize: 13, fontWeight: '700' as const },
  badge:            { fontSize: 11, fontWeight: '700' as const },
  emptyStateTitle:  { fontSize: 16, fontWeight: '700' as const },
  emptyStateBody:   { fontSize: 14, fontWeight: '500' as const },
};

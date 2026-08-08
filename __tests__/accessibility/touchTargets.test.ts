import fs from 'fs';
import path from 'path';

/**
 * Lightweight regression guard, not exhaustive static analysis: checks that the
 * specific sub-44px touch targets identified in the accessibility audit still
 * pair a `hitSlopFor(` call with their TouchableOpacity. It only catches
 * regressions on these known spots — it does not scan the file for new
 * small touch targets someone might add later.
 */
describe('Track.tsx touch target hitSlop guard', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../screens/Track.tsx'), 'utf8');

  const knownSmallTargets = [
    'cp.circle',
    'st.btn',
    'categoryArrowBtn',
    'dateNavBtn',
    'cal.headerBtn',
    'cal.cell',
  ];

  it.each(knownSmallTargets)('%s usages are paired with hitSlopFor(', (styleName) => {
    // Find each JSX block that references this style name, then check a
    // hitSlopFor( call appears within a reasonable window around it.
    const escaped = styleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const styleRefPattern = new RegExp(`style=\\{[^}]*\\b${escaped}\\b`, 'g');
    const matches = [...source.matchAll(styleRefPattern)];
    expect(matches.length).toBeGreaterThan(0);

    // Only interactive (TouchableOpacity-wrapped) usages need a hitSlop — a
    // plain decorative <View> reusing the same style (e.g. calendar filler
    // cells) legitimately has none, so skip those.
    let interactiveUsages = 0;
    for (const match of matches) {
      const idx = match.index ?? 0;
      const windowStart = Math.max(0, idx - 400);
      const windowEnd = Math.min(source.length, idx + 400);
      const window = source.slice(windowStart, windowEnd);
      if (!window.includes('TouchableOpacity')) continue;
      interactiveUsages++;
      expect(window).toContain('hitSlopFor(');
    }
    expect(interactiveUsages).toBeGreaterThan(0);
  });
});

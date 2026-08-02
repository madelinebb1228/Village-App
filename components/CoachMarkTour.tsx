import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Colors } from '../lib/theme';

export type CoachMarkStep = {
  ref: React.RefObject<any>;
  title: string;
  body: string;
};

type Rect = { x: number; y: number; width: number; height: number };

// A guided "spotlight" tour: dims the whole screen except a highlighted target,
// with a tooltip + arrow pointing at it. Steps advance one at a time; any step
// whose target isn't currently mounted (e.g. a conditional card) is skipped.
//
// Coordinates: `measureInWindow` returns positions in absolute browser-viewport
// space. On web this screen is offset by a fixed-width sidebar (see App.tsx's
// `sidebarAware`), so "absolute viewport space" isn't the same as "this overlay's
// own local space" — and `useWindowDimensions()` isn't reliably in the same space
// either. To keep everything consistent we measure our own full-screen container
// via the same `measureInWindow` call and do all math relative to *that*, rather
// than trusting window-dimensions.
export default function CoachMarkTour({
  steps,
  visible,
  onDismiss,
  c,
  scrollRef,
  scrollOffsetRef,
}: {
  steps: CoachMarkStep[];
  visible: boolean;
  onDismiss: () => void;
  c: Colors;
  // Optional: the screen's scrolling container. When set, each step scrolls its
  // target into view before measuring it, so targets below the fold aren't
  // highlighted invisibly off-screen.
  scrollRef?: React.RefObject<any>;
  // Current scroll offset of `scrollRef`'s content, kept live by the caller's onScroll
  // handler. Used to compute an absolute scroll target without relying on
  // `measureLayout`, which isn't reliable against a ScrollView ref under react-native-web.
  scrollOffsetRef?: React.RefObject<number>;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const containerRef = useRef<View>(null);
  const [index, setIndex] = useState(0);
  const [containerRect, setContainerRect] = useState<Rect | null>(null);
  const [target, setTarget] = useState<Rect | null>(null);

  const liveSteps = useMemo(() => steps.filter(s => !!s.ref.current), [steps, visible]);

  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  useEffect(() => {
    if (!visible) { setContainerRect(null); return; }
    const measure = () => {
      containerRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
        setContainerRect({ x, y, width, height });
      });
    };
    measure();
    const t = setTimeout(measure, 50); // catch late layout on first mount
    return () => clearTimeout(t);
  }, [visible, winW, winH]);

  useEffect(() => {
    if (!visible) { setTarget(null); return; }
    const node = liveSteps[index]?.ref.current;
    if (!node?.measureInWindow || !containerRect) { setTarget(null); return; }

    const TOP_PAD = 90;
    const BOTTOM_PAD = 24;

    node.measureInWindow((x: number, y: number, width: number, height: number) => {
      const visibleTop = containerRect.y + TOP_PAD;
      const visibleBottom = containerRect.y + containerRect.height - BOTTOM_PAD;
      const offTop = y < visibleTop;
      const offBottom = y + height > visibleBottom;

      if ((offTop || offBottom) && scrollRef?.current?.scrollTo) {
        const delta = offTop ? y - visibleTop : (y + height) - visibleBottom;
        const nextY = Math.max(0, (scrollOffsetRef?.current ?? 0) + delta);
        scrollRef.current.scrollTo({ y: nextY, animated: true });
        setTimeout(() => {
          node.measureInWindow((x2: number, y2: number, width2: number, height2: number) => {
            setTarget({ x: x2, y: y2, width: width2, height: height2 });
          });
        }, 260); // let the scroll settle before measuring for the overlay
      } else {
        setTarget({ x, y, width, height });
      }
    });
  }, [visible, index, liveSteps, winW, winH, containerRect, scrollRef, scrollOffsetRef]);

  if (!visible || liveSteps.length === 0) return null;

  // Mounted but not yet measured — render just the (invisible) container so its ref resolves.
  if (!target || !containerRect) {
    return <View ref={containerRef} style={StyleSheet.absoluteFillObject} pointerEvents="none" />;
  }

  const step = liveSteps[index];
  const isLast = index === liveSteps.length - 1;

  const cw = containerRect.width;
  const ch = containerRect.height;
  const rawX = target.x - containerRect.x;
  const rawY = target.y - containerRect.y;

  const PAD = 8;
  const tx = Math.max(0, rawX - PAD);
  const ty = Math.max(0, rawY - PAD);
  const tw = Math.min(cw - tx, target.width + PAD * 2);
  const th = target.height + PAD * 2;

  const TOOLTIP_WIDTH = Math.min(320, cw - 32);
  const spaceBelow = ch - (ty + th);
  const placeBelow = spaceBelow > 170 || spaceBelow > ty;

  let tooltipLeft = tx + tw / 2 - TOOLTIP_WIDTH / 2;
  tooltipLeft = Math.max(16, Math.min(tooltipLeft, cw - TOOLTIP_WIDTH - 16));
  const arrowLeft = Math.max(16, Math.min(tx + tw / 2 - tooltipLeft - 8, TOOLTIP_WIDTH - 32));

  function next() {
    if (isLast) onDismiss();
    else setIndex(i => i + 1);
  }

  return (
    <View ref={containerRef} style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Dimmed surround (top / bottom / left / right of the highlighted target) */}
      <View pointerEvents="auto" style={[s.dim, { top: 0, left: 0, width: cw, height: ty }]} />
      <View pointerEvents="auto" style={[s.dim, { top: ty + th, left: 0, width: cw, height: Math.max(0, ch - (ty + th)) }]} />
      <View pointerEvents="auto" style={[s.dim, { top: ty, left: 0, width: tx, height: th }]} />
      <View pointerEvents="auto" style={[s.dim, { top: ty, left: tx + tw, width: Math.max(0, cw - (tx + tw)), height: th }]} />
      {/* Transparent blocker over the target itself, so it can't be tapped mid-tour */}
      <View pointerEvents="auto" style={{ position: 'absolute', top: ty, left: tx, width: tw, height: th }} />

      {/* Highlight ring */}
      <View pointerEvents="none" style={[s.ring, { top: ty, left: tx, width: tw, height: th, borderColor: c.primary }]} />

      {/* Tooltip */}
      <View
        pointerEvents="auto"
        style={[
          s.tooltip,
          {
            backgroundColor: c.card,
            width: TOOLTIP_WIDTH,
            left: tooltipLeft,
            top: placeBelow ? ty + th + 14 : undefined,
            bottom: placeBelow ? undefined : ch - ty + 14,
          },
        ]}
      >
        <View
          pointerEvents="none"
          style={[s.arrow, placeBelow ? s.arrowUp : s.arrowDown, { left: arrowLeft, backgroundColor: c.card }]}
        />
        <Text style={[s.stepCount, { color: c.textMuted }]}>{index + 1} of {liveSteps.length}</Text>
        <Text style={[s.title, { color: c.textPrimary }]}>{step.title}</Text>
        <Text style={[s.body, { color: c.textMuted }]}>{step.body}</Text>
        <View style={s.footer}>
          <TouchableOpacity onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Skip tour">
            <Text style={[s.skip, { color: c.textMuted }]}>Skip tour</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={next}
            style={[s.nextBtn, { backgroundColor: c.primary }]}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Finish tour' : 'Next tip'}
          >
            <Text style={s.nextBtnText}>{isLast ? 'Got it!' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(20,16,30,0.68)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: 16,
  },
  tooltip: {
    position: 'absolute',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  arrow: {
    position: 'absolute',
    width: 16,
    height: 16,
    transform: [{ rotate: '45deg' }],
  },
  arrowUp: { top: -8 },
  arrowDown: { bottom: -8 },
  stepCount: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skip: {
    fontSize: 14,
    fontWeight: '600',
  },
  nextBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

import React from 'react';
import { Image, View } from 'react-native';
import { CardBounds } from '../lib/usePatchyCards';

export type PeekDir = 'right' | 'left' | 'bottom' | 'top';

const PEEKS: Record<PeekDir, { src: ReturnType<typeof require>; w: number; h: number }> = {
  right:  { src: require('../assets/patchy/peek-right.png'),  w: 82,  h: 95  },
  left:   { src: require('../assets/patchy/peek-left.png'),   w: 80,  h: 95  },
  bottom: { src: require('../assets/patchy/peek-top.png'),    w: 90,  h: 83  },
  top:    { src: require('../assets/patchy/peek-bottom.png'), w: 110, h: 79  },
};

function edgePos(card: CardBounds, dir: PeekDir) {
  const cfg = PEEKS[dir];
  const cw  = card.right - card.left;
  switch (dir) {
    case 'right':
      return { top: card.top + 8,  left: card.right - Math.round(cfg.w * 0.28) };
    case 'left':
      return { top: card.top + 8,  left: card.left  - Math.round(cfg.w * 0.72) };
    case 'bottom':
      return {
        top:  card.bottom - Math.round(cfg.h * 0.35),
        left: card.left   + Math.round((cw - cfg.w) / 2),
      };
    case 'top':
      return {
        top:  card.top - Math.round(cfg.h * 0.7),
        left: card.right - cfg.w - 14,
      };
  }
}

interface Props {
  cards: CardBounds[];
  dir: PeekDir;
  cardIndex?: number;
  offsetX?: number;
  offsetY?: number;
}

export default function PatchyPeek({ cards, dir, cardIndex = 0, offsetX = 0, offsetY = 0 }: Props) {
  if (cards.length === 0 || cardIndex >= cards.length) return null;

  const card = cards[cardIndex];
  const cfg  = PEEKS[dir];
  const pos  = edgePos(card, dir);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: pos.top + offsetY,
        left: pos.left + offsetX,
        width: cfg.w,
        height: cfg.h,
        zIndex: 999,
        elevation: 10,
        backgroundColor: 'transparent',
      }}
    >
      <Image
        source={cfg.src}
        style={{ width: cfg.w, height: cfg.h, backgroundColor: 'transparent' }}
        resizeMode="contain"
      />
    </View>
  );
}

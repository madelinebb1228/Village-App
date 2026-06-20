import { useCallback, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

export interface CardBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function usePatchyCards() {
  const [cards, setCards] = useState<CardBounds[]>([]);

  // No-op — kept for call-site compatibility.
  const onContainerLayout = useCallback((_e: LayoutChangeEvent) => {}, []);

  // Measures a child card's position relative to its parent.
  // Use when PatchyPeek is a sibling of the cards inside the same parent View.
  // Replaces any existing card at approximately the same position so re-layouts
  // (triggered as async content loads above) keep Patchy tracking the card.
  const onCardLayout = useCallback((e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    if (width < 60 || height < 40) return;
    setCards(prev => {
      const others = prev.filter(b => !(Math.abs(b.left - x) < 40 && Math.abs(b.top - y) < 40));
      return [...others, { top: y, bottom: y + height, left: x, right: x + width }].slice(0, 5);
    });
  }, []);

  // Measures the container's OWN size as a single card bound { 0, 0, w, h }.
  // Use when PatchyPeek lives INSIDE the container and should grip its outer edge.
  const onSelfLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width < 60 || height < 40) return;
    setCards([{ top: 0, bottom: height, left: 0, right: width }]);
  }, []);

  return { cards, onContainerLayout, onCardLayout, onSelfLayout };
}

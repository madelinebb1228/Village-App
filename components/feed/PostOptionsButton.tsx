import React, { useRef, useState } from 'react';
import { TouchableOpacity, View, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';
import { hitSlopFor } from '../../lib/accessibility';
import PostActionsMenu, { PostActionItem } from './PostActionsMenu';

interface Props {
  actions: PostActionItem[];
  size?: number;
}

// Self-contained "Post options" overflow trigger + popover, mirroring
// PostTypeBadge/PostTypeInfoPopover's anchored-card (desktop) /
// bottom-sheet (phone/tablet) pattern — a single subtle ellipsis replacing
// permanently-visible per-action icon buttons (e.g. pin/delete) on a post
// the current user owns.
export default function PostOptionsButton({ actions, size = 18 }: Props) {
  const c = useColors();
  const { isDesktop } = useResponsive();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const btnRef = useRef<View>(null);

  const openMenu = (e?: GestureResponderEvent) => {
    e?.stopPropagation?.();
    if (isDesktop && btnRef.current) {
      (btnRef.current as any).measureInWindow?.((x: number, y: number, width: number, height: number) => {
        setAnchor({ x, y, width, height });
        setOpen(true);
      });
    } else {
      setAnchor(null);
      setOpen(true);
    }
  };

  return (
    <>
      <TouchableOpacity
        ref={btnRef}
        onPress={openMenu}
        activeOpacity={0.6}
        hitSlop={hitSlopFor(size)}
        style={{ padding: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Post options"
      >
        <Ionicons name="ellipsis-horizontal" size={size} color={c.textMuted} />
      </TouchableOpacity>
      <PostActionsMenu
        visible={open}
        anchor={isDesktop ? anchor : null}
        actions={actions}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

import React, { useContext } from 'react';
import { View } from 'react-native';
import { AppContext } from '../lib/AppContext';
import { useColors } from '../lib/theme';
import { useResponsive, SIDEBAR_WIDTH } from '../lib/responsive';
import SearchSheet from '../screens/SearchSheet';
import MessagesInbox from '../screens/MessagesInbox';
import NotificationsScreen from '../screens/NotificationsScreen';
import PublicProfileSheet from '../screens/PublicProfileSheet';
import PatchTasksSheet from '../screens/PatchTasksSheet';
import VillageFeedSheet from '../screens/VillageFeedSheet';
import { villagesByIds } from '../lib/villageData';

// Renders the top of the desktop secondary-destination stack (see
// lib/AppContext.ts) INSIDE the app shell — beside the persistent sidebar,
// never covering it — instead of the full-screen Modal each of these screens
// still uses on mobile (`presentation="modal"`, the default). Only one host
// exists app-wide; no screen renders its own copy of the sidebar.
export default function DesktopSecondaryHost({ navigationRef }: { navigationRef: any }) {
  const c = useColors();
  const { isDesktop } = useResponsive();
  const { secondaryStack, pushSecondary, popSecondary, closeAllSecondary } = useContext(AppContext);

  if (!isDesktop || secondaryStack.length === 0) return null;

  const top = secondaryStack[secondaryStack.length - 1];

  function goToPost(postId: string) {
    closeAllSecondary();
    navigationRef?.navigate?.('PostDetail', { postId, origin: 'Home' });
  }

  return (
    <View
      style={{
        position: 'fixed' as any,
        left: SIDEBAR_WIDTH,
        top: 0,
        right: 0,
        bottom: 0,
        backgroundColor: c.bg,
        zIndex: 90,
      }}
    >
      {top.type === 'search' && (
        <SearchSheet presentation="inline" visible onClose={popSecondary} />
      )}
      {top.type === 'messages' && (
        <MessagesInbox presentation="inline" onBack={popSecondary} openWithUserId={top.openWithUserId} />
      )}
      {top.type === 'notifications' && (
        <NotificationsScreen
          presentation="inline"
          onBack={popSecondary}
          onOpenPost={(postId) => goToPost(postId)}
          onOpenProfile={(userId) => pushSecondary({ type: 'profile', userId })}
        />
      )}
      {top.type === 'profile' && (
        <PublicProfileSheet
          presentation="inline"
          userId={top.userId}
          visible
          onClose={popSecondary}
          dismissParents={closeAllSecondary}
          onMessage={(userId) => {
            popSecondary();
            pushSecondary({ type: 'messages', openWithUserId: userId });
          }}
        />
      )}
      {top.type === 'patchRequests' && (
        <PatchTasksSheet presentation="inline" visible onClose={popSecondary} />
      )}
      {top.type === 'villageFeed' && (
        <VillageFeedSheet presentation="inline" village={villagesByIds([top.villageId])[0] ?? null} visible onClose={popSecondary} />
      )}
    </View>
  );
}

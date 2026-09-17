import './lib/carCheckTask'; // registers the background task at module scope — required by TaskManager
import './lib/alertPolyfill'; // patches Alert.alert on web, where it's otherwise a no-op
import { registerNotificationCategories, registerNotificationResponseListener } from './lib/notificationActions';

import * as WebBrowser from 'expo-web-browser';
// On web, an OAuth popup (e.g. Google Calendar connect) redirects back to this
// same app's own URL. This call, made unconditionally at module scope so it
// runs on every load including inside that popup, is what detects "I'm the
// redirect landing page" and hands the result back to the opener window
// instead of just booting a second copy of the app in place.
WebBrowser.maybeCompleteAuthSession();

import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'TODO_MADELINE_ADD_YOUR_SENTRY_DSN_HERE',
  debug: __DEV__,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 1.0,
  attachScreenshot: true,
});

import { PostHogProvider } from 'posthog-react-native';

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Image, Modal } from 'react-native';
import { useColors } from './lib/theme';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { SyncProvider } from './lib/syncService';
import OfflineBanner from './components/OfflineBanner';
import { OneHandedProvider, useOneHanded } from './lib/OneHandedContext';
import { MAX_FONT_SCALE } from './lib/accessibility';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BottomTabBar, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './lib/supabase';
import { posthog, identifyUser, setUserProperties, resetAnalytics, restoreAnalyticsOptOut } from './lib/analytics';
import { AppContext, CreateAction, SecondaryDestination } from './lib/AppContext';
import { useResponsive, SIDEBAR_WIDTH } from './lib/responsive';
import DesktopSecondaryHost from './components/DesktopSecondaryHost';
import { SubscriptionProvider } from './lib/subscriptionContext';
import { BabyProvider } from './lib/babyContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ErrorBoundary from './components/ErrorBoundary';
import CreateOptionsSheet, { CreateOption } from './components/CreateOptionsSheet';
import { restoreScrollFocus, installWebKeyboardScrollFallback, installFocusVisibleStyles } from './lib/webFocus';

import AuthScreen from './screens/Auth';
import OnboardingEntry from './screens/OnboardingEntry';
import HomeScreen from './screens/HomeTab';
import TrackScreen from './screens/Track';
import CalendarScreen from './screens/CalendarTab';
import DiscoverScreen from './screens/DiscoverTab';
import VillageScreen from './screens/VillageTab';
import ProfileScreen from './screens/Profile';
import EventsScreen from './screens/EventsScreen';
import PatchTasksSheet from './screens/PatchTasksSheet';
import PostDetailScreen from './screens/PostDetailScreen';
import MoreTrackersScreen from './screens/MoreTrackersScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function sidebarAware<T extends object>(Screen: React.ComponentType<T>): React.ComponentType<T> {
  if (Platform.OS !== 'web') return Screen;
  return function WrappedScreen(props: T) {
    return (
      <View style={{ flex: 1, marginLeft: SIDEBAR_WIDTH }}>
        <Screen {...props} />
      </View>
    );
  };
}

function withErrorBoundary<T extends object>(
  Screen: React.ComponentType<T>,
  fallbackMessage: string,
): React.ComponentType<T> {
  return function BoundedScreen(props: T) {
    return (
      <ErrorBoundary fallbackMessage={fallbackMessage}>
        <Screen {...props} />
      </ErrorBoundary>
    );
  };
}

// The five tabs that occupy a permanent nav slot. Calendar and Patch remain
// registered as sibling routes on the same navigator (so every existing
// `navigation.navigate('Calendar' | 'Patch')` call and deep link keeps working
// unchanged) — they're just excluded from both the mobile tab bar and the web
// sidebar below. Future phases can surface them from Home/Discover/Profile.
const NAV_TABS = [
  { name: 'Home',     label: 'Home',     icon: 'home',           iconOutline: 'home-outline' },
  { name: 'Discover', label: 'Discover', icon: 'compass',        iconOutline: 'compass-outline' },
  { name: 'Track',    label: 'Track',    icon: 'clipboard',      iconOutline: 'clipboard-outline' },
  { name: 'Profile',  label: 'Profile',  icon: 'person-circle',  iconOutline: 'person-circle-outline' },
] as const;

const VISIBLE_TAB_NAMES = ['Home', 'Discover', 'Create', 'Track', 'Profile'];

function WebSidebar({ state, navigation }: BottomTabBarProps) {
  const c = useColors();
  const { requestCreate, closeAllSecondary } = React.useContext(AppContext);
  const visibleRoutes = state.routes.filter(r => VISIBLE_TAB_NAMES.includes(r.name));

  return (
    <View style={{
      position: 'fixed' as any,
      left: 0,
      top: 0,
      bottom: 0,
      width: SIDEBAR_WIDTH,
      backgroundColor: c.card,
      borderRightWidth: 1.5,
      borderRightColor: c.separator,
      paddingTop: 36,
      paddingHorizontal: 14,
      zIndex: 100,
    }}>
      <View style={{ paddingHorizontal: 10, marginBottom: 32 }}>
        <Image
          source={require('./assets/icons/icon-foreground.png')}
          style={{ width: 56, height: 56 }}
          resizeMode="contain"
          accessibilityLabel="Parent Patch"
        />
      </View>

      {visibleRoutes.map((route) => {
        if (route.name === 'Create') {
          return (
            <TouchableOpacity
              key={route.key}
              onPress={requestCreate}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 13,
                paddingHorizontal: 16,
                borderRadius: 30,
                marginBottom: 4,
                backgroundColor: c.primary,
              }}
            >
              <View style={{ width: 22, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="add" size={26} color="#fff" />
              </View>
              <Text
                allowFontScaling
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{ marginLeft: 14, fontSize: 16, fontWeight: '700', color: '#fff' }}
              >
                Create
              </Text>
            </TouchableOpacity>
          );
        }
        const focused = state.index === state.routes.findIndex(r => r.key === route.key);
        const tab = NAV_TABS.find(t => t.name === route.name) ?? NAV_TABS[0];
        return (
          <TouchableOpacity
            key={route.key}
            onPress={() => { closeAllSecondary(); navigation.navigate(route.name); }}
            activeOpacity={0.75}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: focused }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 13,
              paddingHorizontal: 16,
              borderRadius: 30,
              marginBottom: 4,
              backgroundColor: focused ? c.cardLavender : 'transparent',
            }}
          >
            <Ionicons
              name={(focused ? tab.icon : tab.iconOutline) as any}
              size={22}
              color={focused ? c.primary : c.textMuted}
            />
            <Text
              allowFontScaling
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={{
                marginLeft: 14,
                fontSize: 16,
                fontWeight: focused ? '700' : '500',
                color: focused ? c.primary : c.textMuted,
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Center "Create" tab button — never navigates, just asks Home (via AppContext)
// to present its create-options sheet. Visually a raised, filled circle so it
// reads as the primary action, the way Instagram/TikTok/X treat their post button.
function CreateTabButton() {
  const c = useColors();
  const { requestCreate } = React.useContext(AppContext);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <TouchableOpacity
        onPress={requestCreate}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Create"
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          marginTop: -18,
          backgroundColor: c.primary,
          justifyContent: 'center',
          alignItems: 'center',
          shadowColor: c.heroShadow,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.25,
          shadowRadius: 6,
          elevation: 6,
        }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

// Placeholder route component for the "Create" tab. It's never actually shown —
// pressing it always calls requestCreate() instead of navigating — but the
// navigator requires every Tab.Screen to have a component.
function CreateTabPlaceholder() {
  return null;
}

function OneHandedIndicator() {
  const { isOneHanded } = useOneHanded();
  if (!isOneHanded) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', bottom: 74, right: 14, zIndex: 998 }}
    >
      <View style={{
        backgroundColor: 'rgba(124,107,196,0.88)',
        borderRadius: 20,
        paddingHorizontal: 9,
        paddingVertical: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}>
        <Text style={{ fontSize: 12 }}>☝️</Text>
        <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700', letterSpacing: 0.3 }}>1H</Text>
      </View>
    </View>
  );
}

function tabIcon(name: string, outline: string) {
  return ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={(focused ? name : outline) as any} size={focused ? 25 : 22} color={color} />
  );
}

function MainTabs() {
  const c = useColors();
  const isWeb = Platform.OS === 'web';

  return (
    <Tab.Navigator
      tabBar={(props) =>
        isWeb ? <WebSidebar {...props} /> : <BottomTabBar {...props} />
      }
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.textPrimary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.separator,
          borderTopWidth: 1.5,
          paddingTop: 8,
          paddingBottom: 8,
          height: 64,
          shadowColor: c.heroShadow,
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.10,
          shadowRadius: 8,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={sidebarAware(withErrorBoundary(HomeScreen, 'The Home feed ran into a hiccup.'))}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tab.Screen
        name="Discover"
        component={sidebarAware(withErrorBoundary(DiscoverScreen, 'Discover ran into a hiccup.'))}
        options={{
          tabBarLabel: 'Discover',
          tabBarIcon: tabIcon('compass', 'compass-outline'),
        }}
      />
      <Tab.Screen
        name="Create"
        component={CreateTabPlaceholder}
        options={{
          tabBarButton: () => <CreateTabButton />,
        }}
      />
      <Tab.Screen
        name="Track"
        component={sidebarAware(withErrorBoundary(TrackScreen, 'Track ran into a hiccup.'))}
        options={{
          tabBarLabel: 'Track',
          tabBarIcon: tabIcon('clipboard', 'clipboard-outline'),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={sidebarAware(withErrorBoundary(ProfileScreen, 'Profile ran into a hiccup.'))}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: tabIcon('person-circle', 'person-circle-outline'),
        }}
      />

      {/* Not shown in the tab bar — still registered so existing internal
          navigation (navigate('Calendar' | 'Patch')) and deep links keep working.
          Phase 2 will surface these from Home/Discover/Profile instead. */}
      <Tab.Screen
        name="Calendar"
        component={sidebarAware(withErrorBoundary(CalendarScreen, 'Calendar ran into a hiccup.'))}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen
        name="Patch"
        component={sidebarAware(withErrorBoundary(VillageScreen, 'Patch ran into a hiccup.'))}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen
        name="PostDetail"
        component={sidebarAware(withErrorBoundary(PostDetailScreen, 'This post ran into a hiccup.'))}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen
        name="MoreTrackers"
        component={sidebarAware(withErrorBoundary(MoreTrackersScreen, 'More Trackers ran into a hiccup.'))}
        options={{ tabBarButton: () => null }}
      />
    </Tab.Navigator>
  );
}

// The onboarding-complete flag is cached locally per-user (keyed by user id) so a
// second account signing in on the same device doesn't inherit the first account's
// flag and skip onboarding entirely.
function onboardingCompleteKey(userId: string) {
  return `onboarding_complete:${userId}`;
}

async function resolveOnboardingDone(session: Session | null): Promise<boolean> {
  if (!session?.user) return false;
  const flag = await AsyncStorage.getItem(onboardingCompleteKey(session.user.id));
  if (flag === 'true') return true;
  const { data } = await supabase
    .from('profiles')
    .select('onboarding_complete')
    .eq('id', session.user.id)
    .maybeSingle();
  if (data?.onboarding_complete) {
    await AsyncStorage.setItem(onboardingCompleteKey(session.user.id), 'true');
    return true;
  }
  return false;
}

function App() {
  const [session, setSession] = React.useState<Session | null>(null);
  const [onboardingDone, setOnboardingDone] = React.useState<boolean | null>(null);
  const resolvedUserId = React.useRef<string | null>(null);

  React.useEffect(() => {
    registerNotificationCategories();
    registerNotificationResponseListener();
    restoreAnalyticsOptOut();
    installWebKeyboardScrollFallback();
    installFocusVisibleStyles();
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function applySession(newSession: Session | null) {
      setSession(newSession);
      const uid = newSession?.user?.id ?? null;
      if (!uid) {
        if (resolvedUserId.current) resetAnalytics();
        resolvedUserId.current = null;
        Sentry.setUser(null);
        if (!cancelled) setOnboardingDone(false);
        return;
      }
      // Same user as last resolved (e.g. a token-refresh auth event) — skip the re-check.
      if (uid === resolvedUserId.current) return;
      resolvedUserId.current = uid;
      Sentry.setUser({ id: uid });
      identifyUser(uid, { email: newSession?.user?.email ?? undefined });
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('preferred_term')
          .eq('id', uid)
          .maybeSingle();
        if (profile) setUserProperties({ role: (profile as any).preferred_term ?? undefined });
      } catch {}
      const done = await resolveOnboardingDone(newSession);
      if (!cancelled) setOnboardingDone(done);
    }

    supabase.auth.getSession().then(({ data: { session } }) => applySession(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const markOnboardingComplete = React.useCallback(async () => {
    if (session?.user) {
      await AsyncStorage.setItem(onboardingCompleteKey(session.user.id), 'true');
    }
    setOnboardingDone(true);
  }, [session]);

  const [tourRequestId, setTourRequestId] = React.useState(0);
  const requestTour = React.useCallback(() => setTourRequestId(id => id + 1), []);

  // Global create-options sheet and the two fully self-contained flows it can
  // open directly (Event, Ask for Help) — all owned here at the app root so
  // they're visually independent of whichever tab is active. Post/Question/
  // Photo·Video/Story still reuse Home's existing composers via createAction.
  const [showCreateSheet, setShowCreateSheet] = React.useState(false);
  const requestCreate = React.useCallback(() => setShowCreateSheet(true), []);
  const [showEvents, setShowEvents] = React.useState(false);
  const [showPatchTasks, setShowPatchTasks] = React.useState(false);

  const [createAction, setCreateAction] = React.useState<{ action: CreateAction; requestId: number } | null>(null);
  const createActionSeq = React.useRef(0);
  const requestCreateAction = React.useCallback((action: CreateAction) => {
    createActionSeq.current += 1;
    setCreateAction({ action, requestId: createActionSeq.current });
  }, []);

  const { isDesktop } = useResponsive();
  const navigationRef = useNavigationContainerRef();
  const [secondaryStack, setSecondaryStack] = React.useState<SecondaryDestination[]>([]);
  const pushSecondary = React.useCallback((d: SecondaryDestination) => setSecondaryStack(prev => [...prev, d]), []);
  const popSecondary = React.useCallback(() => setSecondaryStack(prev => prev.slice(0, -1)), []);
  const closeAllSecondary = React.useCallback(() => setSecondaryStack([]), []);

  const handleCreateSelect = React.useCallback((option: CreateOption) => {
    setShowCreateSheet(false);
    if (option === 'event') { setShowEvents(true); return; }
    if (option === 'help') {
      if (isDesktop) pushSecondary({ type: 'patchRequests' });
      else setShowPatchTasks(true);
      return;
    }
    requestCreateAction(option);
  }, [requestCreateAction, isDesktop, pushSecondary]);

  if (onboardingDone === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FEFCF8', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#B8A9C9" size="large" />
      </View>
    );
  }

  return (
    <PostHogProvider client={posthog} autocapture={{ captureTouches: true, captureScreens: false }}>
    <SafeAreaProvider>
    <AppContext.Provider value={{ markOnboardingComplete, tourRequestId, requestTour, requestCreate, createAction, requestCreateAction, secondaryStack, pushSecondary, popSecondary, closeAllSecondary }}>
      <OneHandedProvider>
      <SyncProvider>
      <SubscriptionProvider>
      <BabyProvider>
      <OfflineBanner />
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!session ? (
            <Stack.Screen name="Auth" component={AuthScreen} />
          ) : !onboardingDone ? (
            <Stack.Screen name="Onboarding" component={OnboardingEntry} />
          ) : (
            <Stack.Screen name="Main" component={MainTabs} />
          )}
        </Stack.Navigator>

        {/* Global create surfaces — siblings of the tab navigator, not owned by
            any single tab, so they show reliably above whichever tab is active
            regardless of tab mount/focus lifecycle. See lib/AppContext.ts. */}
        <CreateOptionsSheet
          visible={showCreateSheet}
          onClose={() => { setShowCreateSheet(false); restoreScrollFocus(); }}
          onSelect={handleCreateSelect}
        />
        <Modal visible={showEvents} animationType="slide" presentationStyle="fullScreen">
          <EventsScreen onBack={() => { setShowEvents(false); restoreScrollFocus(); }} autoOpenCreate />
        </Modal>
        {/* Mobile-only fallback for the global Create > Ask for Help flow —
            on desktop this opens via pushSecondary({type:'patchRequests'})
            into DesktopSecondaryHost instead (see handleCreateSelect above). */}
        <PatchTasksSheet visible={showPatchTasks} onClose={() => { setShowPatchTasks(false); restoreScrollFocus(); }} />
        <DesktopSecondaryHost navigationRef={navigationRef} />
      </NavigationContainer>
      <OneHandedIndicator />
      </BabyProvider>
      </SubscriptionProvider>
      </SyncProvider>
      </OneHandedProvider>
    </AppContext.Provider>
    </SafeAreaProvider>
    </PostHogProvider>
  );
}

export default Sentry.wrap(App);

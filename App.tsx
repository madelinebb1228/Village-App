import './lib/carCheckTask'; // registers the background task at module scope — required by TaskManager
import './lib/alertPolyfill'; // patches Alert.alert on web, where it's otherwise a no-op

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Image } from 'react-native';
import { useColors } from './lib/theme';
import { NavigationContainer } from '@react-navigation/native';
import { SyncProvider } from './lib/syncService';
import OfflineBanner from './components/OfflineBanner';
import { OneHandedProvider, useOneHanded } from './lib/OneHandedContext';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BottomTabBar, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './lib/supabase';
import { AppContext } from './lib/AppContext';
import { SubscriptionProvider } from './lib/subscriptionContext';
import { BabyProvider } from './lib/babyContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AuthScreen from './screens/Auth';
import OnboardingScreen from './screens/Onboarding';
import HomeScreen from './screens/HomeTab';
import TrackScreen from './screens/Track';
import CalendarScreen from './screens/CalendarTab';
import ResourcesScreen from './screens/ResourcesTab';
import VillageScreen from './screens/VillageTab';
import ProfileScreen from './screens/Profile';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const SIDEBAR_WIDTH = 230;

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

const NAV_TABS = [
  { name: 'Home',      emoji: '🏡', label: 'Home' },
  { name: 'Track',     emoji: '📋', label: 'Track' },
  { name: 'Calendar',  emoji: '📅', label: 'Calendar' },
  { name: 'Resources', emoji: '📚', label: 'Resources' },
  { name: 'Patch',     emoji: '🌿', label: 'Patch' },
  { name: 'Profile',   emoji: '🌸', label: 'Profile' },
];

function WebSidebar({ state, navigation }: BottomTabBarProps) {
  const c = useColors();
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
      <View style={{ paddingHorizontal: 10, marginBottom: 40 }}>
        <Image
          source={require('./assets/logo.png')}
          style={{ width: 120, height: 120 }}
          resizeMode="contain"
        />
      </View>

      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const tab = NAV_TABS.find(t => t.name === route.name) ?? NAV_TABS[0];
        return (
          <TouchableOpacity
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            activeOpacity={0.75}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 13,
              paddingHorizontal: 16,
              borderRadius: 30,
              marginBottom: 4,
              backgroundColor: focused ? c.cardBlush : 'transparent',
            }}
          >
            <Text style={{ fontSize: 22 }}>{tab.emoji}</Text>
            <Text style={{
              marginLeft: 14,
              fontSize: 16,
              fontWeight: focused ? '700' : '500',
              color: focused ? c.textPrimary : c.textMuted,
            }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function OneHandedIndicator() {
  const { isOneHanded } = useOneHanded();
  if (!isOneHanded) return null;
  return (
    <View
      pointerEvents="none"
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
        component={sidebarAware(HomeScreen)}
        options={{
          tabBarLabel: 'Home',
          tabBarItemStyle: { borderRightWidth: 1, borderRightColor: c.separator },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.45 }}>🏡</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Track"
        component={sidebarAware(TrackScreen)}
        options={{
          tabBarLabel: 'Track',
          tabBarItemStyle: { borderRightWidth: 1, borderRightColor: c.separator },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.45 }}>📋</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={sidebarAware(CalendarScreen)}
        options={{
          tabBarLabel: 'Calendar',
          tabBarItemStyle: { borderRightWidth: 1, borderRightColor: c.separator },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.45 }}>📅</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Resources"
        component={sidebarAware(ResourcesScreen)}
        options={{
          tabBarLabel: 'Resources',
          tabBarItemStyle: { borderRightWidth: 1, borderRightColor: c.separator },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.45 }}>📚</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Patch"
        component={sidebarAware(VillageScreen)}
        options={{
          tabBarLabel: 'Patch',
          tabBarItemStyle: { borderRightWidth: 1, borderRightColor: c.separator },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.45 }}>🏘️</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={sidebarAware(ProfileScreen)}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.45 }}>🌸</Text>
          ),
        }}
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

export default function App() {
  const [session, setSession] = React.useState<Session | null>(null);
  const [onboardingDone, setOnboardingDone] = React.useState<boolean | null>(null);
  const resolvedUserId = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function applySession(newSession: Session | null) {
      setSession(newSession);
      const uid = newSession?.user?.id ?? null;
      if (!uid) {
        resolvedUserId.current = null;
        if (!cancelled) setOnboardingDone(false);
        return;
      }
      // Same user as last resolved (e.g. a token-refresh auth event) — skip the re-check.
      if (uid === resolvedUserId.current) return;
      resolvedUserId.current = uid;
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

  if (onboardingDone === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FEFCF8', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#B8A9C9" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
    <AppContext.Provider value={{ markOnboardingComplete, tourRequestId, requestTour }}>
      <OneHandedProvider>
      <SyncProvider>
      <SubscriptionProvider>
      <BabyProvider>
      <OfflineBanner />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!session ? (
            <Stack.Screen name="Auth" component={AuthScreen} />
          ) : !onboardingDone ? (
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          ) : (
            <Stack.Screen name="Main" component={MainTabs} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <OneHandedIndicator />
      </BabyProvider>
      </SubscriptionProvider>
      </SyncProvider>
      </OneHandedProvider>
    </AppContext.Provider>
    </SafeAreaProvider>
  );
}

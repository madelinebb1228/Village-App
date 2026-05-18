import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './lib/supabase';
import { AppContext } from './lib/AppContext';

import AuthScreen from './screens/Auth';
import OnboardingScreen from './screens/Onboarding';
import HomeScreen from './screens/HomeTab';
import TrackScreen from './screens/Track';
import VillageScreen from './screens/VillageTab';
import ProfileScreen from './screens/Profile';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#5A544E',
        tabBarInactiveTintColor: '#AEBCB1',
        tabBarStyle: {
          backgroundColor: '#FEFEE2',
          borderTopColor: '#C1C89B',
          borderTopWidth: 1.5,
          paddingTop: 8,
          paddingBottom: 8,
          height: 64,
          shadowColor: '#5A544E',
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
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarItemStyle: { borderRightWidth: 1, borderRightColor: '#C1C89B' },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.45 }}>🏡</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Track"
        component={TrackScreen}
        options={{
          tabBarLabel: 'Track',
          tabBarItemStyle: { borderRightWidth: 1, borderRightColor: '#C1C89B' },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.45 }}>📋</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Village"
        component={VillageScreen}
        options={{
          tabBarLabel: 'Village',
          tabBarItemStyle: { borderRightWidth: 1, borderRightColor: '#C1C89B' },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.45 }}>🏘️</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
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

export default function App() {
  const [session, setSession] = React.useState<Session | null>(null);
  const [onboardingDone, setOnboardingDone] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    // Load session and onboarding flag in parallel
    Promise.all([
      supabase.auth.getSession(),
      AsyncStorage.getItem('onboarding_complete'),
    ]).then(([{ data: { session } }, flag]) => {
      setSession(session);
      setOnboardingDone(flag === 'true');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const markOnboardingComplete = React.useCallback(async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    setOnboardingDone(true);
  }, []);

  // Show a neutral splash while we determine auth + onboarding state
  if (onboardingDone === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FEFCF8', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#B8A9C9" size="large" />
      </View>
    );
  }

  return (
    <AppContext.Provider value={{ markOnboardingComplete }}>
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
    </AppContext.Provider>
  );
}

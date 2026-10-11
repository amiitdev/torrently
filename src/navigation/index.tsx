import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Lucide from '@react-native-vector-icons/lucide';

import DashboardScreen from '../screens/DashboardScreen';
import ActiveDownloadsScreen from '../screens/ActiveDownloadsScreen';
import CompletedScreen from '../screens/CompletedScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AddTorrentScreen from '../screens/AddTorrentScreen';
import TorrentDetailsScreen from '../screens/TorrentDetailsScreen';
import { colors, typography } from '../theme';
import type { RootStackParamList, TabParamList } from './types';

function TabBackground() {
  return <View style={styles.tabBackground} />;
}

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

const icons: Record<keyof TabParamList, string> = {
  Dashboard: 'gauge',
  Downloads: 'download',
  Completed: 'check-circle',
  Settings: 'settings',
};

function screenOptions({ route }: { route: { name: keyof TabParamList } }) {
  const Icon = icons[route.name];
  return {
    headerShown: false,
    tabBarStyle: styles.tabBar,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textSecondary,
    tabBarLabelStyle: styles.tabLabel,
    tabBarBackground: TabBackground,
    tabBarIcon: ({ color, size }: { color: string; size: number }) => (
      <Lucide name={Icon as any} size={size - 3} color={color} />
    ),
  } as const;
}

function Tabs() {
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Downloads" component={ActiveDownloadsScreen} options={{ title: 'Active' }} />
      <Tab.Screen name="Completed" component={CompletedScreen} options={{ title: 'Done' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { ...typography.heading, color: colors.text },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="AddTorrent"
          component={AddTorrentScreen}
          options={{ title: 'Add torrent', presentation: 'modal' }}
        />
        <Stack.Screen
          name="TorrentDetails"
          component={TorrentDetailsScreen}
          options={{ title: 'Torrent details' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 64,
    paddingTop: 6,
    paddingBottom: 10,
  },
  tabBackground: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  tabLabel: {
    ...typography.micro,
    fontSize: 11,
    marginTop: -2,
  },
});

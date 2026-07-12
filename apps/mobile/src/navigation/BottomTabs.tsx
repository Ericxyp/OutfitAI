import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { MobileProfileResponse } from "@/types/api";
import { HomeScreen } from "@/screens/HomeScreen";
import { ClosetScreen } from "@/screens/ClosetScreen";
import { AddClothingScreen } from "@/screens/AddClothingScreen";
import { TravelScreen } from "@/screens/TravelScreen";
import { ShoppingScreen } from "@/screens/ShoppingScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { StyleProfileScreen } from "@/screens/StyleProfileScreen";
import { PersonalProfileScreen } from "@/screens/PersonalProfileScreen";
import { colors } from "@/lib/theme";

export type ClosetStackParamList = {
  ClosetList: undefined;
  AddClothing: undefined;
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  StyleProfile: { profile: MobileProfileResponse };
  PersonalProfile: { profile: MobileProfileResponse };
};

export type MainTabParamList = {
  Home: undefined;
  Closet: undefined;
  Travel: undefined;
  Shopping: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const ClosetStack = createNativeStackNavigator<ClosetStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTitleStyle: { color: colors.foreground, fontWeight: "600" as const },
  headerTintColor: colors.foreground,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

function ClosetNavigator() {
  return (
    <ClosetStack.Navigator screenOptions={screenOptions}>
      <ClosetStack.Screen
        name="ClosetList"
        component={ClosetScreen}
        options={{ headerShown: false }}
      />
      <ClosetStack.Screen
        name="AddClothing"
        component={AddClothingScreen}
        options={{ title: "添加衣服" }}
      />
    </ClosetStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={screenOptions}>
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="StyleProfile"
        component={StyleProfileScreen}
        options={{ title: "风格画像" }}
      />
      <ProfileStack.Screen
        name="PersonalProfile"
        component={PersonalProfileScreen}
        options={{ title: "个人信息" }}
      />
    </ProfileStack.Navigator>
  );
}

export function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        ...screenOptions,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "首页", tabBarLabel: "首页" }}
      />
      <Tab.Screen
        name="Closet"
        component={ClosetNavigator}
        options={{ title: "衣橱", tabBarLabel: "衣橱", headerShown: false }}
      />
      <Tab.Screen
        name="Travel"
        component={TravelScreen}
        options={{ title: "旅行", tabBarLabel: "旅行" }}
      />
      <Tab.Screen
        name="Shopping"
        component={ShoppingScreen}
        options={{ title: "购物", tabBarLabel: "购物" }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{ title: "我的", tabBarLabel: "我的", headerShown: false }}
      />
    </Tab.Navigator>
  );
}

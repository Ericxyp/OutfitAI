import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { BottomTabs } from "@/navigation/BottomTabs";
import { LoginScreen } from "@/screens/LoginScreen";
import { colors } from "@/lib/theme";

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

export type { ClosetStackParamList, ProfileStackParamList } from "@/navigation/BottomTabs";

const RootStack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {isAuthenticated ? (
        <RootStack.Screen name="Main" component={BottomTabs} />
      ) : (
        <RootStack.Screen name="Login" component={LoginScreen} />
      )}
    </RootStack.Navigator>
  );
}

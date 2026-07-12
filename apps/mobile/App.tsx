import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, type LinkingOptions } from "@react-navigation/native";
import * as Linking from "expo-linking";
import { RootNavigator } from "@/navigation/RootNavigator";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import type { RootStackParamList } from "@/navigation/RootNavigator";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      if (!url.includes("auth/callback")) return;

      try {
        const parsed = Linking.parse(url);
        const code = parsed.queryParams?.code;
        if (typeof code === "string") {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch (error) {
        console.warn("[auth] deep link handling failed:", error);
      }
    };

    void Linking.getInitialURL().then((url) => {
      if (url) void handleDeepLink(url);
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleDeepLink(url);
    });

    return () => subscription.remove();
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <NavigationContainer linking={linking}>
      <StatusBar style="dark" />
      <RootNavigator isAuthenticated={!!session} />
    </NavigationContainer>
  );
}

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL("/"), "outfitai://"],
  config: {
    screens: {
      Login: "auth/callback",
      Main: {
        screens: {
          Home: "home",
          Closet: {
            screens: {
              ClosetList: "closet",
              AddClothing: "closet/add",
            },
          },
          Travel: "travel",
          Shopping: "shopping",
          Profile: {
            screens: {
              ProfileMain: "profile",
              StyleProfile: "profile/style",
              PersonalProfile: "profile/personal",
            },
          },
        },
      },
    },
  },
};

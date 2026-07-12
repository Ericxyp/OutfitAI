import { useCallback, useState, type ReactNode } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { AppButton } from "@/components/AppButton";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { fetchProfile, getWebUrl, isApiConfigured } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { colors, radius, spacing } from "@/lib/theme";
import type { MobileProfileResponse } from "@/types/api";
import type { ProfileStackParamList } from "@/navigation/BottomTabs";

export function ProfileScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [profile, setProfile] = useState<MobileProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (isRefresh = false) => {
    if (!isApiConfigured) {
      setError("未配置 EXPO_PUBLIC_API_BASE_URL");
      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await fetchProfile();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载个人信息失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    Alert.alert("已退出登录");
  }

  function openWeb(path: string) {
    void Linking.openURL(getWebUrl(path));
  }

  if (loading) {
    return <LoadingState message="加载个人信息…" />;
  }

  if (error || !profile) {
    return (
      <EmptyState
        title="加载失败"
        description={error ?? "未知错误"}
        actionLabel="重试"
        onAction={() => void loadProfile()}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadProfile(true)}
        />
      }
    >
      <Text style={styles.title}>我的</Text>
      <Text style={styles.email}>
        {profile.profile.displayName ?? profile.profile.email ?? "未命名用户"}
      </Text>

      <View style={styles.statsRow}>
        <StatCard label="衣橱" value={profile.stats.closetCount} />
        <StatCard label="推荐" value={profile.stats.recommendationCount} />
        <StatCard label="反馈" value={profile.stats.feedbackCount} />
      </View>

      <MenuSection title="画像">
        <MenuItem
          title="风格画像"
          subtitle={
            profile.styleProfile?.feedbackCount
              ? `已积累 ${profile.styleProfile.feedbackCount} 条反馈`
              : "查看 AI 学习的穿搭偏好"
          }
          onPress={() => navigation.navigate("StyleProfile", { profile })}
        />
        <MenuItem
          title="个人信息"
          subtitle="身高、体型、穿衣目标等"
          onPress={() => navigation.navigate("PersonalProfile", { profile })}
        />
      </MenuSection>

      <MenuSection title="更多功能">
        <MenuItem
          title="产品数据"
          subtitle="Coming soon · 暂用 Web 版"
          onPress={() => openWeb("/profile/metrics")}
        />
      </MenuSection>

      <AppButton title="退出登录" variant="secondary" onPress={handleSignOut} />
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.menuGroup}>{children}</View>
    </View>
  );
}

function MenuItem({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
    >
      <Text style={styles.menuTitle}>{title}</Text>
      <Text style={styles.menuSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.foreground,
  },
  email: {
    fontSize: 15,
    color: colors.muted,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  menuGroup: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  menuItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 4,
  },
  menuItemPressed: {
    backgroundColor: colors.accent,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  menuSubtitle: {
    fontSize: 13,
    color: colors.muted,
  },
});

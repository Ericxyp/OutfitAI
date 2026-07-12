import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AppButton } from "@/components/AppButton";
import { ClosetItemCard } from "@/components/ClosetItemCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { fetchClosetItems, isApiConfigured } from "@/lib/api";
import { colors, spacing } from "@/lib/theme";
import type { ClosetItem } from "@/types/api";
import type { ClosetStackParamList } from "@/navigation/BottomTabs";

export function ClosetScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ClosetStackParamList>>();
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async (isRefresh = false) => {
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
      const data = await fetchClosetItems();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载衣橱失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadItems();
    }, [loadItems])
  );

  if (loading) {
    return <LoadingState message="加载衣橱中…" />;
  }

  if (error) {
    return (
      <EmptyState
        title="加载失败"
        description={error}
        actionLabel="重试"
        onAction={() => void loadItems()}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>我的衣橱</Text>
        <Text style={styles.count}>已收录 {items.length} 件</Text>
        <AppButton
          title="添加衣服"
          onPress={() => navigation.navigate("AddClothing")}
        />
      </View>

      {items.length === 0 ? (
        <EmptyState
          title="衣橱还是空的"
          description="先放几件常穿的衣服，搭配会更有你的味道。"
          actionLabel="添加第一件"
          onAction={() => navigation.navigate("AddClothing")}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ClosetItemCard item={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadItems(true)}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.foreground,
  },
  count: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});

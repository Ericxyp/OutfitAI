import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, radius, spacing } from "@/lib/theme";
import type { ProfileStackParamList } from "@/navigation/BottomTabs";

type Props = NativeStackScreenProps<ProfileStackParamList, "StyleProfile">;

export function StyleProfileScreen({ route }: Props) {
  const { profile } = route.params;
  const style = profile.styleProfile;

  if (!style || style.feedbackCount <= 0) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>风格画像</Text>
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>还没有足够反馈</Text>
          <Text style={styles.emptyText}>
            在首页对推荐进行喜欢 / 不喜欢 / 收藏，AI 会逐渐学习你的穿搭偏好。
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>风格画像</Text>

      {style.styleSummary ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>AI 风格总结</Text>
          <Text style={styles.body}>{style.styleSummary}</Text>
        </View>
      ) : null}

      <TagSection title="偏好风格" tags={style.preferredStyles} />
      <TagSection title="偏好颜色" tags={style.preferredColors} />
      <TagSection title="常用场景" tags={style.preferredOccasions} />
      <TagSection title="避免风格" tags={style.avoidStyles} />
      <TagSection title="避免颜色" tags={style.avoidColors} />

      <Text style={styles.meta}>累计反馈 {style.feedbackCount} 条</Text>
    </ScrollView>
  );
}

function TagSection({ title, tags }: { title: string; tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.tags}>
        {tags.map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.foreground,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.foreground,
  },
  body: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagText: {
    fontSize: 13,
    color: colors.foreground,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 22,
  },
  meta: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
});

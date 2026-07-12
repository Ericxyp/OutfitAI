import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, radius, spacing } from "@/lib/theme";
import type { ProfileStackParamList } from "@/navigation/BottomTabs";

type Props = NativeStackScreenProps<ProfileStackParamList, "PersonalProfile">;

const FIT_GOAL_LABELS: Record<string, string> = {
  slim: "显瘦",
  tall: "显高",
  balanced: "均衡比例",
  comfortable: "舒适自在",
  professional: "干练利落",
};

export function PersonalProfileScreen({ route }: Props) {
  const personal = route.params.profile.personalProfile;

  if (!personal) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>个人信息</Text>
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>尚未填写</Text>
          <Text style={styles.emptyText}>
            可在 Web 版「个人信息画像」页面完善身高、体型与穿衣目标，移动端会同步展示。
          </Text>
        </View>
      </ScrollView>
    );
  }

  const fitGoals = personal.fitGoals.map(
    (goal) => FIT_GOAL_LABELS[goal] ?? goal
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>个人信息</Text>

      <InfoRow label="身高" value={personal.heightCm ? `${personal.heightCm} cm` : null} />
      <InfoRow label="体重" value={personal.weightKg ? `${personal.weightKg} kg` : null} />
      <InfoRow label="年龄" value={personal.age ? `${personal.age} 岁` : null} />
      <InfoRow label="性别" value={personal.gender} />
      <InfoRow label="体型备注" value={personal.bodyNotes} />
      <InfoRow label="穿衣目标" value={fitGoals.length > 0 ? fitGoals.join("、") : null} />
      <InfoRow label="尺码备注" value={personal.sizeNotes} />
      <InfoRow
        label="不想强调"
        value={
          personal.avoidBodyFocus.length > 0
            ? personal.avoidBodyFocus.join("、")
            : null
        }
      />
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value ?? "未填写"}</Text>
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
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "500",
  },
  value: {
    fontSize: 16,
    color: colors.foreground,
    lineHeight: 22,
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
});

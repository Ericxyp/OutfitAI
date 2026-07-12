import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { ClosetItem, FeedbackRating } from "@/types/api";
import { CATEGORY_LABELS } from "@/types/api";
import { colors, radius, spacing } from "@/lib/theme";

type OutfitCardProps = {
  title: string;
  summary: string;
  reasoning: string;
  styleTags: string[];
  items: ClosetItem[];
  feedback?: FeedbackRating | null;
  onFeedback?: (rating: FeedbackRating) => void;
  feedbackLoading?: boolean;
};

export function OutfitCard({
  title,
  summary,
  reasoning,
  styleTags,
  items,
  feedback,
  onFeedback,
  feedbackLoading = false,
}: OutfitCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.summary}>{summary}</Text>
      <Text style={styles.reasoning}>{reasoning}</Text>

      {styleTags.length > 0 ? (
        <View style={styles.tags}>
          {styleTags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.items}>
        {items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Image source={{ uri: item.image_url }} style={styles.itemImage} />
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                {CATEGORY_LABELS[item.category] ?? item.category}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {onFeedback ? (
        <View style={styles.actions}>
          <FeedbackButton
            label="喜欢"
            active={feedback === "like"}
            disabled={feedbackLoading}
            onPress={() => onFeedback("like")}
          />
          <FeedbackButton
            label="不喜欢"
            active={feedback === "dislike"}
            disabled={feedbackLoading}
            onPress={() => onFeedback("dislike")}
          />
          <FeedbackButton
            label="收藏"
            active={feedback === "save"}
            disabled={feedbackLoading}
            onPress={() => onFeedback("save")}
          />
        </View>
      ) : null}
    </View>
  );
}

function FeedbackButton({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.feedbackButton,
        active && styles.feedbackButtonActive,
        disabled && styles.feedbackButtonDisabled,
      ]}
    >
      <Text
        style={[
          styles.feedbackText,
          active && styles.feedbackTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.foreground,
  },
  summary: {
    fontSize: 16,
    color: colors.foreground,
    lineHeight: 24,
  },
  reasoning: {
    fontSize: 14,
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
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagText: {
    fontSize: 13,
    color: colors.foreground,
  },
  items: {
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  itemImage: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.foreground,
  },
  itemMeta: {
    fontSize: 13,
    color: colors.muted,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  feedbackButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  feedbackButtonActive: {
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
  },
  feedbackButtonDisabled: {
    opacity: 0.6,
  },
  feedbackText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.foreground,
  },
  feedbackTextActive: {
    color: "#ffffff",
  },
});

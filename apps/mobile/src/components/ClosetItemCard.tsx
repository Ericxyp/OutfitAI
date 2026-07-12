import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { ClosetItem } from "@/types/api";
import { CATEGORY_LABELS } from "@/types/api";
import { colors, radius, spacing } from "@/lib/theme";

type ClosetItemCardProps = {
  item: ClosetItem;
  onPress?: () => void;
};

export function ClosetItemCard({ item, onPress }: ClosetItemCardProps) {
  const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Image source={{ uri: item.image_url }} style={styles.image} />
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta}>
          {categoryLabel}
          {item.color ? ` · ${item.color}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.9,
  },
  image: {
    width: 88,
    height: 88,
    backgroundColor: colors.accent,
  },
  content: {
    flex: 1,
    padding: spacing.md,
    justifyContent: "center",
    gap: spacing.xs,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  meta: {
    fontSize: 14,
    color: colors.muted,
  },
});

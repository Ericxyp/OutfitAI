import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/lib/theme";

type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = "加载中…" }: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.foreground} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  text: {
    fontSize: 15,
    color: colors.muted,
  },
});

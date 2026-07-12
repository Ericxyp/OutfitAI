import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { AppButton } from "@/components/AppButton";
import { AppTextInput } from "@/components/AppTextInput";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { OutfitCard } from "@/components/OutfitCard";
import { fetchRecommendations, isApiConfigured, submitFeedback } from "@/lib/api";
import { colors, spacing } from "@/lib/theme";
import type { FeedbackRating, RecommendationResult } from "@/types/api";

export function HomeScreen() {
  const [requestText, setRequestText] = useState("");
  const [useLocation, setUseLocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(
    null
  );
  const [feedback, setFeedback] = useState<FeedbackRating | null>(null);

  async function handleGenerate() {
    const trimmed = requestText.trim();
    if (!trimmed) {
      setError("请先描述你的穿搭需求");
      return;
    }

    if (!isApiConfigured) {
      setError("未配置 EXPO_PUBLIC_API_BASE_URL");
      return;
    }

    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      let location: { latitude: number; longitude: number } | undefined;

      if (useLocation) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          throw new Error("需要位置权限才能使用天气推荐");
        }
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        location = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };
      }

      const result = await fetchRecommendations({ requestText: trimmed, location });
      setRecommendation(result);
    } catch (err) {
      setRecommendation(null);
      setError(err instanceof Error ? err.message : "生成推荐失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedback(rating: FeedbackRating) {
    if (!recommendation) return;

    setFeedbackLoading(true);
    try {
      await submitFeedback({
        recommendationId: recommendation.id,
        rating,
      });
      setFeedback(rating);
    } catch (err) {
      Alert.alert(
        "反馈失败",
        err instanceof Error ? err.message : "请稍后重试"
      );
    } finally {
      setFeedbackLoading(false);
    }
  }

  if (loading) {
    return <LoadingState message="正在为你搭配…" />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>今天想怎么穿？</Text>
      <Text style={styles.subtitle}>
        告诉我场合和感觉，我从你的衣橱里搭一套。
      </Text>

      <AppTextInput
        placeholder="比如：明天约会，想温柔一点…"
        value={requestText}
        onChangeText={setRequestText}
        multiline
        style={styles.input}
        error={error ?? undefined}
      />

      <View style={styles.locationRow}>
        <Text style={styles.locationLabel}>使用当前位置（天气推荐）</Text>
        <Switch value={useLocation} onValueChange={setUseLocation} />
      </View>

      <AppButton title="生成推荐" onPress={handleGenerate} />

      {recommendation ? (
        <OutfitCard
          title={recommendation.title}
          summary={recommendation.summary}
          reasoning={recommendation.reasoning}
          styleTags={recommendation.styleTags}
          items={recommendation.items}
          feedback={feedback}
          feedbackLoading={feedbackLoading}
          onFeedback={handleFeedback}
        />
      ) : (
        <EmptyState
          title="还没有推荐"
          description="输入需求后点击「生成推荐」，AI 会从你的衣橱中搭配一套。"
        />
      )}
    </ScrollView>
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
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
  input: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  locationLabel: {
    fontSize: 14,
    color: colors.foreground,
    flex: 1,
    paddingRight: spacing.md,
  },
});

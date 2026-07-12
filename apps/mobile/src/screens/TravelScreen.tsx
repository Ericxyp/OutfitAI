import { useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { AppButton } from "@/components/AppButton";
import { AppTextInput } from "@/components/AppTextInput";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { generateTravelPlan, isApiConfigured } from "@/lib/api";
import { colors, radius, spacing } from "@/lib/theme";
import type { TravelDayResult, TravelPackingList, TravelPlanResult } from "@/types/api";
import { CATEGORY_LABELS } from "@/types/api";

export function TravelScreen() {
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [days, setDays] = useState("3");
  const [purpose, setPurpose] = useState("");
  const [stylePreference, setStylePreference] = useState("");
  const [packLight, setPackLight] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<TravelPlanResult | null>(null);

  async function handleGenerate() {
    const trimmedDestination = destination.trim();
    if (!trimmedDestination) {
      setError("请填写目的地");
      return;
    }

    const parsedDays = Number(days);
    if (!Number.isFinite(parsedDays) || parsedDays < 1 || parsedDays > 10) {
      setError("旅行天数需在 1-10 天之间");
      return;
    }

    if (!isApiConfigured) {
      setError("未配置 EXPO_PUBLIC_API_BASE_URL");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await generateTravelPlan({
        destination: trimmedDestination,
        startDate: startDate.trim() || undefined,
        days: parsedDays,
        purpose: purpose.trim() || undefined,
        stylePreference: stylePreference.trim() || undefined,
        packLight,
      });
      setPlan(result);
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : "生成旅行穿搭失败");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingState message="正在规划旅行穿搭…" />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>旅行穿搭规划</Text>
      <Text style={styles.subtitle}>
        输入目的地和天数，AI 会结合衣橱与天气生成 Day1-DayN 穿搭。
      </Text>

      <AppTextInput
        label="目的地"
        placeholder="例如：东京、成都"
        value={destination}
        onChangeText={setDestination}
        error={error ?? undefined}
      />
      <AppTextInput
        label="出发日期（可选）"
        placeholder="YYYY-MM-DD"
        value={startDate}
        onChangeText={setStartDate}
      />
      <AppTextInput
        label="旅行天数"
        placeholder="3"
        value={days}
        onChangeText={setDays}
        keyboardType="number-pad"
      />
      <AppTextInput
        label="旅行目的（可选）"
        placeholder="例如：城市漫游、拍照"
        value={purpose}
        onChangeText={setPurpose}
      />
      <AppTextInput
        label="风格偏好（可选）"
        placeholder="例如：简约、温柔"
        value={stylePreference}
        onChangeText={setStylePreference}
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>尽量少带衣服</Text>
        <Switch value={packLight} onValueChange={setPackLight} />
      </View>

      <AppButton title="生成旅行穿搭" onPress={handleGenerate} />

      {plan ? (
        <TravelPlanView plan={plan} />
      ) : (
        <EmptyState
          title="还没有旅行计划"
          description="填写目的地和天数后，点击生成即可查看每日穿搭与打包清单。"
        />
      )}
    </ScrollView>
  );
}

function TravelPlanView({ plan }: { plan: TravelPlanResult }) {
  return (
    <View style={styles.planSection}>
      <View style={styles.planHeader}>
        <Text style={styles.planTitle}>{plan.destination}</Text>
        <Text style={styles.planMeta}>
          {plan.days} 天
          {plan.startDate ? ` · 出发 ${plan.startDate}` : ""}
        </Text>
        {plan.purpose ? (
          <Text style={styles.planMeta}>目的：{plan.purpose}</Text>
        ) : null}
        {plan.stylePreference ? (
          <Text style={styles.planMeta}>风格：{plan.stylePreference}</Text>
        ) : null}
      </View>

      {plan.dayPlans.map((day) => (
        <TravelDayCard key={`day-${day.dayIndex}`} day={day} />
      ))}

      <PackingListView packingList={plan.packingList} />
    </View>
  );
}

function TravelDayCard({ day }: { day: TravelDayResult }) {
  const weatherText = day.weather
    ? `${day.weather.condition} ${day.weather.temperatureC}°C`
    : null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        Day {day.dayIndex}
        {day.date ? ` · ${day.date}` : ""}
      </Text>
      <Text style={styles.dayTitle}>{day.title}</Text>
      {weatherText ? <Text style={styles.weather}>{weatherText}</Text> : null}
      <Text style={styles.summary}>{day.summary}</Text>
      <Text style={styles.reasoning}>{day.reasoning}</Text>

      {day.items.length > 0 ? (
        <View style={styles.items}>
          {day.items.map((item) => (
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
      ) : null}
    </View>
  );
}

function PackingListView({ packingList }: { packingList: TravelPackingList }) {
  const sections = [
    { title: "上装", items: packingList.tops },
    { title: "下装", items: packingList.bottoms },
    { title: "外套", items: packingList.outerwear },
    { title: "鞋履", items: packingList.shoes },
    { title: "配饰", items: packingList.accessories },
    { title: "备注", items: packingList.notes },
  ].filter((section) => section.items.length > 0);

  if (sections.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>打包清单</Text>
      {sections.map((section) => (
        <View key={section.title} style={styles.packingSection}>
          <Text style={styles.packingLabel}>{section.title}</Text>
          {section.items.map((item) => (
            <Text key={`${section.title}-${item}`} style={styles.packingItem}>
              · {item}
            </Text>
          ))}
        </View>
      ))}
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
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  switchLabel: {
    fontSize: 14,
    color: colors.foreground,
    flex: 1,
    paddingRight: spacing.md,
  },
  planSection: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  planHeader: {
    gap: spacing.xs,
  },
  planTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.foreground,
  },
  planMeta: {
    fontSize: 14,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.foreground,
  },
  dayTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
  },
  weather: {
    fontSize: 13,
    color: colors.muted,
  },
  summary: {
    fontSize: 15,
    color: colors.foreground,
    lineHeight: 22,
  },
  reasoning: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  items: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.foreground,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  packingSection: {
    gap: spacing.xs,
  },
  packingLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginTop: spacing.xs,
  },
  packingItem: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
});

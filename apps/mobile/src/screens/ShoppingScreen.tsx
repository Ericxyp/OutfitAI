import { useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { AppButton } from "@/components/AppButton";
import { AppTextInput } from "@/components/AppTextInput";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { generateShoppingCheck, isApiConfigured } from "@/lib/api";
import { colors, radius, spacing } from "@/lib/theme";
import type { ShoppingCheckResult, ShoppingOutfitIdea } from "@/types/api";
import {
  CATEGORY_LABELS,
  PURCHASE_RECOMMENDATION_LABELS,
} from "@/types/api";

export function ShoppingScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [brand, setBrand] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShoppingCheckResult | null>(null);

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("需要相册权限", "请允许访问相册以选择商品图片。");
      return;
    }

    const pickResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (!pickResult.canceled && pickResult.assets[0]) {
      setImageUri(pickResult.assets[0].uri);
      setResult(null);
      setError(null);
    }
  }

  async function handleAnalyze() {
    if (!imageUri) {
      setError("请先选择商品图片");
      return;
    }

    if (!isApiConfigured) {
      setError("未配置 EXPO_PUBLIC_API_BASE_URL");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await generateShoppingCheck({
        imageUri,
        productName: productName.trim() || undefined,
        price: price.trim() || undefined,
        brand: brand.trim() || undefined,
        productUrl: productUrl.trim() || undefined,
        question: question.trim() || undefined,
      });
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "购物分析失败");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingState message="正在分析商品搭配…" />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>购物助手</Text>
      <Text style={styles.subtitle}>
        上传想买的商品图，AI 会结合你的衣橱分析是否值得买、能搭几套。
      </Text>

      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.preview} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>尚未选择商品图片</Text>
        </View>
      )}

      <AppButton title="从相册选择" variant="secondary" onPress={handlePickImage} />

      <AppTextInput
        label="商品名称（可选）"
        placeholder="例如：藏青色西装外套"
        value={productName}
        onChangeText={setProductName}
      />
      <AppTextInput
        label="价格（可选）"
        placeholder="例如：399"
        value={price}
        onChangeText={setPrice}
      />
      <AppTextInput
        label="品牌（可选）"
        placeholder="例如：Uniqlo"
        value={brand}
        onChangeText={setBrand}
      />
      <AppTextInput
        label="商品链接/渠道（可选）"
        placeholder="例如：淘宝 / 线下门店"
        value={productUrl}
        onChangeText={setProductUrl}
      />
      <AppTextInput
        label="我想知道（可选）"
        placeholder="例如：适合通勤吗？"
        value={question}
        onChangeText={setQuestion}
        multiline
        style={styles.questionInput}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <AppButton
        title="分析是否值得买"
        onPress={handleAnalyze}
        disabled={!imageUri}
      />

      {result ? (
        <ShoppingResultView result={result} />
      ) : (
        <EmptyState
          title="还没有分析结果"
          description="选择商品图片并点击分析，查看兼容度、风险与搭配方案。"
        />
      )}
    </ScrollView>
  );
}

function ShoppingResultView({ result }: { result: ShoppingCheckResult }) {
  const recommendationLabel =
    PURCHASE_RECOMMENDATION_LABELS[result.purchaseRecommendation];

  return (
    <View style={styles.resultSection}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>商品识别</Text>
        <Text style={styles.productName}>{result.product.name}</Text>
        <Text style={styles.productMeta}>
          {result.product.category}
          {result.product.color ? ` · ${result.product.color}` : ""}
        </Text>
        {result.product.notes ? (
          <Text style={styles.body}>{result.product.notes}</Text>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <StatCard label="推荐指数" value={`${result.compatibilityScore}/10`} />
        <StatCard label="可搭配" value={`${result.matchCount} 套`} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>购买建议</Text>
        <Text style={styles.recommendation}>{recommendationLabel}</Text>
      </View>

      {result.suitableStyles.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>适合风格</Text>
          <View style={styles.tags}>
            {result.suitableStyles.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <BulletSection title="推荐原因" items={result.reasons} />
      <BulletSection title="风险提示" items={result.risks} />

      {result.outfitIdeas.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>搭配方案</Text>
          {result.outfitIdeas.map((idea, index) => (
            <OutfitIdeaCard key={`${idea.title}-${index}`} idea={idea} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {items.map((item) => (
        <Text key={item} style={styles.bullet}>
          · {item}
        </Text>
      ))}
    </View>
  );
}

function OutfitIdeaCard({ idea }: { idea: ShoppingOutfitIdea }) {
  return (
    <View style={styles.ideaCard}>
      <Text style={styles.ideaTitle}>{idea.title}</Text>
      <Text style={styles.body}>{idea.summary}</Text>
      {idea.items.map((item) => (
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
  preview: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  placeholder: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 15,
  },
  questionInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  error: {
    fontSize: 14,
    color: colors.danger,
  },
  resultSection: {
    gap: spacing.md,
    marginTop: spacing.sm,
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
  productName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
  },
  productMeta: {
    fontSize: 14,
    color: colors.muted,
  },
  body: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
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
    fontSize: 20,
    fontWeight: "700",
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  recommendation: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
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
  bullet: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  ideaCard: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ideaTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
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
});

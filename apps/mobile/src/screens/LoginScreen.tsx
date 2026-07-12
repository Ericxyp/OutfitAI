import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton } from "@/components/AppButton";
import { AppTextInput } from "@/components/AppTextInput";
import { AUTH_REDIRECT_URL, isSupabaseConfigured, supabase } from "@/lib/supabase";
import { colors, spacing } from "@/lib/theme";

type LoginScreenProps = {
  onLoginSuccess?: () => void;
};

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendMagicLink() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("请输入邮箱");
      return;
    }

    if (!isSupabaseConfigured) {
      setError("未配置 Supabase 环境变量");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: AUTH_REDIRECT_URL,
        },
      });

      if (signInError) {
        throw signInError;
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送登录邮件失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>OutfitAI</Text>
        <Text style={styles.subtitle}>你的 AI 私人穿搭顾问</Text>

        {sent ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>请前往邮箱完成登录</Text>
            <Text style={styles.noticeText}>
              我们已向 {email.trim()} 发送 Magic Link。点击邮件中的链接后，App
              会自动恢复登录状态。
            </Text>
            <Text style={styles.noticeHint}>
              若未自动跳转，请确认已配置 Deep Link：outfitai://auth/callback
            </Text>
          </View>
        ) : (
          <>
            <AppTextInput
              label="邮箱"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              error={error ?? undefined}
            />
            <AppButton
              title="发送 Magic Link"
              loading={loading}
              onPress={handleSendMagicLink}
            />
          </>
        )}

        {onLoginSuccess ? (
          <AppButton
            title="我已登录，刷新状态"
            variant="secondary"
            onPress={onLoginSuccess}
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  brand: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.foreground,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  notice: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
  },
  noticeText: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
  noticeHint: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
  },
});

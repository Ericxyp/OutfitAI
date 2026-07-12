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
import { useNavigation } from "@react-navigation/native";
import { AppButton } from "@/components/AppButton";
import { getWebUrl, isApiConfigured, uploadClosetImage } from "@/lib/api";
import { colors, spacing } from "@/lib/theme";
import * as Linking from "expo-linking";

export function AddClothingScreen() {
  const navigation = useNavigation();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("需要相册权限", "请允许访问相册以选择衣服图片。");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function handleUpload() {
    if (!imageUri) {
      Alert.alert("请先选择图片");
      return;
    }

    if (!isApiConfigured) {
      Alert.alert("未配置 API", "请设置 EXPO_PUBLIC_API_BASE_URL");
      return;
    }

    setUploading(true);
    try {
      await uploadClosetImage(imageUri);
      Alert.alert("添加成功", "衣服已加入衣橱，AI 已尝试自动识别属性。", [
        {
          text: "返回衣橱",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (err) {
      Alert.alert(
        "上传失败",
        err instanceof Error ? err.message : "请稍后重试"
      );
    } finally {
      setUploading(false);
    }
  }

  function handleOpenWeb() {
    void Linking.openURL(getWebUrl("/closet/add"));
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>添加衣服</Text>
      <Text style={styles.subtitle}>
        选择一张照片，服务端会自动识别并加入你的数字衣橱。
      </Text>

      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.preview} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>尚未选择图片</Text>
        </View>
      )}

      <AppButton title="从相册选择" variant="secondary" onPress={handlePickImage} />
      <AppButton
        title="上传并识别"
        loading={uploading}
        onPress={handleUpload}
        disabled={!imageUri}
      />

      <View style={styles.divider}>
        <Text style={styles.dividerText}>或</Text>
      </View>

      <AppButton
        title="在 Web 端添加（临时方案）"
        variant="ghost"
        onPress={handleOpenWeb}
      />
      <Text style={styles.hint}>
        若上传失败，可在浏览器打开 Web 版完成添加，数据会同步到同一账号。
      </Text>
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
  preview: {
    width: "100%",
    height: 280,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  placeholder: {
    width: "100%",
    height: 280,
    borderRadius: 12,
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
  divider: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  dividerText: {
    color: colors.muted,
    fontSize: 14,
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    textAlign: "center",
  },
});

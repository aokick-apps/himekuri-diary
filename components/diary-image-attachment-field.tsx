import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  getDiaryImageDraftUri,
  isDiaryImageAttachmentSupported,
  pickDiaryImageAsync,
  type DiaryImageDraft,
} from '@/utils/diary-images';
import { MAX_DIARY_IMAGES_PER_ENTRY } from '@/utils/diary-storage';

const THUMBNAIL_SIZE = 72;

export const IMAGE_PERMISSION_DENIED_TITLE = '写真へのアクセスが許可されていません';
export const IMAGE_PERMISSION_DENIED_MESSAGE =
  '写真を添付するには、端末の設定アプリからこのアプリの写真へのアクセスを許可してください。';

// 日記の入力画面で使う添付画像の欄。上限枚数までは「写真を添付」、添付済みの画像には差し替え・削除を出す
export function DiaryImageAttachmentField({
  drafts,
  onChange,
  disabled = false,
}: {
  drafts: DiaryImageDraft[];
  onChange: (drafts: DiaryImageDraft[]) => void;
  disabled?: boolean;
}) {
  const tintColor = useThemeColor({}, 'tint');
  const iconColor = useThemeColor({}, 'icon');
  const errorColor = useThemeColor({}, 'error');

  if (!isDiaryImageAttachmentSupported()) {
    return null;
  }

  // indexを指定した場合はその画像を差し替え、未指定なら末尾に追加する
  const pickInto = async (index?: number) => {
    try {
      const result = await pickDiaryImageAsync();
      if (result.status === 'denied') {
        Alert.alert(IMAGE_PERMISSION_DENIED_TITLE, IMAGE_PERMISSION_DENIED_MESSAGE);
        return;
      }
      if (result.status === 'canceled') {
        return;
      }
      const picked: DiaryImageDraft = { kind: 'picked', uri: result.uri };
      onChange(
        index === undefined
          ? [...drafts, picked]
          : drafts.map((draft, i) => (i === index ? picked : draft)),
      );
    } catch {
      Alert.alert('写真を選択できませんでした', 'もう一度お試しください。');
    }
  };

  const remove = (index: number) => {
    onChange(drafts.filter((_, i) => i !== index));
  };

  return (
    <View style={styles.container}>
      {drafts.map((draft, index) => (
        <View key={getDiaryImageDraftUri(draft)} style={styles.item}>
          <Image
            source={{ uri: getDiaryImageDraftUri(draft) }}
            style={[styles.thumbnail, { borderColor: iconColor }]}
            accessibilityRole="image"
            accessibilityLabel="添付した写真"
          />
          <View style={styles.itemActions}>
            <Pressable
              onPress={() => pickInto(index)}
              disabled={disabled}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="添付した写真を差し替える"
              accessibilityState={{ disabled }}
            >
              <ThemedText style={[styles.actionText, { color: tintColor }]}>差し替え</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => remove(index)}
              disabled={disabled}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="添付した写真を削除する"
              accessibilityState={{ disabled }}
            >
              <ThemedText style={[styles.actionText, { color: errorColor }]}>削除</ThemedText>
            </Pressable>
          </View>
        </View>
      ))}
      {drafts.length < MAX_DIARY_IMAGES_PER_ENTRY ? (
        <Pressable
          onPress={() => pickInto()}
          disabled={disabled}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="写真を添付"
          accessibilityState={{ disabled }}
          style={[styles.addButton, { borderColor: tintColor, opacity: disabled ? 0.5 : 1 }]}
        >
          <ThemedText style={[styles.actionText, { color: tintColor }]}>写真を添付</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 16,
  },
  addButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getDiaryImageFile } from '@/utils/diary-images';
import type { DiaryImage } from '@/utils/diary-storage';

const PREVIEW_HEIGHT = 180;

// 日記の閲覧時に添付画像を表示し、タップで全画面表示する
export function DiaryImagePreview({ image }: { image: DiaryImage }) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const iconColor = useThemeColor({}, 'icon');
  const insets = useSafeAreaInsets();
  const uri = getDiaryImageFile(image).uri;

  if (hasLoadError) {
    // 別の端末からインポートした日記など、参照先の画像ファイルがこの端末に無い場合
    return (
      <View style={[styles.missing, { borderColor: iconColor }]}>
        <ThemedText style={[styles.missingText, { color: iconColor }]}>
          添付した写真を表示できません
        </ThemedText>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setIsFullScreen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel="添付した写真"
        accessibilityHint="タップすると全画面で表示します"
      >
        <Image
          source={{ uri }}
          style={styles.preview}
          resizeMode="cover"
          onError={() => setHasLoadError(true)}
        />
      </Pressable>
      <Modal
        visible={isFullScreen}
        animationType="fade"
        onRequestClose={() => setIsFullScreen(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View style={styles.fullScreen} testID="diary-image-full-screen">
          <Image
            source={{ uri }}
            style={styles.fullScreenImage}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="添付した写真(全画面)"
          />
          <Pressable
            onPress={() => setIsFullScreen(false)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="閉じる"
            style={[styles.closeButton, { top: insets.top + 12 }]}
          >
            <ThemedText style={styles.closeButtonText} lightColor="#fff" darkColor="#fff">
              閉じる
            </ThemedText>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
    height: PREVIEW_HEIGHT,
    borderRadius: 8,
  },
  missing: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  missingText: {
    fontSize: 13,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  closeButtonText: {
    fontWeight: '600',
  },
});

import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

// iOSの複数行入力欄のキーボードには閉じるキーが無いため、キーボードの上に「完了」ボタンを表示する。
// 入力欄側の`inputAccessoryViewID`に同じ`nativeID`を指定して紐付ける(Androidは端末の戻る操作で閉じられる)
export function KeyboardDoneAccessory({ nativeID }: { nativeID: string }) {
  // ダークのtintは本文と同色で操作要素と判別しづらいため、リンク用のアクセント色を使う
  const accentColor = useThemeColor({}, 'link');
  const backgroundColor = useThemeColor({}, 'background');
  const iconColor = useThemeColor({}, 'icon');

  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={[styles.bar, { backgroundColor, borderTopColor: iconColor }]}>
        <Pressable
          onPress={() => Keyboard.dismiss()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="キーボードを閉じる"
          style={styles.button}
        >
          <ThemedText style={[styles.buttonText, { color: accentColor }]}>完了</ThemedText>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '600',
  },
});

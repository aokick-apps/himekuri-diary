import { useCallback, useState } from 'react';
import { Alert, Switch } from 'react-native';

import { settingsStyles } from '@/components/settings/settings-styles';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppLock } from '@/contexts/app-lock-context';
import { useThemeColor } from '@/hooks/use-theme-color';

// アプリ起動時・バックグラウンドから復帰した際に生体認証(またはOS標準パスコード)でロックする機能。
// 端末を家族・同僚と共有・一時的に貸す際の覗き見を防ぐ。既存ユーザーの体験を変えないよう既定値はOFF(オプトイン)
export function AppLockSection() {
  const { enabled, isSupported, setEnabled } = useAppLock();
  // ON/OFF切り替え(AsyncStorageへの永続化を伴う非同期処理)完了までの連続タップを防ぐ
  const [isTogglePending, setIsTogglePending] = useState(false);
  const errorColor = useThemeColor({}, 'error');

  const handleToggle = useCallback(
    (value: boolean) => {
      setIsTogglePending(true);
      setEnabled(value)
        .catch(() => {
          // setEnabledは永続化失敗時に例外を投げ直す(enabled自体は変更前に戻る)ため、
          // 捕捉してユーザーに案内しないと未処理のPromise rejectionになる
          Alert.alert(
            'アプリロックの設定に失敗しました',
            '設定を保存できませんでした。もう一度お試しください。',
          );
        })
        .finally(() => setIsTogglePending(false));
    },
    [setEnabled],
  );

  return (
    <ThemedView style={settingsStyles.section}>
      <ThemedText type="subtitle" style={settingsStyles.sectionTitle}>
        アプリロック
      </ThemedText>
      <ThemedView style={settingsStyles.toggleRow}>
        <ThemedText style={settingsStyles.toggleLabel}>
          起動時・復帰時に生体認証またはパスコードでロックする
        </ThemedText>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          disabled={isTogglePending || !isSupported}
          accessibilityLabel="アプリロック"
        />
      </ThemedView>
      {!isSupported && (
        <ThemedText style={[settingsStyles.fallbackText, { color: errorColor }]}>
          この端末では生体認証・パスコードが設定されていないため、アプリロックを利用できません。
        </ThemedText>
      )}
    </ThemedView>
  );
}

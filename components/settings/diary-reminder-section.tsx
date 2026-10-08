import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch } from 'react-native';

import { settingsStyles } from '@/components/settings/settings-styles';
import { TimeStepper } from '@/components/settings/time-stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useDiaryReminder } from '@/contexts/diary-reminder-context';
import { useThemeColor } from '@/hooks/use-theme-color';

// 分は1分刻みで細かく調整できてもあまり意味がないため、5分刻みで調整できるようにする
const REMINDER_MINUTE_STEP = 5;

// 日記を書き忘れないよう、毎日決まった時刻に端末通知でリマインドする機能の設定導線。
// 外部のPush通知サービスは使わず、expo-notificationsによる端末内のローカル通知スケジューリングのみで完結させる
export function DiaryReminderSection() {
  const { enabled, hour, minute, permissionStatus, isLoaded, setEnabled, setTime } =
    useDiaryReminder();
  // ON/OFF切り替え(通知許可のリクエストを伴う非同期処理)完了まで連続タップを防ぐ
  const [isTogglePending, setIsTogglePending] = useState(false);
  // 時刻変更(通知の再スケジュール登録を伴う非同期処理)完了までTimeStepperの連続タップを防ぐ
  const [isTimePending, setIsTimePending] = useState(false);
  const errorColor = useThemeColor({}, 'error');

  const handleToggle = useCallback(
    (value: boolean) => {
      setIsTogglePending(true);
      setEnabled(value)
        .catch(() => {
          // setEnabledは通知スケジュール登録失敗時に例外を投げ直す(enabled自体はOFFへ戻る)ため、
          // 捕捉してユーザーに案内しないと未処理のPromise rejectionになる
          Alert.alert(
            'リマインダーの設定に失敗しました',
            '通知を設定できませんでした。もう一度お試しください。',
          );
        })
        .finally(() => setIsTogglePending(false));
    },
    [setEnabled],
  );

  const handleScheduleFailure = useCallback(() => {
    // setTimeが再スケジュール失敗時に例外を投げ直す(enabled自体はOFFへ戻される)ため、
    // ここで必ず捕捉してユーザーへ失敗を案内する。捕捉しないと未処理のPromise rejectionになる
    Alert.alert(
      'リマインダー時刻の変更に失敗しました',
      '新しい時刻を通知に反映できませんでした。もう一度お試しください。',
    );
  }, []);

  const handleHourChange = useCallback(
    (delta: number) => {
      setIsTimePending(true);
      setTime((hour + delta + 24) % 24, minute)
        .catch(handleScheduleFailure)
        .finally(() => setIsTimePending(false));
    },
    [hour, minute, setTime, handleScheduleFailure],
  );

  const handleMinuteChange = useCallback(
    (delta: number) => {
      setIsTimePending(true);
      setTime(hour, (minute + delta + 60) % 60)
        .catch(handleScheduleFailure)
        .finally(() => setIsTimePending(false));
    },
    [hour, minute, setTime, handleScheduleFailure],
  );

  return (
    <ThemedView style={settingsStyles.section}>
      <ThemedText type="subtitle" style={settingsStyles.sectionTitle}>
        リマインダー
      </ThemedText>
      <ThemedView style={settingsStyles.toggleRow}>
        <ThemedText style={settingsStyles.toggleLabel}>毎日決まった時刻に通知する</ThemedText>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          disabled={isTogglePending}
          accessibilityLabel="日記リマインダー通知"
        />
      </ThemedView>
      <ThemedView style={styles.timeRow}>
        <ThemedText style={styles.timeRowLabel}>通知時刻</ThemedText>
        {/* 「時」「:」「分」を1つの折り返し単位にまとめ、コロンだけが行末に孤立しないようにする */}
        <ThemedView style={styles.timeControls}>
          <TimeStepper
            label="時"
            value={hour}
            onDecrease={() => handleHourChange(-1)}
            onIncrease={() => handleHourChange(1)}
            disabled={isTogglePending || isTimePending || permissionStatus === 'denied'}
          />
          <ThemedText style={styles.timeSeparator}>:</ThemedText>
          <TimeStepper
            label="分"
            value={minute}
            onDecrease={() => handleMinuteChange(-REMINDER_MINUTE_STEP)}
            onIncrease={() => handleMinuteChange(REMINDER_MINUTE_STEP)}
            disabled={isTogglePending || isTimePending || permissionStatus === 'denied'}
          />
        </ThemedView>
      </ThemedView>
      {permissionStatus === 'denied' && (
        <ThemedText style={[settingsStyles.fallbackText, { color: errorColor }]}>
          通知が許可されていないため、リマインダーを利用できません。端末の設定からこのアプリの通知を許可してください。
        </ThemedText>
      )}
      {isLoaded && !enabled && permissionStatus !== 'denied' && (
        // OFFのうちに時刻を決めてからONにできるよう操作は無効化せず、通知に反映される時刻だけ前向きに案内する
        <ThemedText style={styles.hintText}>
          リマインダーをONにすると、この時刻に通知します。
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  timeRowLabel: {
    marginRight: 4,
  },
  timeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeSeparator: {
    fontWeight: '600',
  },
  hintText: {
    marginTop: 12,
    fontSize: 13,
    // ThemedTextの既定lineHeight(24)だとこの文字サイズには間延びするため個別に詰める
    lineHeight: 18,
  },
});

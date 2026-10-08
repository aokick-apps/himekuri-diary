import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import {
  SAVE_TOAST_TEXT_COLOR,
  SaveToast,
  VARIANT_BACKGROUND_COLORS,
} from '@/components/save-toast';

// WCAG 2.xの相対輝度・コントラスト比の定義に従って算出する
function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const fullHex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(fullHex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe('SaveToast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the given message', () => {
    render(<SaveToast message="保存しました" onHide={jest.fn()} />);

    expect(screen.getByText('保存しました')).toBeTruthy();
  });

  it('renders an accessible action and calls it when pressed', () => {
    const onAction = jest.fn();
    render(
      <SaveToast
        message="日記を削除しました"
        onHide={jest.fn()}
        actionLabel="元に戻す"
        onAction={onAction}
      />,
    );

    const action = screen.getByRole('button', { name: '元に戻す' });
    fireEvent.press(action);

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('uses the success background color by default', () => {
    render(<SaveToast message="保存しました" onHide={jest.fn()} />);

    const toast = screen.getByTestId('save-toast');
    expect(StyleSheet.flatten(toast.props.style).backgroundColor).toBe('#2e7d32');
  });

  it('uses a distinct warning background color when variant is "warning"', () => {
    render(
      <SaveToast message="一部の日記データが破損しています" onHide={jest.fn()} variant="warning" />,
    );

    const toast = screen.getByTestId('save-toast');
    expect(StyleSheet.flatten(toast.props.style).backgroundColor).toBe('#bf360c');
  });

  it.each(['success', 'warning'] as const)(
    'keeps the "%s" background at WCAG AA contrast (4.5:1 or higher) against the white text',
    (variant) => {
      expect(
        contrastRatio(SAVE_TOAST_TEXT_COLOR, VARIANT_BACKGROUND_COLORS[variant]),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('computes contrast ratios that match known WCAG reference values (境界値: 算出ロジックの検証)', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    // 白文字に対して基準を満たさない色は4.5未満と判定される
    expect(contrastRatio('#fff', '#e65100')).toBeLessThan(4.5);
  });

  it('exposes accessibilityLiveRegion="polite" so screen readers announce the state change', () => {
    render(<SaveToast message="保存しました" onHide={jest.fn()} />);

    const toast = screen.getByTestId('save-toast');
    expect(toast.props.accessibilityLiveRegion).toBe('polite');
  });

  // `accessibilityLiveRegion="polite"`はAndroid専用のpropでiOS(VoiceOver)には効果がないため、
  // iOSでも読み上げられるよう`AccessibilityInfo.announceForAccessibility`を呼び出すことを検証する。
  // 実装は`process.env.EXPO_OS === 'ios'`の場合のみ呼び出すが、この値はbabel-preset-expo
  // (jest-expoのデフォルト設定では`platform: 'ios'`固定)によってビルド時にリテラル値へ
  // インライン化されるため、テスト実行中の書き換えは実装側の分岐に反映されない
  // (jest-expo/jest-preset.jsのbabelOpts参照)。そのため、iOS向けにインライン化された状態
  // (=常にiOS相当として振る舞う)でのアナウンス呼び出しのみを検証する。
  describe('iOSでのVoiceOverアナウンス', () => {
    // react-native標準のjestプリセットにより`AccessibilityInfo.announceForAccessibility`は
    // 既に自動モック化されたjest.fn()であり、その呼び出し履歴はこのdescribeブロックの外を
    // 含む他のテストから引き継がれてしまう。`spyOn`だけでは既存の呼び出し履歴はクリアされない
    // ため、各テストの検証対象になる呼び出しだけを正確にカウントできるよう
    // `mockClear()`を明示的に呼んでいる。
    it('calls AccessibilityInfo.announceForAccessibility with the message exactly once when the toast is shown', () => {
      const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      announceSpy.mockClear();

      render(<SaveToast message="保存しました" onHide={jest.fn()} />);

      expect(announceSpy).toHaveBeenCalledWith('保存しました');
      expect(announceSpy).toHaveBeenCalledTimes(1);

      announceSpy.mockRestore();
    });

    it('announces again when the message changes while still mounted', () => {
      const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      announceSpy.mockClear();

      const { rerender } = render(<SaveToast message="1件目のメッセージ" onHide={jest.fn()} />);
      expect(announceSpy).toHaveBeenCalledWith('1件目のメッセージ');

      rerender(<SaveToast message="2件目のメッセージ" onHide={jest.fn()} />);
      expect(announceSpy).toHaveBeenCalledWith('2件目のメッセージ');
      expect(announceSpy).toHaveBeenCalledTimes(2);

      announceSpy.mockRestore();
    });

    it('does not announce again when re-rendered with the same message (only onHide changes)', () => {
      // messageが変わっていない再レンダリングでは、依存配列(`[message]`)により
      // アナウンスのuseEffectが再実行されず、余計な読み上げが発生しないことを確認する
      // (境界値: `onHide`だけが変化するケース)。
      const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      announceSpy.mockClear();

      const { rerender } = render(<SaveToast message="保存しました" onHide={jest.fn()} />);
      expect(announceSpy).toHaveBeenCalledTimes(1);

      rerender(<SaveToast message="保存しました" onHide={jest.fn()} />);
      expect(announceSpy).toHaveBeenCalledTimes(1);

      announceSpy.mockRestore();
    });

    it('does not throw and does not announce when the toast is unmounted', () => {
      // アンマウント後にタイマー等の副作用で余計な呼び出しが発生しないことを確認する(異常系)
      const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      announceSpy.mockClear();

      const { unmount } = render(<SaveToast message="保存しました" onHide={jest.fn()} />);
      expect(announceSpy).toHaveBeenCalledTimes(1);

      expect(() => unmount()).not.toThrow();
      expect(announceSpy).toHaveBeenCalledTimes(1);

      announceSpy.mockRestore();
    });
  });

  it('calls onHide automatically after the auto-dismiss delay', () => {
    const onHide = jest.fn();
    render(<SaveToast message="保存しました" onHide={onHide} />);

    expect(onHide).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('does not call onHide before the auto-dismiss delay has elapsed (boundary)', () => {
    const onHide = jest.fn();
    render(<SaveToast message="保存しました" onHide={onHide} />);

    act(() => {
      jest.advanceTimersByTime(2499);
    });

    expect(onHide).not.toHaveBeenCalled();
  });

  it('uses a custom auto-dismiss delay', () => {
    const onHide = jest.fn();
    render(<SaveToast message="削除しました" onHide={onHide} autoHideDelayMs={5000} />);

    act(() => {
      jest.advanceTimersByTime(4999);
    });
    expect(onHide).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('keeps the toast visible when auto-dismiss is disabled', () => {
    const onHide = jest.fn();
    render(<SaveToast message="復元しています" onHide={onHide} autoHideDelayMs={null} />);

    act(() => {
      jest.advanceTimersByTime(30000);
    });

    expect(onHide).not.toHaveBeenCalled();
  });

  it('resets the auto-dismiss timer when the message changes while still mounted', () => {
    const onHide = jest.fn();
    const { rerender } = render(<SaveToast message="1件目のメッセージ" onHide={onHide} />);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    // まだ1件目のタイマーが完了する前に、新しいメッセージへ切り替わったことを想定する
    rerender(<SaveToast message="2件目のメッセージ" onHide={onHide} />);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    // 2件目のタイマーはまだ2000ms分しか経過していないため呼ばれない
    expect(onHide).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

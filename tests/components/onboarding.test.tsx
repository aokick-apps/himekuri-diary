import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, Modal, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Onboarding } from '@/components/onboarding';
import { OnboardingColors } from '@/constants/onboarding-colors';
import { ONBOARDING_SLIDES } from '@/constants/onboarding-slides';

let mockColorScheme: 'light' | 'dark' = 'light';
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockColorScheme,
}));

const INSETS = { top: 44, left: 0, right: 0, bottom: 34 };

function renderWithInsets(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: INSETS }}
    >
      {ui}
    </SafeAreaProvider>,
  );
}

describe('Onboarding', () => {
  it('passes visible=false to the Modal when hidden (正常系: 判定待ち状態)', () => {
    render(<Onboarding visible={false} onFinish={jest.fn()} />);

    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
  });

  it('sets statusBarTranslucent and navigationBarTranslucent on the Modal', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    const modal = screen.UNSAFE_getByType(Modal);
    expect(modal.props.statusBarTranslucent).toBe(true);
    expect(modal.props.navigationBarTranslucent).toBe(true);
  });

  it('shows the app title, the first slide and the primary button on first display (正常系: 初回表示)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    expect(screen.getByText('ひめくり日記')).toBeTruthy();
    expect(screen.getByText('毎日をひとことで残す')).toBeTruthy();
    expect(screen.getByText(ONBOARDING_SLIDES[0].title)).toBeTruthy();
    expect(screen.getByText(ONBOARDING_SLIDES[0].description)).toBeTruthy();
    expect(screen.getByText('スキップ')).toBeTruthy();
    expect(screen.getByText('次へ')).toBeTruthy();
    expect(screen.queryByLabelText('前のスライドに戻る')).toBeNull();
  });

  it('calls onFinish when "スキップ" is pressed (正常系: スキップ)', () => {
    const onFinish = jest.fn();
    render(<Onboarding visible={true} onFinish={onFinish} />);

    fireEvent.press(screen.getByText('スキップ'));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('does not call onFinish when "次へ" is pressed on a non-last slide (正常系: 次へ)', () => {
    const onFinish = jest.fn();
    render(<Onboarding visible={true} onFinish={onFinish} />);

    fireEvent.press(screen.getByText('次へ'));

    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByLabelText('2枚目のスライドへ移動').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('moves to the selected slide when a pagination dot is pressed (正常系: ドットから直接移動)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    fireEvent.press(screen.getByLabelText('3枚目のスライドへ移動'));

    expect(screen.getByLabelText('3枚目のスライドへ移動').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByLabelText('1枚目のスライドへ移動').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('renders one pagination dot per slide (境界値: ドット数)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    for (let i = 0; i < ONBOARDING_SLIDES.length; i += 1) {
      expect(screen.getByLabelText(`${i + 1}枚目のスライドへ移動`)).toBeTruthy();
    }
    expect(
      screen.queryByLabelText(`${ONBOARDING_SLIDES.length + 1}枚目のスライドへ移動`),
    ).toBeNull();
  });

  it('switches the button to "はじめる" on the last slide and back to "次へ" on another (境界値: 最終スライド)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    fireEvent.press(screen.getByLabelText(`${ONBOARDING_SLIDES.length}枚目のスライドへ移動`));
    expect(screen.getByText('はじめる')).toBeTruthy();
    expect(screen.queryByText('次へ')).toBeNull();

    fireEvent.press(screen.getByLabelText('1枚目のスライドへ移動'));
    expect(screen.getByText('次へ')).toBeTruthy();
    expect(screen.queryByText('はじめる')).toBeNull();
  });

  it('calls onFinish exactly once when "はじめる" is pressed after walking through all slides (正常系: 完了)', () => {
    const onFinish = jest.fn();
    render(<Onboarding visible={true} onFinish={onFinish} />);

    for (let i = 0; i < ONBOARDING_SLIDES.length - 1; i += 1) {
      fireEvent.press(screen.getByText('次へ'));
    }
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('はじめる'));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('keeps the skip button in place but hidden from touch and accessibility on the last slide (境界値: 最終スライドのスキップ)', () => {
    const onFinish = jest.fn();
    render(<Onboarding visible={true} onFinish={onFinish} />);

    const skip = screen.getByTestId('onboarding-skip');
    expect(StyleSheet.flatten(skip.props.style).opacity).toBe(1);
    expect(skip.props.accessibilityElementsHidden).toBe(false);

    fireEvent.press(screen.getByLabelText(`${ONBOARDING_SLIDES.length}枚目のスライドへ移動`));

    const hiddenSkip = screen.getByTestId('onboarding-skip', { includeHiddenElements: true });
    const style = StyleSheet.flatten(hiddenSkip.props.style);
    expect(style.opacity).toBe(0);
    expect(style.minHeight).toBe(44);
    expect(hiddenSkip.props.accessibilityElementsHidden).toBe(true);
    expect(hiddenSkip.props.importantForAccessibility).toBe('no-hide-descendants');
    fireEvent.press(hiddenSkip);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('keeps the pagination dots and skip button at least 44pt (受け入れ条件: タップ領域)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    const dotStyle = StyleSheet.flatten(screen.getByLabelText('1枚目のスライドへ移動').props.style);
    expect(dotStyle.width).toBeGreaterThanOrEqual(44);
    expect(dotStyle.height).toBeGreaterThanOrEqual(44);
    const skipStyle = StyleSheet.flatten(screen.getByTestId('onboarding-skip').props.style);
    expect(skipStyle.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('uses the dark palette when the color scheme is dark (正常系: ダーク配色)', () => {
    mockColorScheme = 'dark';
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    const style = StyleSheet.flatten(screen.getByTestId('onboarding-sheet').props.style);
    expect(style.backgroundColor).toBe(OnboardingColors.dark.sheet);
    mockColorScheme = 'light';
  });

  it('adds the safe area insets to the container top and the sheet bottom (正常系: インセット加算)', () => {
    renderWithInsets(<Onboarding visible={true} onFinish={jest.fn()} />);

    const container = StyleSheet.flatten(screen.getByTestId('onboarding-container').props.style);
    const sheet = StyleSheet.flatten(screen.getByTestId('onboarding-sheet').props.style);
    expect(container.paddingTop).toBe(INSETS.top);
    expect(sheet.paddingBottom).toBe(INSETS.bottom);
  });

  it('renders the slides in a horizontal paging list (正常系: ページ送り)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    const list = screen.getByTestId('onboarding-slides');
    expect(list.props.horizontal).toBe(true);
    expect(list.props.pagingEnabled).toBe(true);
  });

  it('calls onFinish when the modal requests to close (境界値: OS操作による閉じる)', () => {
    const onFinish = jest.fn();
    render(<Onboarding visible={true} onFinish={onFinish} />);

    screen.UNSAFE_getByType(Modal).props.onRequestClose();

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('resets to the first slide when the modal is dismissed (正常系: 再表示時は1枚目から)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    fireEvent.press(screen.getByLabelText('3枚目のスライドへ移動'));
    React.act(() => {
      screen.UNSAFE_getByType(Modal).props.onDismiss();
    });

    expect(screen.getByLabelText('1枚目のスライドへ移動').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('keeps slide keys unique (境界値: キーの一意性)', () => {
    const keys = ONBOARDING_SLIDES.map((slide) => slide.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Onboarding のスワイプ操作', () => {
  const pageWidth = () => Dimensions.get('window').width - 40;
  const lastIndex = ONBOARDING_SLIDES.length - 1;

  function swipe(startIndex: number, delta: number) {
    const list = screen.getByTestId('onboarding-slides');
    const startX = startIndex * pageWidth();
    fireEvent(list, 'scrollBeginDrag', { nativeEvent: { contentOffset: { x: startX } } });
    fireEvent(list, 'scrollEndDrag', { nativeEvent: { contentOffset: { x: startX + delta } } });
  }

  function expectSelected(index: number) {
    ONBOARDING_SLIDES.forEach((_, i) => {
      expect(
        screen.getByLabelText(`${i + 1}枚目のスライドへ移動`).props.accessibilityState,
      ).toEqual({ selected: i === index });
    });
  }

  it('moves to the next slide when dragged forward by exactly 50pt (境界値: 閾値ちょうど)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    swipe(0, 50);

    expectSelected(1);
  });

  it('stays on the current slide when dragged forward by 49pt (境界値: 閾値未満)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    swipe(0, 49);

    expectSelected(0);
  });

  it('moves to the previous slide when dragged backward by exactly 50pt (境界値: 逆方向の閾値)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('2枚目のスライドへ移動'));

    swipe(1, -50);

    expectSelected(0);
  });

  it('stays on the current slide when dragged backward by 49pt (境界値: 逆方向の閾値未満)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('2枚目のスライドへ移動'));

    swipe(1, -49);

    expectSelected(1);
  });

  it('does not go before the first slide when dragged backward on it (境界値: 先頭)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    swipe(0, -200);

    expectSelected(0);
  });

  it('does not go past the last slide nor call onFinish when dragged forward on it (境界値: 末尾)', () => {
    const onFinish = jest.fn();
    render(<Onboarding visible={true} onFinish={onFinish} />);
    fireEvent.press(screen.getByLabelText(`${ONBOARDING_SLIDES.length}枚目のスライドへ移動`));

    swipe(lastIndex, 200);

    expectSelected(lastIndex);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('moves only one slide even when dragged far (境界値: 大きなスワイプ)', () => {
    render(<Onboarding visible={true} onFinish={jest.fn()} />);

    swipe(0, pageWidth() * 2);

    expectSelected(1);
  });
});

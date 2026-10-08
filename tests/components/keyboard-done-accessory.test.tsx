import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { InputAccessoryView, Keyboard, Platform } from 'react-native';

import { KeyboardDoneAccessory } from '@/components/keyboard-done-accessory';

const originalOS = Platform.OS;

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

describe('KeyboardDoneAccessory', () => {
  afterEach(() => {
    setPlatform(originalOS);
    jest.restoreAllMocks();
  });

  it('renders a "完了" button above the keyboard linked by nativeID on iOS (正常系)', () => {
    setPlatform('ios');
    render(<KeyboardDoneAccessory nativeID="test-accessory" />);

    expect(screen.UNSAFE_getByType(InputAccessoryView).props.nativeID).toBe('test-accessory');
    expect(screen.getByRole('button', { name: 'キーボードを閉じる' })).toBeTruthy();
    expect(screen.getByText('完了')).toBeTruthy();
  });

  it('dismisses the keyboard when "完了" is pressed (正常系)', () => {
    setPlatform('ios');
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    render(<KeyboardDoneAccessory nativeID="test-accessory" />);

    fireEvent.press(screen.getByRole('button', { name: 'キーボードを閉じる' }));

    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  it('renders nothing on Android, where the system back action closes the keyboard (境界値: iOS以外)', () => {
    setPlatform('android');
    render(<KeyboardDoneAccessory nativeID="test-accessory" />);

    expect(screen.UNSAFE_queryAllByType(InputAccessoryView)).toHaveLength(0);
    expect(screen.queryByText('完了')).toBeNull();
  });
});

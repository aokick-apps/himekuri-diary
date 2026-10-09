import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { TimeStepper } from '@/components/settings/time-stepper';
import { Colors } from '@/constants/theme';

let mockColorScheme: 'light' | 'dark' = 'light';
jest.mock('@/contexts/theme-preference-context', () => ({
  useThemePreference: () => ({ colorScheme: mockColorScheme }),
}));

describe('TimeStepper', () => {
  it.each(['light', 'dark'] as const)(
    'uses the link color for the minus and plus labels in %s theme',
    (scheme) => {
      mockColorScheme = scheme;
      render(
        <TimeStepper
          label="時"
          value={21}
          onDecrease={jest.fn()}
          onIncrease={jest.fn()}
          disabled={false}
        />,
      );

      for (const label of ['−', '+']) {
        const style = StyleSheet.flatten(screen.getByText(label).props.style);
        expect(style.color).toBe(Colors[scheme].link);
      }
      mockColorScheme = 'light';
    },
  );
});

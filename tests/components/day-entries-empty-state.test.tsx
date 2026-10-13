import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { DayEntriesEmptyState, EMPTY_STATE_MESSAGE } from '@/components/day-entries-empty-state';
import { DIARY_LOAD_ERROR_MESSAGE } from '@/utils/diary-storage';

describe('DayEntriesEmptyState', () => {
  it('shows the empty message when there is no load error (正常系)', () => {
    render(<DayEntriesEmptyState hasLoadError={false} onRetry={jest.fn()} />);
    expect(screen.getByText(EMPTY_STATE_MESSAGE)).toBeTruthy();
    expect(screen.queryByLabelText('再試行')).toBeNull();
  });

  it('shows the error message and calls onRetry when retry is pressed (異常系)', () => {
    const onRetry = jest.fn();
    render(<DayEntriesEmptyState hasLoadError onRetry={onRetry} />);
    expect(screen.getByText(DIARY_LOAD_ERROR_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(EMPTY_STATE_MESSAGE)).toBeNull();
    fireEvent.press(screen.getByLabelText('再試行'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { DayEntryItem } from '@/components/day-entry-item';

const entry = { id: '1', text: '本文', createdAt: new Date(2026, 7, 15, 9, 0).toISOString() };

function renderItem() {
  const handlers = { onCopy: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn() };
  render(<DayEntryItem entry={entry} isHighlighted={false} {...handlers} />);
  return handlers;
}

describe('DayEntryItem', () => {
  it('gives every action button a touch target of at least 44pt', () => {
    renderItem();

    for (const name of ['日記本文をコピー', 'この日記を編集', 'この日記を削除']) {
      const style = StyleSheet.flatten(screen.getByRole('button', { name }).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
    }
  });

  it('places the delete button last, pushed to the opposite edge from copy and edit', () => {
    renderItem();

    const json = JSON.stringify(screen.toJSON());
    expect(json.indexOf('コピー')).toBeLessThan(json.indexOf('編集'));
    expect(json.indexOf('編集')).toBeLessThan(json.indexOf('削除'));
    const deleteStyle = StyleSheet.flatten(
      screen.getByRole('button', { name: 'この日記を削除' }).props.style,
    );
    expect(deleteStyle.marginRight).toBeLessThan(0);
  });

  it('calls only the matching handler for each button', () => {
    const { onCopy, onEdit, onDelete } = renderItem();

    fireEvent.press(screen.getByRole('button', { name: 'この日記を削除' }));
    expect(onDelete).toHaveBeenCalledWith(entry);
    expect(onCopy).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: '日記本文をコピー' }));
    fireEvent.press(screen.getByRole('button', { name: 'この日記を編集' }));
    expect(onCopy).toHaveBeenCalledWith(entry);
    expect(onEdit).toHaveBeenCalledWith(entry);
  });
});

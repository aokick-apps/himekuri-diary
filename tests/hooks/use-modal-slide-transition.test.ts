import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Dimensions } from 'react-native';

import { useModalSlideTransition } from '@/hooks/use-modal-slide-transition';

describe('useModalSlideTransition', () => {
  const originalWindow = Dimensions.get('window');

  afterEach(async () => {
    await act(async () => {
      Dimensions.set({ window: originalWindow, screen: originalWindow });
    });
    jest.restoreAllMocks();
  });

  it('mounts immediately (isMounted=true) when isOpen is initially true (正常系: 初期表示)', () => {
    const { result } = renderHook(() => useModalSlideTransition(true));

    expect(result.current.isMounted).toBe(true);
  });

  it('does not mount (isMounted=false) when isOpen is initially false (正常系: 初期非表示)', () => {
    const { result } = renderHook(() => useModalSlideTransition(false));

    expect(result.current.isMounted).toBe(false);
  });

  it('mounts (isMounted=true) once isOpen changes from false to true (正常系: 入場)', async () => {
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) => useModalSlideTransition(isOpen),
      { initialProps: { isOpen: false } },
    );
    expect(result.current.isMounted).toBe(false);

    act(() => {
      rerender({ isOpen: true });
    });

    await waitFor(() => expect(result.current.isMounted).toBe(true));
  });

  it('unmounts (isMounted=false) once the exit animation completes after isOpen changes to true→false (正常系: 退場)', async () => {
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) => useModalSlideTransition(isOpen),
      { initialProps: { isOpen: true } },
    );
    expect(result.current.isMounted).toBe(true);

    act(() => {
      rerender({ isOpen: false });
    });

    await waitFor(() => expect(result.current.isMounted).toBe(false));
  });

  it('remains mounted (isMounted=true) when isOpen flips back to true shortly after flipping to false (中断された退場からの再入場: 回帰確認)', async () => {
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) => useModalSlideTransition(isOpen),
      { initialProps: { isOpen: true } },
    );

    act(() => {
      rerender({ isOpen: false });
    });
    act(() => {
      rerender({ isOpen: true });
    });

    // 退場・再入場のどちらの経路を通っても、最終的にisOpen=trueである以上マウントされたままになる
    await waitFor(() => expect(result.current.isMounted).toBe(true));
    // 猶予をおいても、退場アニメーション完了によって誤ってfalseへ戻らないことを確認する
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(result.current.isMounted).toBe(true);
  });

  it('uses the current window height as the exit distance after the window is resized', async () => {
    const timingSpy = jest.spyOn(Animated, 'timing');
    const { rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) => useModalSlideTransition(isOpen),
      { initialProps: { isOpen: true } },
    );

    await act(async () => {
      const resizedWindow = { ...originalWindow, height: 1200 };
      Dimensions.set({ window: resizedWindow, screen: resizedWindow });
    });
    timingSpy.mockClear();

    act(() => {
      rerender({ isOpen: false });
    });

    expect(timingSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 1200 }),
    );
  });

  describe('モーション低減設定', () => {
    it('uses duration 0 when reduce motion is enabled', async () => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
      const { rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) => useModalSlideTransition(isOpen),
        { initialProps: { isOpen: false } },
      );
      await act(async () => {});
      const timingSpy = jest.spyOn(Animated, 'timing');

      act(() => {
        rerender({ isOpen: true });
      });

      expect(timingSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ duration: 0 }),
      );
    });

    it('uses the default duration when reduce motion is disabled', async () => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
      const { rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) => useModalSlideTransition(isOpen),
        { initialProps: { isOpen: false } },
      );
      await act(async () => {});
      const timingSpy = jest.spyOn(Animated, 'timing');

      act(() => {
        rerender({ isOpen: true });
      });

      expect(timingSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ duration: 220 }),
      );
    });

    it('follows reduceMotionChanged events and removes the listener on unmount', async () => {
      const remove = jest.fn();
      let listener: (enabled: boolean) => void = () => {};
      jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
        _name: string,
        handler: (enabled: boolean) => void,
      ) => {
        listener = handler;
        return { remove };
      }) as never);
      const { rerender, unmount } = renderHook(
        ({ isOpen }: { isOpen: boolean }) => useModalSlideTransition(isOpen),
        { initialProps: { isOpen: false } },
      );
      await act(async () => {});
      const timingSpy = jest.spyOn(Animated, 'timing');

      act(() => {
        listener(true);
      });
      act(() => {
        rerender({ isOpen: true });
      });

      expect(timingSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ duration: 0 }),
      );
      unmount();
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('falls back to the default duration when isReduceMotionEnabled rejects', async () => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('fail'));
      const { rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) => useModalSlideTransition(isOpen),
        { initialProps: { isOpen: false } },
      );
      await act(async () => {});
      const timingSpy = jest.spyOn(Animated, 'timing');

      act(() => {
        rerender({ isOpen: true });
      });

      expect(timingSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ duration: 220 }),
      );
    });

    it('ignores the isReduceMotionEnabled result that resolves after unmount', async () => {
      let resolve: (v: boolean) => void = () => {};
      jest
        .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
        .mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
      const { unmount } = renderHook(() => useModalSlideTransition(false));

      unmount();
      await act(async () => {
        resolve(true);
      });
    });

    it('unmounts after the exit animation completes when reduce motion is enabled (境界値: duration 0)', async () => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
      const { result, rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) => useModalSlideTransition(isOpen),
        { initialProps: { isOpen: true } },
      );
      await act(async () => {});

      act(() => {
        rerender({ isOpen: false });
      });

      await waitFor(() => expect(result.current.isMounted).toBe(false));
    });
  });
});

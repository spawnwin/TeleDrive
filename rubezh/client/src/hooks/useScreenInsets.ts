import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Shared content paddings so screens clear status bar and tab bar. */
export function useScreenInsets(opts?: { top?: boolean; bottomExtra?: number }) {
  const insets = useSafeAreaInsets();
  const top = opts?.top === false ? 0 : Math.max(insets.top, 8);
  const bottom = Math.max(insets.bottom, 8) + (opts?.bottomExtra ?? 24);
  return { top, bottom, left: Math.max(insets.left, 0), right: Math.max(insets.right, 0), insets };
}

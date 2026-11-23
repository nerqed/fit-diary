import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radii, Spacing, Typography } from '../theme';

const actionWidth = 88;

/** Reveal an explicit delete button. Scrolling vertically remains with the parent list. */
export function SwipeDeleteRow({ children, onDelete, label }: {
  children: ReactNode; onDelete: () => void; label: string;
}) {
  const [open, setOpen] = useState(false);
  const offset = useRef(new Animated.Value(0)).current;
  const settle = useCallback((next: boolean) => {
    setOpen(next);
    Animated.timing(offset, { toValue: next ? -actionWidth : 0, duration: 140, useNativeDriver: false }).start();
  }, [offset]);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
      Math.abs(dx) > 12 && Math.abs(dx) > 1.5 * Math.abs(dy) && (dx < 0 || open),
    onPanResponderGrant: () => offset.stopAnimation(),
    onPanResponderMove: (_, { dx }) => {
      offset.setValue(Math.max(-actionWidth, Math.min(0, (open ? -actionWidth : 0) + dx)));
    },
    onPanResponderRelease: (_, { dx }) => settle(open ? dx < actionWidth / 3 : dx < -actionWidth / 3),
    onPanResponderTerminate: () => settle(open),
  }), [offset, open, settle]);

  return (
    <View style={styles.clip}>
      <Animated.View accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        style={[styles.action, { transform: [{ translateX: Animated.add(actionWidth, offset) }] }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={label} style={styles.deleteButton}
          onPress={() => { settle(false); onDelete(); }}>
          <Text style={styles.deleteText}>Удалить</Text>
        </Pressable>
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: offset }] }}>
        {children}
        {open && <Pressable accessibilityRole="button" accessibilityLabel="Скрыть действие удаления"
          style={StyleSheet.absoluteFill} onPress={() => settle(false)} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  action: { position: 'absolute', right: 0, top: 0, bottom: 0, width: actionWidth, paddingLeft: Spacing.xs },
  deleteButton: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.red, borderRadius: Radii.s },
  deleteText: { ...Typography.subheadSemibold, color: Colors.white },
});

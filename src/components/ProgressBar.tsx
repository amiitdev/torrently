import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

interface ProgressBarProps {
  progress: number;
  height?: number;
  color?: string;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
  indeterminate?: boolean;
}

export function ProgressBar({
  progress,
  height = 6,
  color = colors.primary,
  trackColor = colors.progressTrack,
  style,
  indeterminate,
}: ProgressBarProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!indeterminate) {
      Animated.timing(anim, {
        toValue: Math.max(0, Math.min(1, progress)),
        duration: 220,
        useNativeDriver: false,
      }).start();
    }
  }, [progress, indeterminate, anim]);

  useEffect(() => {
    if (!indeterminate) {
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [indeterminate, anim]);

  const width = indeterminate
    ? anim.interpolate({ inputRange: [0, 1], outputRange: ['20%', '100%'] })
    : anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(Math.max(0, Math.min(1, progress)) * 100),
      }}
      style={[styles.track, { height, backgroundColor: trackColor, borderRadius: height / 2 }, style]}>
      <Animated.View
        style={[styles.fill, { width, backgroundColor: color, borderRadius: height / 2 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.pill,
  },
  fill: {
    height: '100%',
  },
});

export default ProgressBar;

"use client"

import React, { useEffect } from "react"
import { View, ViewStyle } from "react-native"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated"

import { useAppTheme } from "@/theme/context"

export interface SpinnerProps {
  /**
   * Size of the spinner (width and height)
   * @default 20
   */
  size?: number
  /**
   * Color of the spinner arc
   * If not provided, uses theme.colors.tint
   */
  color?: string
  /**
   * Thickness of the spinner arc
   * @default 2
   */
  strokeWidth?: number
  /**
   * Duration of one full rotation in milliseconds
   * @default 800
   */
  duration?: number
  /**
   * Optional shared rotation value to keep animation continuous across
   * component mounts/unmounts. If provided, this component will NOT
   * start or manage the animation; the caller is responsible for that.
   */
  sharedRotation?: SharedValue<number>
}

/**
 * A smooth, elegant spinning arc indicator.
 * Uses react-native-reanimated for 60fps performance.
 */
export function Spinner({
  size = 20,
  color,
  strokeWidth = 2,
  duration = 800,
  sharedRotation,
}: SpinnerProps) {
  const { theme } = useAppTheme()
  const internalRotation = useSharedValue(0)
  const rotation = sharedRotation ?? internalRotation

  const spinnerColor = color ?? theme.colors.tint

  useEffect(() => {
    if (sharedRotation) {
      // External rotation provided; assume caller manages animation lifecycle.
      return
    }
    internalRotation.value = withRepeat(
      withTiming(360, { duration, easing: Easing.linear }),
      -1,
      false,
    )
  }, [duration, internalRotation, sharedRotation])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))

  const $container: ViewStyle = {
    width: size,
    height: size,
    justifyContent: "center",
    alignItems: "center",
  }

  // Create a partial arc using border styling
  // We use transparent borders on 3 sides and colored on 1 side
  // with border-radius to create the arc effect
  const $spinner: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: strokeWidth,
    borderTopColor: spinnerColor,
    borderRightColor: spinnerColor,
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
  }

  return (
    <View style={$container}>
      <Animated.View style={[animatedStyle, $spinner]} />
    </View>
  )
}



import { useEffect, useRef, useMemo } from "react"
import { Animated, Easing, StyleSheet, View, ViewStyle, StyleProp } from "react-native"
import { LinearGradient } from "expo-linear-gradient"

import { useAppTheme } from "@/theme/context"

export type AudioBarsStatus = "idle" | "connecting" | "listening" | "playing" | "error"

// Opalstone gradient colors - WCAG AA compliant (3:1+ contrast)
const OPAL_COLORS = {
  rose: "#C45B84",
  lavender: "#8B6AAE",
  aqua: "#2E9B8B",
  mint: "#3A9D6E",
  skyBlue: "#4A7FB5",
  lilac: "#9B6BA6",
}

type AudioBarsProps = {
  /** Input audio level (mic) 0-1 */
  inputLevel?: number
  /** Output audio level (AI speaking) 0-1 */
  outputLevel?: number
  /** Current status */
  status?: AudioBarsStatus
  /** Number of bars to show */
  barCount?: number
  /** Height of the container */
  height?: number
  /** Width of the container */
  width?: number
  /** Style overrides */
  style?: StyleProp<ViewStyle>
}

const clamp01 = (value?: number) => Math.min(1, Math.max(0, value ?? 0))

// Generate deterministic "random" offsets for each bar to create variety
const getBarOffset = (index: number, seed: number) => {
  return ((index * 7 + seed * 13) % 17) / 17
}

// Get gradient colors for each bar based on its position
const getBarGradientColors = (index: number, barCount: number): [string, string] => {
  const colors = [
    [OPAL_COLORS.rose, OPAL_COLORS.lavender],
    [OPAL_COLORS.lavender, OPAL_COLORS.skyBlue],
    [OPAL_COLORS.skyBlue, OPAL_COLORS.aqua],
    [OPAL_COLORS.aqua, OPAL_COLORS.mint],
    [OPAL_COLORS.mint, OPAL_COLORS.lilac],
    [OPAL_COLORS.lilac, OPAL_COLORS.rose],
  ]
  const colorIndex = Math.floor((index / barCount) * colors.length) % colors.length
  return colors[colorIndex] as [string, string]
}

export function AudioBars({
  inputLevel = 0,
  outputLevel = 0,
  status = "idle",
  barCount = 5,
  height = 32,
  width = 48,
  style,
}: AudioBarsProps) {
  const { theme } = useAppTheme()

  // Create animated values for each bar
  const barAnims = useRef<Animated.Value[]>(
    Array.from({ length: barCount }, () => new Animated.Value(0.15)),
  ).current

  // Idle pulse animation
  const idlePulse = useRef(new Animated.Value(0)).current

  // Start idle pulse animation when idle/listening
  useEffect(() => {
    if (status === "idle" || status === "listening" || status === "connecting") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(idlePulse, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(idlePulse, {
            toValue: 0,
            duration: 1200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ]),
      )
      loop.start()
      return () => loop.stop()
    } else {
      idlePulse.setValue(0)
    }
  }, [idlePulse, status])

  // Animate bars based on audio levels
  useEffect(() => {
    const level = status === "playing" ? clamp01(outputLevel) : clamp01(inputLevel) * 0.5
    const isActive = status === "playing" || status === "listening"

    barAnims.forEach((anim, index) => {
      // Each bar gets a slightly different target based on its position
      const offset = getBarOffset(index, Date.now() % 1000)
      const baseHeight = isActive ? 0.2 : 0.15

      // Center bars should be taller when active
      const centerWeight = 1 - Math.abs(index - (barCount - 1) / 2) / ((barCount - 1) / 2)
      const centerBoost = centerWeight * 0.3

      // Calculate target height for this bar
      let targetHeight = baseHeight + level * (0.6 + centerBoost + offset * 0.2)

      // Add some randomization when playing for more organic feel
      if (status === "playing" && level > 0.1) {
        targetHeight *= 0.7 + Math.random() * 0.6
      }

      targetHeight = Math.min(1, Math.max(0.1, targetHeight))

      Animated.timing(anim, {
        toValue: targetHeight,
        duration: status === "playing" ? 80 : 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start()
    })
  }, [barAnims, barCount, inputLevel, outputLevel, status])

  // Determine if we should use opal gradient (for active states) or solid color
  const useOpalGradient = useMemo(() => {
    return status === "listening" || status === "playing" || status === "idle" || status === "connecting"
  }, [status])

  // Fallback solid color for error state
  const errorColor = theme.colors.error

  const barWidth = (width - (barCount - 1) * 3) / barCount // 3px gap between bars

  return (
    <View style={[styles.container, { height, width }, style]}>
      {barAnims.map((anim, index) => {
        // Interpolate idle pulse for subtle movement when not actively playing
        const idleOffset = getBarOffset(index, 42)
        const idleMultiplier = idlePulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1 + idleOffset * 0.3],
        })

        const animatedHeight =
          status === "playing"
            ? anim.interpolate({
                inputRange: [0, 1],
                outputRange: [height * 0.15, height],
              })
            : Animated.multiply(
                anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [height * 0.15, height],
                }),
                idleMultiplier,
              )

        const gradientColors = getBarGradientColors(index, barCount)

        return (
          <Animated.View
            key={index}
            style={[
              styles.bar,
              {
                width: barWidth,
                height: animatedHeight,
                borderRadius: barWidth / 2,
                overflow: "hidden",
              },
            ]}
          >
            {useOpalGradient ? (
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.barGradient}
              />
            ) : (
              <View style={[styles.barGradient, { backgroundColor: errorColor }]} />
            )}
          </Animated.View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 4,
  },
  barGradient: {
    flex: 1,
    width: "100%",
  },
  container: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 3,
    justifyContent: "center",
  },
})

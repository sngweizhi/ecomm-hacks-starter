import { useEffect, useMemo, useRef } from "react"
import { Animated, Easing, StyleSheet, View, ViewStyle, StyleProp } from "react-native"

import { useAppTheme } from "@/theme/context"

export type AudioOrbStatus = "idle" | "connecting" | "listening" | "playing" | "error"

type AudioOrbProps = {
  inputLevel?: number
  outputLevel?: number
  status?: AudioOrbStatus
  size?: number
  style?: StyleProp<ViewStyle>
}

const clamp01 = (value?: number) => Math.min(1, Math.max(0, value ?? 0))

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "")
  const bigint = parseInt(normalized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function AudioOrb({
  inputLevel = 0,
  outputLevel = 0,
  status = "idle",
  size = 84,
  style,
}: AudioOrbProps) {
  const { theme } = useAppTheme()
  const inputAnim = useRef(new Animated.Value(0)).current
  const outputAnim = useRef(new Animated.Value(0)).current
  const spinAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(inputAnim, {
      toValue: clamp01(inputLevel),
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [inputAnim, inputLevel])

  useEffect(() => {
    Animated.timing(outputAnim, {
      toValue: clamp01(outputLevel),
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [outputAnim, outputLevel])

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    spin.start()
    return () => {
      spin.stop()
      spinAnim.setValue(0)
    }
  }, [spinAnim])

  const baseColor = useMemo(() => {
    switch (status) {
      case "error":
        return theme.colors.error
      case "connecting":
        return theme.colors.palette.secondary300
      case "playing":
        return theme.colors.palette.accent400
      case "listening":
        return theme.colors.tint
      default:
        return theme.colors.palette.neutral500
    }
  }, [status, theme.colors.error, theme.colors.palette, theme.colors.tint])

  const inputEnergy = Math.pow(clamp01(inputLevel), 0.65)
  const outputEnergy = Math.pow(clamp01(outputLevel), 0.65)
  const combinedEnergy = 0.55 * outputEnergy + 0.45 * inputEnergy

  const glowColor = hexToRgba(baseColor, 0.35 + combinedEnergy * 0.25)
  const ringColor = hexToRgba(baseColor, 0.5 + combinedEnergy * 0.2)
  const coreColor = baseColor

  const outerScale = outputAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.45],
    extrapolate: "clamp",
  })

  const coreScale = inputAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.35],
    extrapolate: "clamp",
  })

  const glowOpacity = outputAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.9],
    extrapolate: "clamp",
  })

  const ringSpin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  })

  const idlePulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (status !== "idle") {
      idlePulse.stopAnimation()
      idlePulse.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idlePulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(idlePulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [idlePulse, status])

  const idleScale = idlePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  })

  const combinedOuterScale = Animated.multiply(outerScale, status === "idle" ? idleScale : 1)
  const combinedCoreScale = Animated.multiply(coreScale, status === "idle" ? idleScale : 1)

  const containerStyle = useMemo(
    () => [
      styles.container,
      {
        width: size,
        height: size,
      },
      style,
    ],
    [size, style],
  )

  const outerStyle = useMemo(
    () => [
      styles.outer,
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: glowColor,
        shadowColor: glowColor,
        opacity: glowOpacity,
      },
    ],
    [glowColor, glowOpacity, size],
  )

  const ringStyle = useMemo(
    () => [
      styles.ring,
      {
        width: size * 0.82,
        height: size * 0.82,
        borderRadius: (size * 0.82) / 2,
        backgroundColor: ringColor,
        transform: [{ rotate: ringSpin }],
      },
    ],
    [ringColor, ringSpin, size],
  )

  const coreStyle = useMemo(
    () => [
      styles.core,
      {
        width: size * 0.64,
        height: size * 0.64,
        borderRadius: (size * 0.64) / 2,
        backgroundColor: coreColor,
      },
    ],
    [coreColor, size],
  )

  return (
    <View style={containerStyle}>
      <Animated.View style={[outerStyle, { transform: [{ scale: combinedOuterScale }] }]} />
      <Animated.View style={[ringStyle, { transform: [{ scale: combinedOuterScale }] }]} />
      <Animated.View style={[coreStyle, { transform: [{ scale: combinedCoreScale }] }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    opacity: 0.95,
    position: "absolute",
  },
  outer: {
    elevation: 8,
    opacity: 0.9,
    position: "absolute",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
  },
  ring: {
    opacity: 0.8,
    position: "absolute",
  },
})


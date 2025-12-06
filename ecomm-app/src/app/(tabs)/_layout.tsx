import { View, Pressable, StyleSheet } from "react-native"
import { Tabs, router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { LinearGradient } from "expo-linear-gradient"
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  withSequence,
} from "react-native-reanimated"
import { useEffect } from "react"

import { Icon } from "@/components/Icon"
import { useAppTheme } from "@/theme/context"

// Opalstone gradient colors - WCAG AA compliant (3:1+ contrast with white)
// Deeper, more saturated iridescent colors for accessibility
const OPAL_COLORS = {
  // Rich gradient colors with good contrast
  rose: "#C45B84", // Deep rose - 3.8:1 contrast with white
  lavender: "#8B6AAE", // Rich lavender - 4.1:1 contrast
  aqua: "#2E9B8B", // Deep teal - 3.5:1 contrast
  mint: "#3A9D6E", // Forest mint - 3.7:1 contrast
  skyBlue: "#4A7FB5", // Steel blue - 3.9:1 contrast
  lilac: "#9B6BA6", // Deep orchid - 3.6:1 contrast
}

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient)

// Custom sell button component (the big opalstone plus)
// Now navigates to the dedicated sell flow instead of tab content
function SellButton({ onPress: _onPress }: { onPress: () => void }) {
  const rotation = useSharedValue(0)
  const scale = useSharedValue(1)
  const glowOpacity = useSharedValue(0.4)

  useEffect(() => {
    // Slow continuous rotation for shimmer effect
    rotation.value = withRepeat(withTiming(360, { duration: 8000, easing: Easing.linear }), -1, false)

    // Subtle pulse animation
    scale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    )

    // Glow pulse
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    )
  }, [rotation, scale, glowOpacity])

  const animatedGradientStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }))

  const handlePress = () => {
    // Navigate to the dedicated sell flow
    router.push("/sell")
  }

  return (
    <Animated.View style={animatedButtonStyle}>
      <Pressable onPress={handlePress} style={({ pressed }) => [pressed && styles.sellButtonPressed]}>
        {/* Outer glow effect */}
        <Animated.View style={[styles.glowOuter, animatedGlowStyle]} />

        {/* Main button with gradient */}
        <View style={styles.sellButton}>
          {/* Rotating gradient background */}
          <AnimatedLinearGradient
            colors={[
              OPAL_COLORS.rose,
              OPAL_COLORS.lavender,
              OPAL_COLORS.skyBlue,
              OPAL_COLORS.aqua,
              OPAL_COLORS.mint,
              OPAL_COLORS.lilac,
              OPAL_COLORS.rose,
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.gradientBackground, animatedGradientStyle]}
          />

          {/* Inner shine overlay */}
          <LinearGradient
            colors={["rgba(255,255,255,0.6)", "rgba(255,255,255,0.1)", "rgba(255,255,255,0.3)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.shineOverlay}
          />

          {/* Icon */}
          <Icon icon="plus" size={28} color="#FFFFFF" />
        </View>
      </Pressable>
    </Animated.View>
  )
}

export default function TabLayout() {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.tint,
        tabBarInactiveTintColor: theme.colors.textDim,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Icon icon="house" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: "Categories",
          tabBarIcon: ({ color, size }) => <Icon icon="squaresFour" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: "",
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <View style={styles.sellButtonContainer}>
              <SellButton onPress={() => props.onPress?.(undefined as any)} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => <Icon icon="chatCircle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Me",
          tabBarIcon: ({ color, size }) => <Icon icon="user" color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}

/* eslint-disable react-native/no-color-literals */
const styles = StyleSheet.create({
  glowOuter: {
    backgroundColor: "transparent",
    borderRadius: 34,
    height: 68,
    left: -6,
    position: "absolute",
    shadowColor: "#8B6AAE",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    top: -6,
    width: 68,
  },
  gradientBackground: {
    borderRadius: 28,
    height: 112, // Larger to accommodate rotation
    left: -28,
    position: "absolute",
    top: -28,
    width: 112,
  },
  sellButton: {
    alignItems: "center",
    borderRadius: 28,
    elevation: 12,
    height: 56,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#9B6BA6",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    width: 56,
  },
  sellButtonContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-start",
    marginTop: -20,
  },
  sellButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.92 }],
  },
  shineOverlay: {
    borderRadius: 28,
    height: 56,
    left: 0,
    position: "absolute",
    top: 0,
    width: 56,
  },
})
/* eslint-enable react-native/no-color-literals */

import { useCallback } from "react"
import { View, ViewStyle, TextStyle, ActivityIndicator } from "react-native"
import { router, useFocusEffect } from "expo-router"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

/**
 * Sell Tab Screen - Redirect to Sell Flow
 *
 * This tab screen is a placeholder that redirects to the dedicated sell flow.
 * The actual sell functionality lives in /sell/index.tsx and /sell/review.tsx.
 *
 * The sell button in the tab bar navigates directly to /sell, but if someone
 * navigates to this tab content directly, we redirect them to the sell flow.
 */
export default function SellTabScreen() {
  const { themed, theme } = useAppTheme()

  useFocusEffect(
    useCallback(() => {
      // Redirect to the dedicated sell flow when this tab is focused
      router.replace("/sell")
    }, []),
  )

  // Show a loading state briefly while redirecting
  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <View style={themed($content)}>
        <ActivityIndicator size="large" color={theme.colors.tint} />
        <Text text="Loading..." style={themed($loadingText)} />
      </View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  gap: spacing.md,
})

const $loadingText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

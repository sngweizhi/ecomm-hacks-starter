import { View, ViewStyle, TextStyle, Pressable } from "react-native"
import { router } from "expo-router"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Icon } from "@/components/Icon"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export default function PurchasesScreen() {
  const { themed, theme } = useAppTheme()

  const handleBack = () => {
    router.back()
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      {/* Header */}
      <View style={themed($header)}>
        <Pressable onPress={handleBack} style={themed($backButton)}>
          <Icon icon="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text text="Purchase History" preset="heading" style={themed($headerTitle)} />
        <View style={themed($headerSpacer)} />
      </View>

      {/* Empty state placeholder */}
      <View style={themed($emptyContainer)}>
        <Icon icon="shoppingBag" size={64} color={theme.colors.textDim} />
        <Text text="No purchases yet" preset="heading" style={themed($emptyTitle)} />
        <Text
          text="When you buy something from a seller, your purchase history will appear here."
          style={themed($emptySubtitle)}
        />
      </View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
})

const $backButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.palette.neutral100,
  justifyContent: "center",
  alignItems: "center",
  marginRight: spacing.sm,
})

const $headerTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.text,
})

const $headerSpacer: ThemedStyle<ViewStyle> = () => ({
  width: 40,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: spacing.xl,
})

const $emptyTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  textAlign: "center",
  marginTop: spacing.md,
})

const $emptySubtitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  textAlign: "center",
  marginTop: spacing.sm,
})

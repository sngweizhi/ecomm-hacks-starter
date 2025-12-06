import { View, ViewStyle, TextStyle, Pressable, Switch } from "react-native"
import { router } from "expo-router"
import { useState } from "react"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Icon } from "@/components/Icon"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export default function SettingsScreen() {
  const { themed, theme } = useAppTheme()
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  const handleBack = () => {
    router.back()
  }

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      {/* Header */}
      <View style={themed($header)}>
        <Pressable onPress={handleBack} style={themed($backButton)}>
          <Icon icon="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text text="Settings" preset="heading" style={themed($headerTitle)} />
        <View style={themed($headerSpacer)} />
      </View>

      {/* Settings sections */}
      <View style={themed($section)}>
        <Text text="Notifications" style={themed($sectionTitle)} />
        <View style={themed($settingRow)}>
          <View style={themed($settingInfo)}>
            <Text text="Push Notifications" style={themed($settingLabel)} />
            <Text text="Receive alerts for messages and activity" style={themed($settingDescription)} />
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: theme.colors.palette.neutral300, true: theme.colors.tint }}
            thumbColor={theme.colors.palette.neutral100}
          />
        </View>
      </View>

      <View style={themed($section)}>
        <Text text="Account" style={themed($sectionTitle)} />
        <Pressable style={themed($settingRow)}>
          <View style={themed($settingInfo)}>
            <Text text="Edit Profile" style={themed($settingLabel)} />
            <Text text="Update your name and photo" style={themed($settingDescription)} />
          </View>
          <Icon icon="caretRight" size={20} color={theme.colors.textDim} />
        </Pressable>
        <Pressable style={themed($settingRow)}>
          <View style={themed($settingInfo)}>
            <Text text="Campus" style={themed($settingLabel)} />
            <Text text="Change your campus location" style={themed($settingDescription)} />
          </View>
          <Icon icon="caretRight" size={20} color={theme.colors.textDim} />
        </Pressable>
      </View>

      <View style={themed($section)}>
        <Text text="Support" style={themed($sectionTitle)} />
        <Pressable style={themed($settingRow)}>
          <View style={themed($settingInfo)}>
            <Text text="Help Center" style={themed($settingLabel)} />
          </View>
          <Icon icon="caretRight" size={20} color={theme.colors.textDim} />
        </Pressable>
        <Pressable style={themed($settingRow)}>
          <View style={themed($settingInfo)}>
            <Text text="Privacy Policy" style={themed($settingLabel)} />
          </View>
          <Icon icon="caretRight" size={20} color={theme.colors.textDim} />
        </Pressable>
        <Pressable style={themed($settingRow)}>
          <View style={themed($settingInfo)}>
            <Text text="Terms of Service" style={themed($settingLabel)} />
          </View>
          <Icon icon="caretRight" size={20} color={theme.colors.textDim} />
        </Pressable>
      </View>

      <View style={themed($versionContainer)}>
        <Text text="Version 1.0.0" style={themed($versionText)} />
      </View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flexGrow: 1,
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

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 13,
  fontWeight: "600",
  color: colors.textDim,
  textTransform: "uppercase",
  marginBottom: spacing.sm,
})

const $settingRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
  padding: spacing.md,
  marginBottom: spacing.sm,
})

const $settingInfo: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $settingLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "500",
  color: colors.text,
})

const $settingDescription: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.textDim,
  marginTop: 2,
})

const $versionContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingVertical: spacing.xl,
})

const $versionText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.textDim,
})

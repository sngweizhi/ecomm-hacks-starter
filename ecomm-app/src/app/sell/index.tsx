import { useState } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  Pressable,
} from "react-native"
import { router } from "expo-router"
import * as ImagePicker from "expo-image-picker"

import { ProductCamera } from "@/components/ProductCamera"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Header } from "@/components/Header"
import { Button } from "@/components/Button"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

/**
 * Sell Flow - Video Capture Screen
 *
 * This screen allows users to record or select a video of their item.
 * Currently uses a placeholder for the camera since expo-camera requires
 * additional native setup. The flow supports:
 *
 * 1. Recording a video (placeholder - tap to simulate)
 * 2. Choosing from gallery
 *
 * After capture, navigates to the review screen.
 */
export default function SellCaptureScreen() {
  const { themed, theme } = useAppTheme()
  const [isProcessing, setIsProcessing] = useState(false)
  const [detectedLabel, setDetectedLabel] = useState<string | undefined>(undefined)

  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY

  const handleChooseFromGallery = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== "granted") {
        // In a real app, show a proper permission denied message
        console.log("Media library permission denied")
        return
      }

      // Launch image picker for videos
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: true,
        quality: 1,
        videoMaxDuration: 60, // 60 second max
      })

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0]
        router.push({
          pathname: "/sell/review",
          params: {
            videoUri: asset.uri,
            thumbnailUri: asset.uri, // For videos, use the uri as placeholder thumbnail
            source: "gallery",
            duration: String(asset.duration || 0),
          },
        })
      }
    } catch (error) {
      console.error("Error picking video:", error)
    }
  }

  const handleClose = () => {
    router.back()
  }

  const handleContinue = () => {
    if (!apiKey) {
      console.warn("Missing EXPO_PUBLIC_GEMINI_API_KEY")
    }

    setIsProcessing(true)
    setTimeout(() => {
      setIsProcessing(false)
      router.push({
        pathname: "/sell/review",
        params: {
          videoUri: "placeholder://gemini-live",
          source: "gemini-live",
          detectedLabel,
        },
      })
    }, 400)
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <Header
        title="Record Video"
        leftIcon="x"
        onLeftPress={handleClose}
        containerStyle={themed($header)}
      />

      {/* Camera Preview Area */}
      <View style={themed($cameraContainer)}>
        {apiKey ? (
          <ProductCamera apiKey={apiKey} onDetection={setDetectedLabel} />
        ) : (
          <View style={themed($cameraPlaceholder)}>
            <Text
              text="Add EXPO_PUBLIC_GEMINI_API_KEY to enable live detection."
              style={themed($placeholderSubtext)}
            />
          </View>
        )}
      </View>

      {/* Tips Section */}
      <View style={themed($tipsContainer)}>
        <Text text="Tips for a great listing:" style={themed($tipsTitle)} />
        <View style={themed($tipRow)}>
          <Text text="📐" style={themed($tipEmoji)} />
          <Text text="Show item from multiple angles" style={themed($tipText)} />
        </View>
        <View style={themed($tipRow)}>
          <Text text="💡" style={themed($tipEmoji)} />
          <Text text="Use good lighting" style={themed($tipText)} />
        </View>
        <View style={themed($tipRow)}>
          <Text text="🗣️" style={themed($tipEmoji)} />
          <Text text="Mention condition and asking price" style={themed($tipText)} />
        </View>
      </View>

      {/* Controls */}
      <View style={themed($controlsContainer)}>
        {/* Gallery Button */}
        <Pressable
          style={({ pressed }) => [themed($sideButton), pressed && themed($sideButtonPressed)]}
          onPress={handleChooseFromGallery}
          disabled={isProcessing}
        >
          <Text text="🖼️" style={themed($sideButtonIcon)} />
          <Text text="Gallery" style={themed($sideButtonLabel)} />
        </Pressable>

        <Button
          text={isProcessing ? "Preparing..." : "Continue"}
          preset="reversed"
          onPress={handleContinue}
          disabled={isProcessing}
          style={themed($continueButton)}
        />
      </View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $header: ThemedStyle<ViewStyle> = () => ({})

const $cameraContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
})

const $cameraPlaceholder: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.palette.neutral800,
  borderRadius: 16,
  justifyContent: "center",
  alignItems: "center",
  overflow: "hidden",
})

const $placeholderSubtext: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral500,
  fontSize: 14,
  textAlign: "center",
  paddingHorizontal: spacing.xl,
})

const $tipsContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
})

const $tipsTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.text,
  fontWeight: "600",
  fontSize: 14,
  marginBottom: spacing.sm,
})

const $tipRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  marginBottom: spacing.xs,
})

const $tipEmoji: ThemedStyle<TextStyle> = () => ({
  fontSize: 14,
})

const $tipText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 13,
})

const $controlsContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center",
  gap: spacing.xxl,
  paddingVertical: spacing.lg,
  paddingBottom: spacing.xl,
})

const $sideButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs,
  padding: spacing.sm,
  borderRadius: 12,
})

const $sideButtonPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.7,
})

const $sideButtonIcon: ThemedStyle<TextStyle> = () => ({
  fontSize: 24,
})

const $sideButtonLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 12,
})

const $continueButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  marginHorizontal: spacing.md,
})

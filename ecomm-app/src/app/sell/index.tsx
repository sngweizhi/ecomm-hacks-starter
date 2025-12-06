import { useCallback, useEffect, useState } from "react"
import { View, ViewStyle, TextStyle, Pressable, ScrollView } from "react-native"
import * as ImagePicker from "expo-image-picker"
import { router } from "expo-router"
import { useAction } from "convex/react"

import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { ProductCamera } from "@/components/ProductCamera"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../../convex/_generated/api"

type ListingCreatedResult = {
  listingId: Id<"listings">
  title: string
  imageUrl?: string
}

/**
 * Sell Flow - Video Capture Screen
 *
 * This screen provides a camera preview that streams to Gemini Live API.
 * When users indicate they want to sell an item (via voice), Gemini
 * automatically creates a listing via function calling.
 *
 * Features:
 * - Live camera + audio streaming to Gemini
 * - Voice-activated listing creation
 * - AI-generated professional product photos
 * - Automatic navigation to review screen
 */
export default function SellCaptureScreen() {
  const { themed } = useAppTheme()
  const [apiKey, setApiKey] = useState<string | undefined>(undefined)
  const [apiKeyError, setApiKeyError] = useState<string | undefined>(undefined)
  const [conversationText, setConversationText] = useState<string>("")
  const getGeminiApiKey = useAction(api.gemini.getGeminiApiKey)

  // Fetch API key from Convex (keeps it out of the bundle)
  useEffect(() => {
    getGeminiApiKey({})
      .then(setApiKey)
      .catch((error) => {
        console.error("Failed to fetch Gemini API key:", error)
        setApiKeyError(error.message || "Failed to load API key")
      })
  }, [getGeminiApiKey])

  // Handle listing created - navigate to review screen
  const handleListingCreated = useCallback((result: ListingCreatedResult) => {
    console.log("[SellCapture] Listing created, navigating to review:", result.listingId)
    router.push({
      pathname: "/sell/review",
      params: {
        listingId: result.listingId,
        source: "gemini-live",
      },
    })
  }, [])

  // Handle text messages from Gemini (for displaying conversation)
  const handleTextMessage = useCallback((text: string) => {
    setConversationText((prev) => (prev ? `${prev}\n${text}` : text))
  }, [])

  const handleChooseFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== "granted") {
        console.log("Media library permission denied")
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: true,
        quality: 1,
        videoMaxDuration: 60,
      })

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0]
        router.push({
          pathname: "/sell/review",
          params: {
            videoUri: asset.uri,
            thumbnailUri: asset.uri,
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

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <Header
        title="Create Listing"
        leftIcon="x"
        onLeftPress={handleClose}
        containerStyle={themed($header)}
      />

      {/* Camera Preview Area */}
      <View style={themed($cameraContainer)}>
        {apiKey ? (
          <ProductCamera
            apiKey={apiKey}
            onListingCreated={handleListingCreated}
            onTextMessage={handleTextMessage}
          />
        ) : apiKeyError ? (
          <View style={themed($cameraPlaceholder)}>
            <Text
              text={`Error loading API key: ${apiKeyError}`}
              style={themed($placeholderSubtext)}
            />
          </View>
        ) : (
          <View style={themed($cameraPlaceholder)}>
            <Text text="Loading camera..." style={themed($placeholderSubtext)} />
          </View>
        )}
      </View>

      {/* Conversation display */}
      {conversationText ? (
        <ScrollView style={themed($conversationContainer)}>
          <Text text={conversationText} style={themed($conversationText)} />
        </ScrollView>
      ) : (
        /* Tips Section */
        <View style={themed($tipsContainer)}>
          <Text text="How to list an item:" style={themed($tipsTitle)} />
          <View style={themed($tipRow)}>
            <Text text="📸" style={themed($tipEmoji)} />
            <Text text="Point camera at your item" style={themed($tipText)} />
          </View>
          <View style={themed($tipRow)}>
            <Text text="🗣️" style={themed($tipEmoji)} />
            <Text text='Say "I want to sell this for $X"' style={themed($tipText)} />
          </View>
          <View style={themed($tipRow)}>
            <Text text="✨" style={themed($tipEmoji)} />
            <Text text="AI creates a professional listing" style={themed($tipText)} />
          </View>
          <View style={themed($tipRow)}>
            <Text text="✅" style={themed($tipEmoji)} />
            <Text text="Review and publish!" style={themed($tipText)} />
          </View>
        </View>
      )}

      {/* Controls */}
      <View style={themed($controlsContainer)}>
        {/* Gallery Button */}
        <Pressable
          style={({ pressed }) => [themed($sideButton), pressed && themed($sideButtonPressed)]}
          onPress={handleChooseFromGallery}
        >
          <Text text="🖼️" style={themed($sideButtonIcon)} />
          <Text text="Gallery" style={themed($sideButtonLabel)} />
        </Pressable>

        {/* Spacer */}
        <View style={themed($spacer)} />
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

const $cameraPlaceholder: ThemedStyle<ViewStyle> = ({ colors }) => ({
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

const $conversationContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  maxHeight: 120,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.sm,
})

const $conversationText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 13,
  fontStyle: "italic",
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

const $sideButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
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

const $spacer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

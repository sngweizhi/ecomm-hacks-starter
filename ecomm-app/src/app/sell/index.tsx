import { useCallback, useEffect, useRef, useState } from "react"
import { View, ViewStyle, TextStyle, Pressable } from "react-native"
import * as ImagePicker from "expo-image-picker"
import { router } from "expo-router"
import { useAction } from "convex/react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  Stop,
  Camera as CameraIcon,
  Microphone,
  Sparkle,
  CheckCircle,
  Images,
  X,
  PencilSimple,
  Play,
} from "phosphor-react-native"

import type { Id } from "../../../convex/_generated/dataModel"
import { AudioBars, type AudioBarsStatus } from "@/components/AudioBars"
import { Header } from "@/components/Header"
import { ProductCamera } from "@/components/ProductCamera"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { loadString, saveString } from "@/utils/storage"
import type { GeminiLiveStatus } from "@/hooks/useGeminiLive"

import { api } from "../../../convex/_generated/api"

const HAS_SEEN_INSTRUCTIONS_KEY = "sell.hasSeenInstructions"

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
  const { themed, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [apiKey, setApiKey] = useState<string | undefined>(undefined)
  const [apiKeyError, setApiKeyError] = useState<string | undefined>(undefined)
  const [draftListingIds, setDraftListingIds] = useState<Id<"listings">[]>([])
  const [hasNavigatedAfterStop, setHasNavigatedAfterStop] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false)
  const [audioLevels, setAudioLevels] = useState<{
    inputLevel: number
    outputLevel: number
    status: AudioBarsStatus
  }>({
    inputLevel: 0,
    outputLevel: 0,
    status: "idle",
  })
  const [geminiStatus, setGeminiStatus] = useState<GeminiLiveStatus>("idle")
  const stopStreamRef = useRef<(() => void) | null>(null)
  const startStreamRef = useRef<(() => Promise<void>) | null>(null)
  const getGeminiApiKey = useAction(api.gemini.getGeminiApiKey)

  // Check if user has seen instructions before
  useEffect(() => {
    const hasSeen = loadString(HAS_SEEN_INSTRUCTIONS_KEY)
    if (!hasSeen) {
      setShowInstructions(true)
      setIsFirstTimeUser(true)
    }
  }, [])

  // Fetch API key from Convex (keeps it out of the bundle)
  useEffect(() => {
    getGeminiApiKey({})
      .then(setApiKey)
      .catch((error) => {
        console.error("Failed to fetch Gemini API key:", error)
        setApiKeyError(error.message || "Failed to load API key")
      })
  }, [getGeminiApiKey])

  // Handle listing created - don't navigate automatically, let user continue streaming
  const handleListingCreated = useCallback((result: ListingCreatedResult) => {
    console.log("[SellCapture] Listing created:", result.listingId)
    setDraftListingIds((prev) =>
      prev.includes(result.listingId) ? prev : [...prev, result.listingId],
    )
    // Don't navigate automatically - user can continue creating more listings
    // They can navigate manually when done
  }, [])

  // Handle stop button press
  const handleStop = useCallback(() => {
    console.log("[SellCapture] Stop button pressed")
    if (hasNavigatedAfterStop) return

    if (stopStreamRef.current) {
      stopStreamRef.current()
      // Clear the ref so the Stop button hides after stopping
      stopStreamRef.current = null
    }

    // Navigate to draft review carousel - no params needed, uses live query
    router.push("/sell/review-drafts")
    setHasNavigatedAfterStop(true)
  }, [hasNavigatedAfterStop])

  // Dismiss instructions and mark as seen
  const handleDismissInstructions = useCallback(() => {
    setShowInstructions(false)
    if (isFirstTimeUser) {
      saveString(HAS_SEEN_INSTRUCTIONS_KEY, "true")
    }
  }, [isFirstTimeUser])

  // Toggle instructions visibility
  const handleToggleInstructions = useCallback(() => {
    setShowInstructions((prev) => !prev)
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

  const handleManualEntry = () => {
    router.push("/sell/manual")
  }

  const handleStart = useCallback(async () => {
    console.log("[SellCapture] Start button pressed")
    if (startStreamRef.current) {
      try {
        await startStreamRef.current()
      } catch (error) {
        console.error("[SellCapture] Failed to start stream:", error)
      }
    }
  }, [])

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <Header
        title="Create Listing"
        leftIcon="x"
        onLeftPress={handleClose}
        containerStyle={themed($header)}
        rightIcon={!showInstructions ? "more" : undefined}
        onRightPress={!showInstructions ? handleToggleInstructions : undefined}
      />

      {/* Full-height Camera Preview Area */}
      <View style={themed($cameraContainer)}>
        {apiKey ? (
          <ProductCamera
            apiKey={apiKey}
            autoStart={false}
            onListingCreated={handleListingCreated}
            onAudioLevelsChange={setAudioLevels}
            onStatusChange={setGeminiStatus}
            onStopRef={(stopFn) => {
              stopStreamRef.current = stopFn
            }}
            onStartRef={(startFn) => {
              startStreamRef.current = startFn
            }}
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

        {/* Overlay Controls */}
        <View style={$overlayContainer} pointerEvents="box-none">
          {/* Instructions Panel - shows for first-time users or when toggled */}
          {showInstructions && (
            <View style={themed($instructionsPanel)}>
              <View style={themed($instructionsHeader)}>
                <Text text="How to list an item" style={themed($instructionsTitle)} />
                <Pressable
                  onPress={handleDismissInstructions}
                  hitSlop={8}
                  style={themed($dismissButton)}
                >
                  <X size={18} color={theme.colors.palette.neutral100} weight="bold" />
                </Pressable>
              </View>
              <View style={themed($tipRow)}>
                <CameraIcon size={18} color={theme.colors.palette.accent300} weight="fill" />
                <Text text="Point camera at your item" style={themed($tipText)} />
              </View>
              <View style={themed($tipRow)}>
                <Microphone size={18} color={theme.colors.palette.accent300} weight="fill" />
                <Text text='Say "I want to sell this for $X"' style={themed($tipText)} />
              </View>
              <View style={themed($tipRow)}>
                <Sparkle size={18} color={theme.colors.palette.accent300} weight="fill" />
                <Text text="AI creates a professional listing" style={themed($tipText)} />
              </View>
              <View style={themed($tipRow)}>
                <CheckCircle size={18} color={theme.colors.palette.accent300} weight="fill" />
                <Text text="Review and publish!" style={themed($tipText)} />
              </View>
            </View>
          )}

          {/* Spacer to push controls to bottom */}
          <View style={$spacer} />

          {/* Bottom Controls */}
          <View style={[themed($bottomControls), { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {/* Manual Entry Button - left side */}
            <Pressable
              style={({ pressed }) => [themed($manualButton), pressed && { opacity: 0.7 }]}
              onPress={handleManualEntry}
            >
              <PencilSimple size={24} color={theme.colors.palette.neutral100} weight="fill" />
            </Pressable>

            {/* Gallery Button - center left */}
            <Pressable
              style={({ pressed }) => [themed($galleryButton), pressed && { opacity: 0.7 }]}
              onPress={handleChooseFromGallery}
            >
              <Images size={24} color={theme.colors.palette.neutral100} weight="fill" />
            </Pressable>

            {/* Start/Stop Button - center, shows Start when idle, Stop when connected/connecting */}
            {apiKey && (
              <>
                {geminiStatus === "idle" ? (
                  <Pressable
                    style={({ pressed }) => [
                      themed($startButton),
                      pressed && themed($startButtonPressed),
                    ]}
                    onPress={handleStart}
                  >
                    <Play size={28} color={theme.colors.palette.neutral100} weight="fill" />
                  </Pressable>
                ) : (
                  <Pressable
                    style={({ pressed }) => [
                      themed($stopButton),
                      pressed && themed($stopButtonPressed),
                    ]}
                    onPress={handleStop}
                  >
                    <Stop size={28} color={theme.colors.palette.neutral100} weight="fill" />
                  </Pressable>
                )}
              </>
            )}

            {/* Soundbar - right side */}
            <View style={themed($soundbarContainer)} pointerEvents="none">
              <AudioBars
                inputLevel={audioLevels.inputLevel}
                outputLevel={audioLevels.outputLevel}
                status={audioLevels.status}
                barCount={5}
                height={32}
                width={64}
              />
            </View>
          </View>
        </View>
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
  marginHorizontal: spacing.sm,
  marginBottom: spacing.sm,
  borderRadius: 24,
  overflow: "hidden",
})

const $cameraPlaceholder: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.palette.neutral800,
  justifyContent: "center",
  alignItems: "center",
})

const $placeholderSubtext: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral500,
  fontSize: 14,
  textAlign: "center",
  paddingHorizontal: spacing.xl,
})

const $overlayContainer: ViewStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
}

const $spacer: ViewStyle = {
  flex: 1,
}

const $instructionsPanel: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  margin: spacing.md,
  padding: spacing.md,
  backgroundColor: "rgba(0,0,0,0.75)",
  borderRadius: 16,
  gap: spacing.sm,
})

const $instructionsHeader: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
})

const $instructionsTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontWeight: "600",
  fontSize: 15,
})

const $dismissButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.xxs,
})

const $tipRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})

const $tipText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 13,
  flex: 1,
})

const $bottomControls: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: spacing.lg,
  gap: spacing.xl,
})

const $manualButton: ThemedStyle<ViewStyle> = () => ({
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: "rgba(0,0,0,0.5)",
  justifyContent: "center",
  alignItems: "center",
})

const $galleryButton: ThemedStyle<ViewStyle> = () => ({
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: "rgba(0,0,0,0.5)",
  justifyContent: "center",
  alignItems: "center",
})

const $soundbarContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 72,
  borderRadius: 16,
  backgroundColor: "rgba(0,0,0,0.45)",
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.xxs,
  alignItems: "center",
  justifyContent: "center",
})

const $startButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 72,
  height: 72,
  borderRadius: 36,
  backgroundColor: colors.tint,
  justifyContent: "center",
  alignItems: "center",
  // Add a subtle shadow for depth
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 8,
  // White ring around the button
  borderWidth: 4,
  borderColor: "rgba(255,255,255,0.3)",
})

const $startButtonPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.8,
  transform: [{ scale: 0.95 }],
})

const $stopButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 72,
  height: 72,
  borderRadius: 36,
  backgroundColor: colors.error,
  justifyContent: "center",
  alignItems: "center",
  // Add a subtle shadow for depth
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 8,
  // White ring around the button
  borderWidth: 4,
  borderColor: "rgba(255,255,255,0.3)",
})

const $stopButtonPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.8,
  transform: [{ scale: 0.95 }],
})

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import * as FileSystem from "expo-file-system/legacy"
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
} from "react-native-vision-camera"

import type { Id } from "../../convex/_generated/dataModel"
import { Text } from "@/components/Text"
import { useGeminiLive } from "@/hooks/useGeminiLive"
import { usePcmAudioStream } from "@/hooks/usePcmAudioStream"
import { showErrorToast } from "@/utils/toast"

type ListingCreatedResult = {
  listingId: Id<"listings">
  title: string
  imageUrl?: string
}

type ProductCameraProps = {
  /**
   * Gemini API key.
   */
  apiKey: string
  /**
   * Callback when a listing is created - receives listing ID and title
   */
  onListingCreated?: (result: ListingCreatedResult) => void
  /**
   * Callback for text messages from Gemini (for displaying conversation)
   */
  onTextMessage?: (text: string) => void
}

/**
 * Camera preview that streams video and audio to Gemini Live API.
 * Gemini understands when users want to sell items and automatically
 * creates listings via function calling.
 */
export function ProductCamera({ apiKey, onListingCreated, onTextMessage }: ProductCameraProps) {
  console.log("[ProductCamera] Render - apiKey present:", !!apiKey)

  const cameraRef = useRef<Camera>(null)
  const [isCapturing, setIsCapturing] = useState(false)

  const device = useCameraDevice("back")
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission()
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission()

  // Memoize config to prevent effect re-runs on every render
  const geminiConfig = useMemo(() => ({ apiKey }), [apiKey])
  const geminiOptions = useMemo(
    () => ({
      frameIntervalMs: 1000,
      onListingCreated: (result: ListingCreatedResult) => {
        console.log("[ProductCamera] Listing created:", result)
        // Note: Immediate toast is shown in useGeminiLive when function is called
        // Just notify parent component to navigate
        onListingCreated?.(result)
      },
      onListingError: (error: string) => {
        console.error("[ProductCamera] Listing error:", error)
        showErrorToast("Listing Failed", error)
      },
      onTextMessage: (text: string) => {
        console.log("[ProductCamera] Text from Gemini:", text)
        onTextMessage?.(text)
      },
    }),
    [onListingCreated, onTextMessage],
  )

  const { status, isProcessingListing, start, sendFrameBase64, sendPcmBase64 } = useGeminiLive(
    geminiConfig,
    geminiOptions,
  )

  // Handle incoming PCM audio data - forward to Gemini
  const handlePcmData = useCallback(
    (base64Pcm: string) => {
      sendPcmBase64(base64Pcm, 16000)
    },
    [sendPcmBase64],
  )

  // PCM audio streaming hook
  const {
    isStreaming: isRecordingAudio,
    start: startAudioStream,
    stop: stopAudioStream,
  } = usePcmAudioStream({
    onData: handlePcmData,
    onError: (error) => console.warn("PCM audio error:", error),
  })

  useEffect(() => {
    requestCameraPermission()
    requestMicPermission()
  }, [requestCameraPermission, requestMicPermission])

  useEffect(() => {
    console.log("[ProductCamera] start effect - device:", !!device, "permission:", hasCameraPermission)
    if (!device || !hasCameraPermission) return
    start().catch((e) => {
      console.log("[ProductCamera] start() rejected:", e)
    })
  }, [device, hasCameraPermission, start])

  // Periodically capture frames and send to Gemini at 1 FPS.
  useEffect(() => {
    console.log(
      "[ProductCamera] Frame capture effect - status:",
      status,
      "audioStreaming:",
      isRecordingAudio,
    )
    if (!device || !hasCameraPermission || status !== "connected" || !isRecordingAudio) {
      return
    }
    console.log("[ProductCamera] Starting frame capture interval")
    const interval = setInterval(() => {
      void captureAndSend()
    }, 1000)
    return () => {
      console.log("[ProductCamera] Clearing frame capture interval")
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, hasCameraPermission, status, isRecordingAudio])

  // Start/stop PCM audio streaming based on mic permission and connection status.
  useEffect(() => {
    if (hasMicPermission && status === "connected") {
      startAudioStream()
    } else {
      stopAudioStream()
    }
  }, [hasMicPermission, status, startAudioStream, stopAudioStream])

  const captureAndSend = async () => {
    if (!cameraRef.current || isCapturing) return
    setIsCapturing(true)
    try {
      // Use takeSnapshot() instead of takePhoto() - it captures from the preview
      // buffer which is already in JPEG format, avoiding HEIC conversion issues
      const snapshot = await cameraRef.current.takeSnapshot({
        quality: 70,
      })
      const path = snapshot.path.startsWith("file://") ? snapshot.path : `file://${snapshot.path}`
      const base64 = await FileSystem.readAsStringAsync(path, {
        encoding: "base64",
      })
      sendFrameBase64(base64)
    } catch (error) {
      console.warn("[ProductCamera] capture error:", error)
    } finally {
      setIsCapturing(false)
    }
  }

  const showPermissionsBlocker = useMemo(
    () => !hasCameraPermission || !hasMicPermission,
    [hasCameraPermission, hasMicPermission],
  )

  if (!device) {
    return (
      <View style={styles.fallback}>
        <Text text="Camera not available" style={styles.fallbackText} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {!showPermissionsBlocker ? (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          photo={true}
          video={true}
          onError={(error) =>
            console.log("[ProductCamera] Camera error:", error.code, error.message)
          }
        />
      ) : (
        <View style={styles.permissionPlaceholder}>
          <Text text="Camera permission required" style={styles.permissionText} />
        </View>
      )}

      <View style={styles.overlayContainer}>
        {/* Processing indicator when creating listing */}
        {isProcessingListing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text text="Creating listing..." style={styles.processingText} />
          </View>
        )}

        {/* Status pill */}
        <View style={styles.statusPill}>
          {status === "connecting" && <ActivityIndicator size="small" color="#0EA5E9" />}
          <Text
            text={
              showPermissionsBlocker
                ? "Allow camera + mic"
                : status === "connected"
                  ? "Listening..."
                  : "Connecting..."
            }
            style={styles.statusText}
          />
          {(isCapturing || isRecordingAudio) && (
            <Text
              text={` • ${isCapturing ? "video" : ""}${isCapturing && isRecordingAudio ? " +" : ""}${isRecordingAudio ? "audio" : ""}`}
              style={styles.capturingText}
            />
          )}
        </View>

        {/* Instructions */}
        {status === "connected" && !isProcessingListing && (
          <View style={styles.instructionsPill}>
            <Text
              text="Point at an item and say 'I want to sell this' to create a listing"
              style={styles.instructionsText}
            />
          </View>
        )}
      </View>
    </View>
  )
}

/* eslint-disable react-native/no-color-literals */
const styles = StyleSheet.create({
  capturingText: {
    color: "#a5f3fc",
    fontSize: 12,
  },
  container: {
    backgroundColor: "#000",
    borderRadius: 16,
    flex: 1,
    overflow: "hidden",
  },
  fallback: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 16,
    height: 220,
    justifyContent: "center",
  },
  fallbackText: {
    color: "#e5e7eb",
  },
  instructionsPill: {
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  instructionsText: {
    color: "#fff",
    fontSize: 13,
    textAlign: "center",
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  permissionPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "#111827",
    justifyContent: "center",
  },
  permissionText: {
    color: "#e5e7eb",
    fontSize: 16,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
  },
  processingText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
  },
  statusPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
})
/* eslint-enable react-native/no-color-literals */

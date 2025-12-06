import { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native"
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from "react-native-vision-camera"
import * as FileSystem from "expo-file-system"
import { Audio } from "expo-av"

import { BoundingBoxOverlay } from "@/components/BoundingBoxOverlay"
import { Text } from "@/components/Text"
import { useGeminiLiveDetection } from "@/hooks/useGeminiLiveDetection"

type ProductCameraProps = {
  /**
   * Gemini API key.
   */
  apiKey: string
  /**
   * Optional callback with latest detection payload.
   */
  onDetection?: (label?: string) => void
}

/**
 * Camera preview that periodically captures frames and streams them to the Gemini Live API
 * for bounding-box detection. Audio hints can be captured separately (not implemented here).
 */
export function ProductCamera({ apiKey, onDetection }: ProductCameraProps) {
  const cameraRef = useRef<Camera>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)

  const device = useCameraDevice("back")
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission()
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission()

  const { detection, status, start, sendFrameBase64, sendPcmBase64 } = useGeminiLiveDetection(
    { apiKey },
    { frameIntervalMs: 900 },
  )

  useEffect(() => {
    requestCameraPermission()
    requestMicPermission()
  }, [requestCameraPermission, requestMicPermission])

  useEffect(() => {
    if (!device || !hasCameraPermission) return
    start().catch(() => null)
  }, [device, hasCameraPermission, start])

  useEffect(() => {
    if (detection?.label && onDetection) {
      onDetection(detection.label)
    }
  }, [detection?.label, onDetection])

  // Periodically capture frames (lightweight snapshot) and send to Gemini.
  useEffect(() => {
    if (!device || !hasCameraPermission || status !== "connected") return
    const interval = setInterval(() => {
      void captureAndSend()
    }, 1200)
    return () => clearInterval(interval)
  }, [device, hasCameraPermission, status])

  // Periodically capture short audio snippets and stream.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!hasMicPermission || status !== "connected") return
      while (!cancelled) {
        await captureAudioOnce()
        await new Promise((r) => setTimeout(r, 1400))
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [hasMicPermission, status])

  const captureAndSend = async () => {
    if (!cameraRef.current || isCapturing) return
    setIsCapturing(true)
    try {
      const photo = await cameraRef.current.takePhoto({
        qualityPrioritization: "speed",
        skipMetadata: true,
      })
      const path = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`
      const base64 = await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.Base64,
      })
      sendFrameBase64(base64)
    } catch (error) {
      // Swallow errors to avoid spamming the UI.
      console.warn("capture error", error)
    } finally {
      setIsCapturing(false)
    }
  }

  const captureAudioOnce = async () => {
    if (isRecordingAudio) return
    setIsRecordingAudio(true)
    let recording: Audio.Recording | undefined
    try {
      await Audio.requestPermissionsAsync()
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })

      recording = new Audio.Recording()
      await recording.prepareToRecordAsync({
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".m4a",
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.LOW,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 64000,
        },
        web: {},
      })

      await recording.startAsync()
      await new Promise((r) => setTimeout(r, 900))
      await recording.stopAndUnloadAsync()

      const uri = recording.getURI()
      if (uri) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        })
        // Send as AAC (m4a). Gemini supports audio blobs with proper mime type.
        sendPcmBase64(base64, 44100, "audio/mp4")
      }
    } catch (error) {
      console.warn("audio capture error", error)
    } finally {
      setIsRecordingAudio(false)
      if (recording) {
        try {
          const uri = recording.getURI()
          if (uri) {
            await FileSystem.deleteAsync(uri, { idempotent: true })
          }
        } catch {
          // ignore
        }
      }
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
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!showPermissionsBlocker}
        photo
      />

      <View style={styles.overlayContainer}>
        <BoundingBoxOverlay
          box={detection?.boundingBox}
          label={detection?.label}
          confidence={detection?.confidence}
          isActive={status === "connected"}
        />

        <View style={styles.statusPill}>
          {status === "connecting" && <ActivityIndicator size="small" color="#0EA5E9" />}
          <Text
            text={
              showPermissionsBlocker
                ? "Allow camera + mic"
                : status === "connected"
                  ? "Streaming to Gemini"
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

        {!showPermissionsBlocker ? (
          <Pressable style={styles.captureButton} onPress={captureAndSend}>
            <Text text="Send frame" style={styles.captureText} />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.captureButton, styles.captureButtonDisabled]}
            onPress={() => {
              requestCameraPermission()
              requestMicPermission()
            }}
          >
            <Text text="Grant permissions" style={styles.captureText} />
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  statusPill: {
    alignSelf: "flex-start",
    margin: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  capturingText: {
    color: "#a5f3fc",
    fontSize: 12,
  },
  captureButton: {
    alignSelf: "center",
    marginBottom: 16,
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  captureButtonDisabled: {
    backgroundColor: "#4b5563",
  },
  captureText: {
    color: "#fff",
    fontWeight: "700",
  },
  fallback: {
    height: 220,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
  },
  fallbackText: {
    color: "#e5e7eb",
  },
})

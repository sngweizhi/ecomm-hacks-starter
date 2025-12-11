/**
 * ProductCamera - Streams video and audio to Gemini Live API
 *
 * MANUAL AUDIO FLOW TEST CHECKLIST:
 * ---------------------------------
 * 1. Connect: Tap to start session
 *    - Observe: Status changes from "idle" → "connecting" → "connected"
 *    - Console: "[GeminiLive] Setup complete" appears
 *
 * 2. Speak: Say "Hello, can you hear me?"
 *    - Observe: Mic level indicator moves (inputLevel)
 *    - Console: "[usePcmAudioStream] Audio chunk" logs appear
 *    - Console: "[GeminiLive] Sending audio" logs appear
 *
 * 3. Model Responds: Wait for AI response
 *    - Observe: Output level indicator moves (outputLevel)
 *    - Observe: Mic is muted (isModelResponding = true)
 *    - Console: "[useAudioPlayer] Flushed aggregated audio" logs appear
 *
 * 4. Interrupt: Speak while model is talking
 *    - Observe: Model stops speaking, mic resumes
 *    - Console: "[ProductCamera] Audio interrupted" appears
 *
 * 5. Resume: Continue conversation after interrupt
 *    - Observe: Normal flow resumes
 *    - Console: "[ProductCamera] Turn complete, resuming mic input"
 *
 * 6. Stop: End the session
 *    - Observe: All levels reset to 0
 *    - Console: "[GeminiLive] close() called"
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import * as FileSystem from "expo-file-system/legacy"
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
} from "react-native-vision-camera"

import type { AudioBarsStatus } from "@/components/AudioBars"
import { Text } from "@/components/Text"
import { useAudioPlayer } from "@/hooks/useAudioPlayer"
import { useGeminiLive, type GeminiLiveStatus } from "@/hooks/useGeminiLive"
import { usePcmAudioStream } from "@/hooks/usePcmAudioStream"
import { showErrorToast } from "@/utils/toast"

import type { Id } from "../../convex/_generated/dataModel"

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
   * Whether to automatically start the Gemini Live connection when ready.
   * Defaults to false - user must explicitly start the session.
   */
  autoStart?: boolean
  /**
   * Callback when a listing is created - receives listing ID and title
   */
  onListingCreated?: (result: ListingCreatedResult) => void
  /**
   * Callback for text messages from Gemini (for displaying conversation)
   */
  onTextMessage?: (text: string) => void
  /**
   * Callback to get the stop function for stopping the stream
   */
  onStopRef?: (stopFn: () => void) => void
  /**
   * Callback to get the start function for starting the stream
   */
  onStartRef?: (startFn: () => Promise<void>) => void
  /**
   * Optional callback to surface audio visualization values to a parent
   */
  onAudioLevelsChange?: (data: {
    inputLevel: number
    outputLevel: number
    status: AudioBarsStatus
  }) => void
  /**
   * Optional callback when Gemini Live status changes
   */
  onStatusChange?: (status: GeminiLiveStatus) => void
}

/**
 * Camera preview that streams video and audio to Gemini Live API.
 * Gemini understands when users want to sell items and automatically
 * creates listings via function calling.
 */
export function ProductCamera({
  apiKey,
  autoStart = false,
  onListingCreated,
  onTextMessage,
  onStopRef,
  onStartRef,
  onAudioLevelsChange,
  onStatusChange,
}: ProductCameraProps) {
  const cameraRef = useRef<Camera>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [micLevel, setMicLevel] = useState(0)
  const micLevelRef = useRef(0)
  const [outputLevel, setOutputLevel] = useState(0)
  // Track if component is mounted to prevent camera operations after unmount
  const [isMounted, setIsMounted] = useState(true)
  // Track if model is currently responding (to pause mic input and prevent echo/feedback)
  const [isModelResponding, setIsModelResponding] = useState(false)
  const isModelRespondingRef = useRef(false)
  // Muting prevents echo loops and helps VAD detect end-of-speech.
  // We keep a fallback-unmute below in case TURN_COMPLETE is missing.
  const MUTE_MIC_WHILE_MODEL_SPEAKS = true

  const device = useCameraDevice("back")
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission()
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission()

  // Memoize config to prevent effect re-runs on every render
  const geminiConfig = useMemo(() => ({ apiKey }), [apiKey])

  // Track sample rate from audio chunks for logging (Gemini typically uses 24kHz)
  const sampleRateRef = useRef<number | undefined>(undefined)
  // Throttle audio chunk logs to avoid JS-thread jank
  const outputAudioChunkCountRef = useRef(0)
  const suppressedOutputChunkCountRef = useRef(0)

  const {
    enqueue: playAudioChunk,
    interrupt: interruptAudio,
    clear: clearAudio,
    isPlaying: isOutputPlaying,
  } =
    useAudioPlayer({
      // Gemini Live API uses 24kHz by default (configured in geminiLive.ts)
      sampleRate: 24000,
      // Now that we're forcing audio-api playback, we can reduce prebuffer for faster start.
      prebufferMs: 200,
      minBufferMs: 0,
      // Allow larger buffer; we also enforce a soft drop limit in the player.
      maxBufferMs: 30000,
      // Native player has been choppy on some Android devices; force audio-api path.
      preferNative: false,
      onLevel: setOutputLevel,
    })

  const geminiOptions = useMemo(
    () => ({
      frameIntervalMs: 1400, // throttle frames to reduce model load/latency
      audioIntervalMs: 300,
      onListingCreated: (result: ListingCreatedResult) => {
        onListingCreated?.(result)
      },
      onListingError: (error: string) => {
        showErrorToast("Listing Failed", error)
      },
      onTextMessage: (text: string) => {
        onTextMessage?.(text)
      },
      onAudioData: (base64Pcm: string, mimeType?: string, sampleRate?: number) => {
        outputAudioChunkCountRef.current += 1
        if (
          outputAudioChunkCountRef.current <= 2 ||
          outputAudioChunkCountRef.current % 50 === 0
        ) {
          console.log("[ProductCamera] onAudioData", {
            base64Length: base64Pcm?.length || 0,
            mimeType,
            sampleRate,
            count: outputAudioChunkCountRef.current,
          })
        }

        // Track and log sample rate for debugging
        if (sampleRate) {
          if (!sampleRateRef.current) {
            sampleRateRef.current = sampleRate
            console.log("[ProductCamera] Detected sample rate:", sampleRate, "Hz")
          } else if (sampleRate !== sampleRateRef.current) {
            console.warn(
              `[ProductCamera] Sample rate changed from ${sampleRateRef.current} to ${sampleRate} Hz (unexpected)`,
            )
          }
        }

        // Mark model as responding and pause mic input (via state for usePcmAudioStream isMuted)
        if (!isModelRespondingRef.current) {
          // Ensure we don't play stale buffered audio from a previous turn (prevents overlap),
          // but avoid stopping the engine (reduces fragmentation at response start).
          clearAudio()
          isModelRespondingRef.current = true
          setIsModelResponding(true)
          console.log("[ProductCamera] Model started responding, muting mic input")
        }

        if (!base64Pcm || base64Pcm.length === 0) {
          console.warn("[ProductCamera] Empty audio chunk received, skipping playback")
          return
        }

        // Log first few chunks to verify audio is being sent to player
        if (!sampleRateRef.current || sampleRateRef.current === sampleRate) {
          const isFirstChunk = !sampleRateRef.current
          if (isFirstChunk) {
            console.log("[ProductCamera] Sending first audio chunk to player", {
              sizeBytes: base64Pcm.length,
              sampleRate: sampleRate ?? "default (24000)",
            })
          }
        }

        // If the user is currently speaking (client-side VAD), don't play model audio.
        // This prevents overlap and reduces echo that would retrigger VAD.
        if (isUserSpeakingRef.current) {
          suppressedOutputChunkCountRef.current += 1
          return
        }

        playAudioChunk(base64Pcm, sampleRate)
      },
      onTurnComplete: () => {
        // Resume mic input when model's turn is complete
        isModelRespondingRef.current = false
        setIsModelResponding(false)
        console.log("[ProductCamera] Turn complete, resuming mic input")
      },
      onAudioInterrupted: () => {
        // Stop any queued playback immediately to prevent overlapping audio after interruption.
        interruptAudio()
        // Resume mic input when model is interrupted so user can speak again
        isModelRespondingRef.current = false
        setIsModelResponding(false)
        console.log("[ProductCamera] Audio interrupted (model signal), resuming mic input")
      },
    }),
    [clearAudio, interruptAudio, isOutputPlaying, onListingCreated, onTextMessage, playAudioChunk, status],
  )

  const { status, start, stop, sendFrameBase64, sendPcmBase64, sendActivityStart, sendActivityEnd } =
    useGeminiLive(
    geminiConfig,
    geminiOptions,
  )

  // Track if we've initiated connection to prevent duplicate start() calls
  const hasStartedRef = useRef(false)
  // Track if stop was explicitly requested by user (to prevent auto-restart)
  const stopRequestedRef = useRef(false)

  // Client-side VAD: we keep mic capture running but only forward audio during speech.
  // Avoid muting at the capture layer so interruptions can be detected.
  const isMicMuted = false
  const shouldBufferAudio = status !== "connected"

  // Handle incoming PCM audio data - forward to Gemini
  // Note: Muting is now handled by usePcmAudioStream via isMuted option
  const micChunkCountRef = useRef(0)
  const isUserSpeakingRef = useRef(false)
  const silenceChunkCountRef = useRef(0)
  const speechStartConfirmCountRef = useRef(0)
  // NOTE: micLevel (RMS) in this app is typically small (~0.001–0.02), so thresholds
  // must be low or we will never detect speech.
  const SPEECH_START_THRESHOLD = 0.004
  const SPEECH_START_THRESHOLD_WHILE_PLAYING = 0.02
  const SPEECH_END_THRESHOLD = 0.0025
  const SPEECH_END_THRESHOLD_WHILE_PLAYING = 0.01
  const START_CONFIRM_CHUNKS = 2
  const START_CONFIRM_CHUNKS_WHILE_PLAYING = 3
  const END_SILENCE_CHUNKS = 4 // ~4 * 64ms ≈ 256ms (faster turn-taking)
  const handlePcmData = useCallback(
    (base64Pcm: string) => {
      micChunkCountRef.current += 1
      const levelNow = micLevelRef.current
      const startTh = isOutputPlaying ? SPEECH_START_THRESHOLD_WHILE_PLAYING : SPEECH_START_THRESHOLD
      const endTh = isOutputPlaying ? SPEECH_END_THRESHOLD_WHILE_PLAYING : SPEECH_END_THRESHOLD
      const startConfirmChunks = isOutputPlaying ? START_CONFIRM_CHUNKS_WHILE_PLAYING : START_CONFIRM_CHUNKS

      // Start speaking detection.
      if (!isUserSpeakingRef.current) {
        if (levelNow >= startTh) {
          speechStartConfirmCountRef.current += 1
        } else {
          speechStartConfirmCountRef.current = 0
        }

        if (speechStartConfirmCountRef.current >= startConfirmChunks) {
          isUserSpeakingRef.current = true
          silenceChunkCountRef.current = 0
          speechStartConfirmCountRef.current = 0

          // If model audio is playing, stop it immediately to reduce echo and prevent overlap.
          if (isOutputPlaying) {
            interruptAudio()
          }
          sendActivityStart()
        }
      }

      // If not in a speech segment, don't send audio (reduces noise + improves turn-taking).
      if (!isUserSpeakingRef.current) {
        return
      }

      // End-of-speech detection.
      if (levelNow <= endTh) {
        silenceChunkCountRef.current += 1
        if (silenceChunkCountRef.current >= END_SILENCE_CHUNKS) {
          isUserSpeakingRef.current = false
          silenceChunkCountRef.current = 0
          sendActivityEnd()
        }
        return
      }

      // Speaking: reset silence counter and send audio.
      silenceChunkCountRef.current = 0
      sendPcmBase64(base64Pcm, 16000)
    },
    [interruptAudio, isOutputPlaying, micLevel, sendActivityEnd, sendActivityStart, sendPcmBase64, shouldBufferAudio, status],
  )

  // Handle buffered audio chunks when connection becomes ready
  const handleBufferedData = useCallback(
    (chunks: string[]) => {
      console.log("[ProductCamera] Sending buffered audio chunks", { count: chunks.length })
      for (const chunk of chunks) {
        sendPcmBase64(chunk, 16000)
      }
    },
    [sendPcmBase64],
  )

  // PCM audio streaming hook with muting and buffering support
  const {
    isStreaming: isRecordingAudio,
    start: startAudioStream,
    stop: stopAudioStream,
    clearBuffer: clearAudioBuffer,
    level: micLevelLive,
  } = usePcmAudioStream({
    onData: handlePcmData,
    onError: (error) => console.warn("PCM audio error:", error),
    onLevel: (lvl) => {
      micLevelRef.current = lvl
      setMicLevel(lvl)
    },
    isMuted: isMicMuted,
    shouldBuffer: shouldBufferAudio,
    onBufferedData: handleBufferedData,
  })

  // Create combined stop function that stops both Gemini stream and audio
  const handleStop = useCallback(() => {
    console.log("[ProductCamera] Session stop requested - cleaning up resources")
    stopRequestedRef.current = true // Mark that user explicitly stopped
    stop() // Stop Gemini Live stream
    stopAudioStream() // Stop audio capture
    clearAudioBuffer() // Clear any buffered audio
    // Reset state for next connection
    isModelRespondingRef.current = false
    setIsModelResponding(false)
    console.log("[ProductCamera] Session stopped successfully")
  }, [stop, stopAudioStream, clearAudioBuffer])

  // Expose stop function to parent via ref callback
  useEffect(() => {
    if (onStopRef) {
      onStopRef(handleStop)
    }
  }, [onStopRef, handleStop])

  // Expose start function to parent via ref callback
  useEffect(() => {
    if (onStartRef) {
      onStartRef(start)
    }
  }, [onStartRef, start])

  useEffect(() => {
    setIsMounted(true)
    requestCameraPermission()
    requestMicPermission()
    return () => {
      setIsMounted(false)
    }
  }, [requestCameraPermission, requestMicPermission])

  // Auto-start connection when ready (only if autoStart is true)
  useEffect(() => {
    if (!autoStart) {
      console.log("[ProductCamera] Auto-start disabled, waiting for manual start")
      return
    }
    if (!device || !hasCameraPermission || status !== "idle" || hasStartedRef.current) {
      return
    }
    // Don't auto-restart if user explicitly stopped the session
    if (stopRequestedRef.current) {
      console.log("[ProductCamera] Skipping auto-start (user stopped session)")
      return
    }

    hasStartedRef.current = true
    console.log("[ProductCamera] Auto-starting Gemini Live connection")
    start().catch((e) => {
      console.error("[ProductCamera] start() rejected:", e)
      hasStartedRef.current = false // Allow retry on error
    })
  }, [autoStart, device, hasCameraPermission, status, start])

  // Cleanup on unmount to prevent camera leaks
  useEffect(() => {
    return () => {
      setIsMounted(false)
      hasStartedRef.current = false
      isModelRespondingRef.current = false
      stopRequestedRef.current = false
      // Stop camera and audio streams on unmount
      stopAudioStream()
      stop()
    }
  }, [stop, stopAudioStream])

  // Periodically capture frames and send to Gemini at 1 FPS.
  useEffect(() => {
    if (!device) {
      return
    }
    if (!hasCameraPermission) {
      return
    }
    if (status !== "connected") {
      return
    }
    if (!isRecordingAudio) {
      return
    }
    const interval = setInterval(() => {
      void captureAndSend()
    }, 500)
    return () => {
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

  // Fallback: if we never receive TURN_COMPLETE but audio playback finishes,
  // unmute the mic so the user can speak again (prevents "stuck muted" after first turn).
  useEffect(() => {
    if (isModelRespondingRef.current && !isOutputPlaying) {
      isModelRespondingRef.current = false
      setIsModelResponding(false)
    }
  }, [isOutputPlaying])

  useEffect(() => {
    if (status !== "connected") {
      setMicLevel(0)
      setOutputLevel(0)
      // Reset responding state when connection is lost/error to allow mic input on reconnect
      isModelRespondingRef.current = false
      setIsModelResponding(false)
    }
  }, [status])

  useEffect(() => {
    if (micLevelLive !== undefined) {
      setMicLevel(micLevelLive)
    }
  }, [micLevelLive])

  // Notify parent of status changes
  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  const captureAndSend = async () => {
    if (!cameraRef.current) {
      return
    }
    if (isCapturing) {
      return
    }
    // Reduce load while the user/model is speaking to improve responsiveness.
    if (isUserSpeakingRef.current || isModelRespondingRef.current) {
      return
    }

    setIsCapturing(true)
    const captureStartedAt = Date.now()
    try {
      let snapshot
      try {
        // Try takeSnapshot() first - it captures from the preview buffer
        // which is already in JPEG format, avoiding HEIC conversion issues
        snapshot = await cameraRef.current.takeSnapshot({
          quality: 40, // further lower quality to shrink payload and reduce encode time
        })
      } catch (snapshotError: any) {
        // Fallback to takePhoto() if takeSnapshot fails
        console.warn(
          "[ProductCamera] takeSnapshot failed, falling back to takePhoto:",
          snapshotError?.message,
        )
        const photo = await cameraRef.current.takePhoto({
          flash: "off",
        })
        snapshot = photo
      }

      const path = snapshot.path.startsWith("file://") ? snapshot.path : `file://${snapshot.path}`
      const base64 = await FileSystem.readAsStringAsync(path, {
        encoding: "base64",
      })
      const captureElapsed = Date.now() - captureStartedAt

      // Cap overly large frames to avoid blocking model responses
      const MAX_BASE64_SIZE = 140_000
      if (base64.length > MAX_BASE64_SIZE) {
        console.warn("[ProductCamera] Dropping frame: too large", {
          sizeBytes: base64.length,
          maxAllowed: MAX_BASE64_SIZE,
        })
        return
      }

      console.log("[ProductCamera] Frame captured", {
        sizeBytes: base64.length,
        elapsedMs: captureElapsed,
      })
      sendFrameBase64(base64)
    } catch (error) {
      console.error("[ProductCamera] Capture error:", error)
    } finally {
      setIsCapturing(false)
    }
  }

  const showPermissionsBlocker = useMemo(
    () => !hasCameraPermission || !hasMicPermission,
    [hasCameraPermission, hasMicPermission],
  )

  const statusLabel = useMemo(() => {
    if (showPermissionsBlocker) return "Allow camera + mic"
    if (cameraError) return "Camera error"
    if (status === "connected") return "Listening..."
    if (status === "connecting") return "Connecting..."
    if (status === "error") return "Connection error"
    return "Stopped"
  }, [cameraError, showPermissionsBlocker, status])

  const barsStatus: AudioBarsStatus = useMemo(() => {
    if (status === "error") return "error"
    if (status === "connecting") return "connecting"
    if (status === "connected" && isRecordingAudio) {
      return outputLevel > 0.05 ? "playing" : "listening"
    }
    return "idle"
  }, [isRecordingAudio, outputLevel, status])

  useEffect(() => {
    onAudioLevelsChange?.({
      inputLevel: micLevel,
      outputLevel,
      status: barsStatus,
    })
  }, [barsStatus, micLevel, onAudioLevelsChange, outputLevel])

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
          isActive={isMounted && status === "connected"}
          photo={true}
          onError={(error) => {
            // Some devices briefly emit `session/invalid-output-configuration`
            // while VisionCamera retries with a compatible configuration.
            // That error is transient and the camera still comes up, so we
            // ignore it to avoid confusing logs/UI.
            if (error.code === "session/invalid-output-configuration") {
              return
            }

            // Ignore camera errors if component is unmounting
            if (!isMounted) {
              return
            }

            console.error("[ProductCamera] Camera error:", error.message)
            setCameraError(error.message)
          }}
        />
      ) : (
        <View style={styles.permissionPlaceholder}>
          <Text text="Camera permission required" style={styles.permissionText} />
        </View>
      )}

      <View style={styles.overlayContainer}>
        {/* Connecting indicator */}
        {status === "connecting" && (
          <View style={styles.statusPill}>
            <ActivityIndicator size="small" color="#0EA5E9" />
            <Text text="Connecting..." style={styles.statusText} />
          </View>
        )}

        {/* Permission required indicator */}
        {showPermissionsBlocker && (
          <View style={styles.statusPill}>
            <Text text={statusLabel} style={styles.statusText} />
          </View>
        )}

        {/* Camera error message */}
        {cameraError && (
          <View style={styles.errorPill}>
            <Text
              text="Camera failed to start. Try closing and reopening this screen."
              style={styles.errorText}
            />
          </View>
        )}
      </View>
    </View>
  )
}

/* eslint-disable react-native/no-color-literals */
const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000",
    flex: 1,
    overflow: "hidden",
  },
  errorPill: {
    backgroundColor: "rgba(127,29,29,0.9)",
    borderRadius: 12,
    bottom: 70,
    left: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    position: "absolute",
    right: 16,
  },
  errorText: {
    color: "#fee2e2",
    fontSize: 13,
    textAlign: "center",
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
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
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
  statusPill: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 16,
    bottom: 16,
    flexDirection: "row",
    gap: 8,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: "absolute",
  },
  statusText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
})
/* eslint-enable react-native/no-color-literals */

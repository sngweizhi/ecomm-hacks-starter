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
        
        // #region agent log
        const chunkNum = outputAudioChunkCountRef.current
        if (chunkNum % 5 === 0 || chunkNum <= 3) {
          fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ProductCamera.tsx:175',message:'Model audio chunk received',data:{chunkNumber:chunkNum,isModelResponding:isModelRespondingRef.current,isOutputPlaying,chunkSize:base64Pcm?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        }
        // #endregion

        // Track sample rate
        if (sampleRate) {
          if (!sampleRateRef.current) {
            sampleRateRef.current = sampleRate
          } else if (sampleRate !== sampleRateRef.current) {
            // Sample rate changed unexpectedly
          }
        }

        // Mark model as responding and pause mic input (via state for usePcmAudioStream isMuted)
        if (!isModelRespondingRef.current) {
          // Ensure we don't play stale buffered audio from a previous turn (prevents overlap),
          // but avoid stopping the engine (reduces fragmentation at response start).
          clearAudio()
          isModelRespondingRef.current = true
          setIsModelResponding(true)
        }

        if (!base64Pcm || base64Pcm.length === 0) {
          return
        }

        // Google's automatic VAD handles interruptions - play audio normally
        // When user speaks, Google will send an 'interrupted' signal which triggers onAudioInterrupted
        playAudioChunk(base64Pcm, sampleRate)
      },
      onTurnComplete: () => {
        // Resume mic input when model's turn is complete
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ProductCamera.tsx:209',message:'onTurnComplete called',data:{isModelResponding:isModelRespondingRef.current,isOutputPlaying,outputChunkCount:outputAudioChunkCountRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        isModelRespondingRef.current = false
        setIsModelResponding(false)
        console.log("[ProductCamera] Turn complete, resuming mic input")
      },
      onAudioInterrupted: () => {
        const interruptTime = Date.now()
        
        // #region agent log
        // Track interruptions relative to tool calls and VAD state
        const lastToolCallTime = geminiClientRef.current?.getLastToolCallTime() || null
        const lastToolResponseTime = geminiClientRef.current?.getLastToolResponseTime() || null
        const msSinceToolCall = lastToolCallTime ? interruptTime - lastToolCallTime : null
        const msSinceToolResponse = lastToolResponseTime ? interruptTime - lastToolResponseTime : null
        const lastToolCallName = geminiClientRef.current?.getLastToolCallName() || null
        fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ProductCamera.tsx:228',message:'onAudioInterrupted called',data:{isModelResponding:isModelRespondingRef.current,isOutputPlaying,outputChunkCount:outputAudioChunkCountRef.current,msSinceToolCall,msSinceToolResponse,lastToolCallName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // Ignore spurious INTERRUPTED signals when model is not responding.
        // After tool calls, Gemini sometimes sends INTERRUPTED even though the model
        // isn't actively speaking. This would clear audio buffers unnecessarily.
        if (!isModelRespondingRef.current) {
          console.log("[ProductCamera] Ignoring INTERRUPTED signal (model not responding)")
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ProductCamera.tsx:236',message:'Ignoring INTERRUPTED - model not responding',data:{msSinceToolCall,msSinceToolResponse,lastToolCallName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          return
        }
        
        // Stop any queued playback immediately to prevent overlapping audio after interruption.
        interruptAudio()
        // Resume mic input when model is interrupted so user can speak again
        isModelRespondingRef.current = false
        setIsModelResponding(false)
      },
    }),
    [clearAudio, interruptAudio, isOutputPlaying, onListingCreated, onTextMessage, playAudioChunk, status],
  )

  const { status, start, stop, sendFrameBase64, sendPcmBase64, clientRef: geminiClientRef } =
    useGeminiLive(
    geminiConfig,
    geminiOptions,
  )

  // Track if we've initiated connection to prevent duplicate start() calls
  const hasStartedRef = useRef(false)
  // Track if stop was explicitly requested by user (to prevent auto-restart)
  const stopRequestedRef = useRef(false)

  // Track how many mic chunks we suppress while the model is responding (echo/self-talk prevention)
  const suppressedMicChunkCountRef = useRef(0)

  // Avoid echo/self-talk: when the model is responding, don't stream mic audio back to Gemini.
  // (Mic level is still computed for UI while muted.)
  const isMicMuted = isModelResponding
  const shouldBufferAudio = status !== "connected"

  // #region agent log
  const lastIsMicMutedLoggedRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (lastIsMicMutedLoggedRef.current === isMicMuted) return
    lastIsMicMutedLoggedRef.current = isMicMuted
    fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ProductCamera.tsx:272',message:'Mic mute toggled (echo/self-talk prevention)',data:{isMicMuted,isModelResponding:isModelRespondingRef.current,isOutputPlaying,micLevel:micLevelRef.current,outputChunkCount:outputAudioChunkCountRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
  }, [isMicMuted, isOutputPlaying])
  // #endregion

  // Handle incoming PCM audio data - forward to Gemini continuously
  // Google's automatic VAD will detect speech start/end automatically
  const handlePcmData = useCallback(
    (base64Pcm: string) => {
      // Even if the native stream delivers a chunk before `isMuted` updates,
      // suppress mic audio while the model is responding to reduce echo/self-talk.
      if (isModelRespondingRef.current) {
        suppressedMicChunkCountRef.current += 1
        const suppressedCount = suppressedMicChunkCountRef.current
        // #region agent log
        if (suppressedCount <= 3 || suppressedCount % 25 === 0) {
          fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ProductCamera.tsx:274',message:'Mic audio suppressed while model responding',data:{suppressedCount,micLevel:micLevelRef.current,isOutputPlaying,outputChunkCount:outputAudioChunkCountRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
        }
        // #endregion
        return
      }

      // Forward mic audio to Gemini (Google's VAD handles detection)
      sendPcmBase64(base64Pcm, 16000)
    },
    [isOutputPlaying, sendPcmBase64],
  )

  // Handle buffered audio chunks when connection becomes ready
  const handleBufferedData = useCallback(
    (chunks: string[]) => {
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
    onError: () => {
      // PCM audio error
    },
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
    // Reduce load while the model is speaking to improve responsiveness.
    // Frames continue to be sent while the user is speaking.
    if (isModelRespondingRef.current) {
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

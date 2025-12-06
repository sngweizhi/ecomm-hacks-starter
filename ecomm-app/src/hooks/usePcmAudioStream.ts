import { useCallback, useEffect, useRef, useState } from "react"
import { NativeEventEmitter, NativeModules, Platform } from "react-native"

/**
 * PCM audio stream configuration for Gemini Live API.
 * 16-bit mono PCM at 16kHz is the recommended format.
 */
export const PCM_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  /**
   * Android audio source: 6 = VOICE_RECOGNITION (optimized for speech).
   */
  audioSource: 6,
  /**
   * Buffer size in bytes. 4096 gives ~128ms chunks at 16kHz mono 16-bit.
   * Smaller = lower latency but more overhead.
   */
  bufferSize: 4096,
} as const

export type PcmAudioStreamState = "idle" | "starting" | "streaming" | "error"

export type UsePcmAudioStreamOptions = {
  /**
   * Called with each base64-encoded PCM chunk.
   */
  onData?: (base64Pcm: string) => void
  /**
   * Called on errors.
   */
  onError?: (error: unknown) => void
}

// Access the native module directly to avoid type issues with the library's d.ts
const RNLiveAudioStream = NativeModules.RNLiveAudioStream as
  | {
      init: (options: {
        sampleRate: number
        channels: number
        bitsPerSample: number
        audioSource?: number
        bufferSize?: number
      }) => void
      start: () => void
      stop: () => void
    }
  | undefined

/**
 * Hook to capture live PCM audio from the microphone.
 * Only works on native platforms (iOS/Android). Returns no-op on web.
 */
export function usePcmAudioStream(options: UsePcmAudioStreamOptions = {}) {
  const { onData, onError } = options
  const [state, setState] = useState<PcmAudioStreamState>("idle")
  const subscriptionRef = useRef<{ remove: () => void } | null>(null)
  const isInitializedRef = useRef(false)
  const eventEmitterRef = useRef<NativeEventEmitter | null>(null)

  // Store callbacks in refs to avoid re-subscriptions
  const onDataRef = useRef(onData)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onDataRef.current = onData
    onErrorRef.current = onError
  }, [onData, onError])

  const start = useCallback(() => {
    // Only run on native platforms
    if (Platform.OS === "web" || !RNLiveAudioStream) {
      console.warn("PCM audio streaming is not supported on this platform")
      return
    }

    if (state === "streaming" || state === "starting") {
      return
    }

    setState("starting")

    try {
      // Initialize if not already done
      if (!isInitializedRef.current) {
        RNLiveAudioStream.init({
          sampleRate: PCM_CONFIG.sampleRate,
          channels: PCM_CONFIG.channels,
          bitsPerSample: PCM_CONFIG.bitsPerSample,
          audioSource: PCM_CONFIG.audioSource,
          bufferSize: PCM_CONFIG.bufferSize,
        })
        isInitializedRef.current = true
      }

      // Create event emitter if needed
      // Note: We don't pass the native module to avoid the "missing addListener/removeListeners"
      // warning. The events still work correctly through RN's native event bridge.
      if (!eventEmitterRef.current) {
        eventEmitterRef.current = new NativeEventEmitter()
      }

      // Remove any existing listener and add new one
      eventEmitterRef.current.removeAllListeners("data")
      subscriptionRef.current = eventEmitterRef.current.addListener("data", (data: string) => {
        onDataRef.current?.(data)
      })

      // Start the audio stream
      RNLiveAudioStream.start()
      setState("streaming")
    } catch (error) {
      console.error("Failed to start PCM audio stream:", error)
      setState("error")
      onErrorRef.current?.(error)
    }
  }, [state])

  const stop = useCallback(() => {
    if (Platform.OS === "web" || !RNLiveAudioStream) {
      return
    }

    try {
      // Remove subscription first
      if (subscriptionRef.current) {
        subscriptionRef.current.remove()
        subscriptionRef.current = null
      }

      // Stop the audio stream
      RNLiveAudioStream.stop()
      setState("idle")
    } catch (error) {
      console.error("Failed to stop PCM audio stream:", error)
      onErrorRef.current?.(error)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove()
        subscriptionRef.current = null
      }
      if (isInitializedRef.current && Platform.OS !== "web" && RNLiveAudioStream) {
        try {
          RNLiveAudioStream.stop()
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }, [])

  return {
    state,
    isStreaming: state === "streaming",
    start,
    stop,
    sampleRate: PCM_CONFIG.sampleRate,
    mimeType: `audio/pcm;rate=${PCM_CONFIG.sampleRate}`,
  }
}

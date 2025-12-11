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
   * Buffer size in bytes. 2048 gives ~64ms chunks at 16kHz mono 16-bit.
   * Smaller = lower latency but more overhead.
   */
  bufferSize: 2048,
  /**
   * Maximum number of chunks to buffer when connection isn't ready.
   * Prevents unbounded memory growth while allowing brief reconnects.
   */
  maxBufferedChunks: 10,
} as const

export type PcmAudioStreamState = "idle" | "starting" | "streaming" | "error"

export type UsePcmAudioStreamOptions = {
  /**
   * Called with each base64-encoded PCM chunk.
   * Only called when not muted and not gated.
   */
  onData?: (base64Pcm: string) => void
  /**
   * Called on errors.
   */
  onError?: (error: unknown) => void
  /**
   * Called with a smoothed 0-1 RMS level derived from the PCM chunk.
   */
  onLevel?: (level: number) => void
  /**
   * If true, audio is captured but onData is not called (mic input is muted).
   * Useful for pausing input while model is responding to prevent echo/feedback.
   */
  isMuted?: boolean
  /**
   * If true, audio is buffered instead of sent immediately.
   * Useful when WebSocket connection isn't fully established yet.
   */
  shouldBuffer?: boolean
  /**
   * Called when buffered audio is ready to be flushed (after shouldBuffer becomes false).
   */
  onBufferedData?: (chunks: string[]) => void
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
 *
 * Features:
 * - Mute/unmute capability (isMuted option)
 * - Buffering when connection isn't ready (shouldBuffer option)
 * - Audio level metering via onLevel callback
 */
export function usePcmAudioStream(options: UsePcmAudioStreamOptions = {}) {
  const { onData, onError, onLevel, isMuted = false, shouldBuffer = false, onBufferedData } = options
  const [state, setState] = useState<PcmAudioStreamState>("idle")
  const [level, setLevel] = useState(0)
  const subscriptionRef = useRef<{ remove: () => void } | null>(null)
  const isInitializedRef = useRef(false)
  const eventEmitterRef = useRef<NativeEventEmitter | null>(null)
  const chunkCountRef = useRef(0)
  const levelRef = useRef(0)
  // Buffer for holding audio chunks when shouldBuffer is true
  const audioBufferRef = useRef<string[]>([])
  // Track muted/gated chunks for observability
  const mutedChunkCountRef = useRef(0)
  const bufferedChunkCountRef = useRef(0)

  // Store callbacks in refs to avoid re-subscriptions
  const onDataRef = useRef(onData)
  const onErrorRef = useRef(onError)
  const onLevelRef = useRef(onLevel)
  const onBufferedDataRef = useRef(onBufferedData)
  const isMutedRef = useRef(isMuted)
  const shouldBufferRef = useRef(shouldBuffer)

  useEffect(() => {
    onDataRef.current = onData
    onErrorRef.current = onError
    onLevelRef.current = onLevel
    onBufferedDataRef.current = onBufferedData
    isMutedRef.current = isMuted
    shouldBufferRef.current = shouldBuffer
  }, [onData, onError, onLevel, onBufferedData, isMuted, shouldBuffer])

  // Flush buffered audio when shouldBuffer transitions from true to false
  useEffect(() => {
    if (!shouldBuffer && audioBufferRef.current.length > 0) {
      const bufferedChunks = [...audioBufferRef.current]
      audioBufferRef.current = []
      console.log("[usePcmAudioStream] Flushing buffered audio", {
        chunks: bufferedChunks.length,
      })
      // Notify via callback if provided
      if (onBufferedDataRef.current) {
        onBufferedDataRef.current(bufferedChunks)
      } else {
        // Otherwise send each chunk via onData
        for (const chunk of bufferedChunks) {
          onDataRef.current?.(chunk)
        }
      }
      bufferedChunkCountRef.current = 0
    }
  }, [shouldBuffer])

  const decodeBase64ToBytes = useCallback((base64: string) => {
    if (!base64) return null
    try {
      if (typeof globalThis.atob === "function") {
        const binary = globalThis.atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        return bytes
      }
      throw new Error("atob not available")
    } catch {
      const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
      const lookup = new Uint8Array(256)
      for (let i = 0; i < base64Chars.length; i++) {
        lookup[base64Chars.charCodeAt(i)] = i
      }

      const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
      const bufferLength = (base64.length * 3) / 4 - padding
      const bytes = new Uint8Array(bufferLength)

      let p = 0
      for (let i = 0; i < base64.length; i += 4) {
        const encoded1 = lookup[base64.charCodeAt(i)]
        const encoded2 = lookup[base64.charCodeAt(i + 1)]
        const encoded3 = lookup[base64.charCodeAt(i + 2)]
        const encoded4 = lookup[base64.charCodeAt(i + 3)]

        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4)
        if (p < bufferLength) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2)
        if (p < bufferLength) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63)
      }

      return bytes
    }
  }, [])

  const computeRmsLevel = useCallback(
    (base64: string) => {
      const bytes = decodeBase64ToBytes(base64)
      if (!bytes || bytes.byteLength < 2) return 0
      const samples = new Int16Array(
        bytes.buffer,
        bytes.byteOffset,
        Math.floor(bytes.byteLength / 2),
      )
      if (samples.length === 0) return 0

      let sum = 0
      for (let i = 0; i < samples.length; i++) {
        const normalized = samples[i] / 32768
        sum += normalized * normalized
      }
      const rms = Math.sqrt(sum / samples.length)
      const smoothed = 0.3 * rms + 0.7 * levelRef.current
      levelRef.current = smoothed
      return Math.min(1, Math.max(0, smoothed))
    },
    [decodeBase64ToBytes],
  )

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
        console.log("[usePcmAudioStream] Initialized native stream", {
          sampleRate: PCM_CONFIG.sampleRate,
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
        chunkCountRef.current += 1

        // Always compute level for visualization (even when muted)
        const levelValue = computeRmsLevel(data)
        setLevel(levelValue)
        onLevelRef.current?.(levelValue)

        // Check if muted - capture audio but don't send it
        if (isMutedRef.current) {
          mutedChunkCountRef.current += 1
          if (mutedChunkCountRef.current <= 2 || mutedChunkCountRef.current % 50 === 0) {
            console.log("[usePcmAudioStream] Audio muted, not sending", {
              mutedChunks: mutedChunkCountRef.current,
            })
          }
          return
        }

        // Check if should buffer - store audio for later
        if (shouldBufferRef.current) {
          bufferedChunkCountRef.current += 1
          // Prevent unbounded buffer growth
          if (audioBufferRef.current.length < PCM_CONFIG.maxBufferedChunks) {
            audioBufferRef.current.push(data)
          } else {
            // Drop oldest chunk when buffer is full (sliding window)
            audioBufferRef.current.shift()
            audioBufferRef.current.push(data)
          }
          if (bufferedChunkCountRef.current <= 2 || bufferedChunkCountRef.current % 25 === 0) {
            console.log("[usePcmAudioStream] Buffering audio (connection not ready)", {
              bufferedChunks: audioBufferRef.current.length,
              totalBuffered: bufferedChunkCountRef.current,
            })
          }
          return
        }

        // Normal path - send audio immediately
        if (chunkCountRef.current <= 3 || chunkCountRef.current % 25 === 0) {
          console.log("[usePcmAudioStream] Audio chunk", {
            sizeBytes: data.length,
            chunk: chunkCountRef.current,
          })
        }
        onDataRef.current?.(data)
      })

      // Start the audio stream
      RNLiveAudioStream.start()
      console.log("[usePcmAudioStream] Streaming started")
      setState("streaming")
    } catch (error) {
      console.error("Failed to start PCM audio stream:", error)
      setState("error")
      onErrorRef.current?.(error)
    }
  }, [computeRmsLevel, state])

  const stop = useCallback(() => {
    if (Platform.OS === "web" || !RNLiveAudioStream) {
      levelRef.current = 0
      setLevel(0)
      onLevelRef.current?.(0)
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
      console.log("[usePcmAudioStream] Streaming stopped", {
        totalChunks: chunkCountRef.current,
        mutedChunks: mutedChunkCountRef.current,
        bufferedChunks: bufferedChunkCountRef.current,
      })
      // Reset all counters and buffers
      chunkCountRef.current = 0
      mutedChunkCountRef.current = 0
      bufferedChunkCountRef.current = 0
      audioBufferRef.current = []
      setState("idle")
      levelRef.current = 0
      setLevel(0)
      onLevelRef.current?.(0)
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

  // Method to clear the audio buffer (useful when connection is reset)
  const clearBuffer = useCallback(() => {
    const clearedCount = audioBufferRef.current.length
    audioBufferRef.current = []
    bufferedChunkCountRef.current = 0
    if (clearedCount > 0) {
      console.log("[usePcmAudioStream] Buffer cleared", { clearedChunks: clearedCount })
    }
  }, [])

  return {
    state,
    isStreaming: state === "streaming",
    start,
    stop,
    clearBuffer,
    sampleRate: PCM_CONFIG.sampleRate,
    mimeType: `audio/pcm;rate=${PCM_CONFIG.sampleRate}`,
    level,
    // Observability stats
    stats: {
      totalChunks: chunkCountRef.current,
      mutedChunks: mutedChunkCountRef.current,
      bufferedChunks: audioBufferRef.current.length,
    },
  }
}

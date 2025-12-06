import { useCallback, useEffect, useRef } from "react"
import { NativeModules, Platform } from "react-native"

type BufferStatus = {
  availableBytes: number
  capacityBytes: number
  prebufferBytes: number
  minBufferBytes: number
  underrunCount: number
  isPlaying: boolean
} | null

type UseAudioPlayerOptions = {
  sampleRate?: number
  prebufferMs?: number
  minBufferMs?: number
  maxBufferMs?: number
  /**
   * Optional callback for buffer status (useful for debugging underruns).
   */
  onStatus?: (status: BufferStatus) => void
}

type NativePcmPlayerType = {
  init: (options: Record<string, any>) => void
  enqueue: (base64Chunk: string) => void
  stop: () => void
  getBufferStatus?: () => Promise<BufferStatus>
}

const NativePcmPlayer = NativeModules.PcmPlayer as NativePcmPlayerType | undefined

/**
 * Thin wrapper around the native PCM AudioTrack player.
 * On web (or if the native module is missing), it becomes a no-op.
 */
export function useAudioPlayer(options: UseAudioPlayerOptions = {}) {
  const sampleRate = options.sampleRate ?? 24000
  const prebufferMs = options.prebufferMs ?? 500
  const minBufferMs = options.minBufferMs ?? 0
  const maxBufferMs = options.maxBufferMs ?? 3000
  const enqueueCountRef = useRef(0)

  const enqueue = useCallback((base64Chunk: string) => {
    if (!NativePcmPlayer || Platform.OS === "web") {
      console.warn("[useAudioPlayer] NativePcmPlayer not available (enqueue skipped)", {
        hasNativeModule: !!NativePcmPlayer,
        platform: Platform.OS,
      })
      return
    }
    if (!base64Chunk) {
      console.warn("[useAudioPlayer] Empty chunk provided, skipping")
      return
    }
    try {
      NativePcmPlayer.enqueue(base64Chunk)
      enqueueCountRef.current += 1
      const count = enqueueCountRef.current
      if (count <= 3 || count % 25 === 0) {
        console.log("[useAudioPlayer] Enqueued audio chunk", {
          count,
          sizeBytes: base64Chunk.length,
        })
      }
    } catch (e) {
      console.error("[useAudioPlayer] enqueue failed", e)
    }
  }, [])

  const interrupt = useCallback(() => {
    if (!NativePcmPlayer || Platform.OS === "web") return
    try {
      NativePcmPlayer.stop()
    } catch (e) {
      console.warn("[useAudioPlayer] stop failed", e)
    }
  }, [])

  const getStatus = useCallback(async (): Promise<BufferStatus> => {
    if (!NativePcmPlayer || Platform.OS === "web" || !NativePcmPlayer.getBufferStatus) {
      options.onStatus?.(null)
      return null
    }
    try {
      const status = await NativePcmPlayer.getBufferStatus()
      options.onStatus?.(status ?? null)
      return status ?? null
    } catch (e) {
      console.warn("[useAudioPlayer] getBufferStatus failed", e)
      options.onStatus?.(null)
      return null
    }
  }, [options])

  useEffect(() => {
    if (!NativePcmPlayer || Platform.OS === "web") {
      console.warn("[useAudioPlayer] Cannot init: NativePcmPlayer unavailable")
      return
    }
    try {
      console.log("[useAudioPlayer] Initializing NativePcmPlayer", {
        sampleRate,
        prebufferMs,
        minBufferMs,
        maxBufferMs,
      })
      NativePcmPlayer.init({
        sampleRate,
        prebufferMs,
        minBufferMs,
        maxBufferMs,
      })
    } catch (e) {
      console.warn("[useAudioPlayer] init failed", e)
    }
    return () => {
      try {
        NativePcmPlayer.stop()
      } catch (e) {
        // ignore cleanup errors
      }
    }
  }, [sampleRate, prebufferMs, minBufferMs, maxBufferMs])

  return {
    isPlaying: false,
    level: 0,
    enqueue,
    interrupt,
    getStatus,
  }
}

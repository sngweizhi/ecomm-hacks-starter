import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { NativeModules, Platform } from "react-native"
import { Audio } from "expo-av"
import {
  AudioContext,
  type AudioBuffer,
  type AudioBufferQueueSourceNode,
} from "react-native-audio-api"

const DEFAULT_OUTPUT_SAMPLE_RATE = 24000

type BufferStatus =
  | {
      availableBytes: number
      capacityBytes: number
      prebufferBytes: number
      minBufferBytes: number
      underrunCount: number
      isPlaying: boolean
    }
  | null

export type UseAudioPlayerOptions = {
  /**
   * Expected sample rate for incoming PCM chunks (Gemini typically outputs 24kHz).
   */
  sampleRate?: number
  /**
   * Amount of audio to buffer before starting playback (ms).
   */
  prebufferMs?: number
  /**
   * Currently unused (kept for API compatibility with previous implementation).
   */
  minBufferMs?: number
  /**
   * Drop buffered audio if we exceed this backlog (ms).
   * Helps avoid “late” audio piling up.
   */
  maxBufferMs?: number
  /**
   * Prefer native streaming player if available.
   * Set false to force JS audio queue path (useful for debugging choppy native playback).
   */
  preferNative?: boolean
  onStatus?: (status: BufferStatus) => void
  onLevel?: (level: number) => void
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  // NOTE: atob is available in RN Hermes; we keep a minimal fallback for safety.
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  const lookup = new Uint8Array(256)
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i
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

function pcm16leBase64ToFloat32(
  base64: string,
): { samples: Float32Array; level: number; frames: number } {
  const bytes = decodeBase64ToBytes(base64)
  const frameCount = Math.floor(bytes.byteLength / 2)
  const view = new DataView(bytes.buffer, bytes.byteOffset, frameCount * 2)
  const out = new Float32Array(frameCount)

  let sum = 0
  for (let i = 0; i < frameCount; i++) {
    const s = view.getInt16(i * 2, true)
    const f = s / 32768
    out[i] = f
    sum += f * f
  }

  const rms = frameCount > 0 ? Math.sqrt(sum / frameCount) : 0
  return { samples: out, level: Math.min(1, Math.max(0, rms)), frames: frameCount }
}

async function configureAudioSession() {
  // We keep expo-av only for audio-session routing.
  // Playback itself is done by react-native-audio-api (native engine) to avoid gaps.
  try {
    await Audio.setIsEnabledAsync(true)
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      allowsRecordingIOS: true,
      playThroughEarpieceAndroid: false,
      interruptionModeIOS: 1, // DoNotMix
      interruptionModeAndroid: 1, // DoNotMix
    })
  } catch (error) {
    // Error configuring audio session
  }
}

export function useAudioPlayer(options: UseAudioPlayerOptions = {}) {
  const sampleRate = options.sampleRate ?? DEFAULT_OUTPUT_SAMPLE_RATE
  const prebufferSeconds = (options.prebufferMs ?? 250) / 1000
  const maxBufferSeconds = (options.maxBufferMs ?? 4000) / 1000
  const preferNative = options.preferNative ?? true

  const [isPlayingState, setIsPlayingState] = useState(false)

  // Native streaming player (preferred): moves base64 decoding + PCM writes off JS.
  const nativePlayer = (NativeModules as any)?.PcmStreamPlayer as
    | {
        init: (opts: { sampleRate: number; channels: number }) => void
        start: () => void
        enqueueBase64: (base64Pcm: string) => void
        clear: () => void
        stop: () => void
      }
    | undefined
  const usingNativePlayerRef = useRef(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const queueNodeRef = useRef<AudioBufferQueueSourceNode | null>(null)
  const startedRef = useRef(false)

  const queuedSecondsRef = useRef(0)
  // Native path doesn’t expose “consumed” callbacks, so we decay our backlog estimate
  // using wall-clock time between enqueues.
  const nativeBacklogUpdatedAtMsRef = useRef<number | null>(null)
  const bufferDurationsRef = useRef<Map<string, number>>(new Map())
  const enqueueCountRef = useRef(0)
  const nativeEnqueueCountRef = useRef(0)

  const levelSmoothedRef = useRef(0)
  const onLevelRef = useRef(options.onLevel)
  useEffect(() => {
    onLevelRef.current = options.onLevel
  }, [options.onLevel])

  const ensureEngine = useCallback(() => {
    if (Platform.OS === "web") return

    if (preferNative && nativePlayer && !usingNativePlayerRef.current) {
      try {
        nativePlayer.init({ sampleRate, channels: 1 })
        nativePlayer.start()
        usingNativePlayerRef.current = true
        nativeBacklogUpdatedAtMsRef.current = Date.now()
      } catch (e) {
        usingNativePlayerRef.current = false
      }
      return
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate })
    }

    if (!queueNodeRef.current) {
      const ctx = audioContextRef.current
      const queue = ctx.createBufferQueueSource({ pitchCorrection: false })
      queue.connect(ctx.destination)

      queue.onEnded = (event: any) => {
        const bufferId: string | undefined = event?.bufferId
        if (bufferId) {
          const dur = bufferDurationsRef.current.get(bufferId)
          if (dur) {
            queuedSecondsRef.current = Math.max(0, queuedSecondsRef.current - dur)
            bufferDurationsRef.current.delete(bufferId)
          }
        }

        // If we ran out of queued audio, reflect not-playing.
        // IMPORTANT: Check both queuedSeconds AND remaining buffers to avoid stopping prematurely
        // when there are still buffers queued but the time estimate is slightly off
        const hasRemainingBuffers = bufferDurationsRef.current.size > 0
        if (queuedSecondsRef.current <= 0.001 && !hasRemainingBuffers) {
          setIsPlayingState(false)
        } else if (hasRemainingBuffers && queuedSecondsRef.current <= 0.001) {
          // Recalculate queuedSeconds from remaining buffers to fix the estimate
          let totalRemaining = 0
          for (const dur of bufferDurationsRef.current.values()) {
            totalRemaining += dur
          }
          queuedSecondsRef.current = totalRemaining
        }
      }

      queueNodeRef.current = queue
    }
  }, [preferNative, sampleRate])

  const startIfReady = useCallback(async () => {
    if (Platform.OS === "web") return
    if (startedRef.current) return

    if (usingNativePlayerRef.current) {
      if (queuedSecondsRef.current >= prebufferSeconds) {
        startedRef.current = true
        setIsPlayingState(true)
      }
      return
    }

    // Prebuffer before starting to reduce underruns/gaps.
    if (queuedSecondsRef.current < prebufferSeconds) {
      return
    }

    const ctx = audioContextRef.current
    const queue = queueNodeRef.current
    if (!ctx || !queue) return

    await configureAudioSession()

    // Ensure context is running (mobile platforms often require an explicit resume).
    try {
      await ctx.resume()
    } catch {
      // ignore
    }

    try {
      queue.start(ctx.currentTime)
      startedRef.current = true
      setIsPlayingState(true)
    } catch (e) {
      // If start fails (e.g. already started), keep going.
      startedRef.current = true
      setIsPlayingState(true)
    }
  }, [prebufferSeconds])

  const interrupt = useCallback(() => {
    if (Platform.OS === "web") return

    if (usingNativePlayerRef.current && nativePlayer) {
      try {
        nativePlayer.clear()
        nativePlayer.stop()
      } catch {
        // ignore
      }
      usingNativePlayerRef.current = false
    }

    const queue = queueNodeRef.current
    try {
      queue?.clearBuffers()
    } catch {
      // ignore
    }
    try {
      queue?.stop()
    } catch {
      // ignore
    }

    queueNodeRef.current = null
    startedRef.current = false
    queuedSecondsRef.current = 0
    nativeBacklogUpdatedAtMsRef.current = null
    bufferDurationsRef.current.clear()
    setIsPlayingState(false)
    levelSmoothedRef.current = 0
    onLevelRef.current?.(0)
  }, [])

  const clear = useCallback(() => {
    if (Platform.OS === "web") return

    // Native path: clear queued audio without stopping the engine (avoids restart glitches).
    if (usingNativePlayerRef.current && nativePlayer) {
      try {
        nativePlayer.clear()
      } catch {
        // ignore
      }
      queuedSecondsRef.current = 0
      nativeBacklogUpdatedAtMsRef.current = Date.now()
      // Keep isPlayingState as-is; new enqueues will set it true anyway.
      return
    }

    // AudioContext path: clear queued buffers but keep the engine alive.
    try {
      queueNodeRef.current?.clearBuffers()
    } catch {
      // ignore
    }
    queuedSecondsRef.current = 0
    bufferDurationsRef.current.clear()
  }, [nativePlayer])

  const enqueue = useCallback(
    (base64Chunk: string, chunkSampleRate?: number) => {
      if (!base64Chunk) return
      if (Platform.OS === "web") return

      ensureEngine()

      // Native path: enqueue base64 directly; decode + audio writes happen in native.
      if (usingNativePlayerRef.current && nativePlayer) {
        nativeEnqueueCountRef.current += 1
        const expectedRate = chunkSampleRate ?? sampleRate
        if (expectedRate !== sampleRate) {
          // We currently assume Gemini outputs stable 24kHz mono.
          // If this changes, we should either re-init nativePlayer or resample upstream.
        }

        // Backlog estimate for native player:
        // - Decay existing queued time by wall-clock time since last enqueue (approx consumption).
        // - Add duration of this chunk.
        const nowMs = Date.now()
        const lastMs = nativeBacklogUpdatedAtMsRef.current ?? nowMs
        const elapsedSec = Math.max(0, (nowMs - lastMs) / 1000)
        const beforeDecay = queuedSecondsRef.current
        // Assume native playback consumes at ~1x real-time when running.
        queuedSecondsRef.current = Math.max(0, queuedSecondsRef.current - elapsedSec)
        nativeBacklogUpdatedAtMsRef.current = nowMs

        // base64 bytes ~= len * 3/4; PCM16 frames = bytes/2 (mono).
        const approxBytes = (base64Chunk.length * 3) / 4
        const frames = Math.floor(approxBytes / 2)
        const chunkDurationSec = frames > 0 ? frames / sampleRate : 0
        const beforeAdd = queuedSecondsRef.current
        if (chunkDurationSec > 0) queuedSecondsRef.current += chunkDurationSec

        if (queuedSecondsRef.current > maxBufferSeconds) {
          // Hard safety valve: clear queued audio without restarting the engine.
          // We avoid “partial” dropping because that sounds like fragmentation.
          try {
            nativePlayer.clear()
            queuedSecondsRef.current = 0
            nativeBacklogUpdatedAtMsRef.current = Date.now()
          } catch {
            // If native clear fails, fall back to full interrupt/re-init.
            interrupt()
            ensureEngine()
          }
        }

        try {
          nativePlayer.enqueueBase64(base64Chunk)
          setIsPlayingState(true)
        } catch (e) {
          usingNativePlayerRef.current = false
        }

        void startIfReady()
        return
      }

      const ctx = audioContextRef.current
      const queue = queueNodeRef.current
      if (!ctx || !queue) return

      const expectedRate = chunkSampleRate ?? sampleRate
      if (expectedRate !== sampleRate) {
        // If Gemini ever changes sample rate mid-stream, we’d ideally resample.
        // For now, we’ll still enqueue; audio-api may handle it, but if it sounds wrong,
        // we should resample in a worklet/native layer.
      }

      // Convert PCM16LE base64 -> Float32 samples for audio-api.
      const { samples, level, frames } = pcm16leBase64ToFloat32(base64Chunk)
      if (frames <= 0) return

      // Smooth level for UI.
      const smoothed = 0.3 * level + 0.7 * levelSmoothedRef.current
      levelSmoothedRef.current = smoothed
      onLevelRef.current?.(smoothed)

      // Backlog control: if we’re too far behind, drop buffered audio.
      if (queuedSecondsRef.current > maxBufferSeconds) {
        interrupt()
        ensureEngine()
      }

      const buffer: AudioBuffer = ctx.createBuffer(1, frames, sampleRate)
      buffer.copyToChannel(samples, 0, 0)

      const bufferId = queue.enqueueBuffer(buffer)
      const durationSec = frames / sampleRate
      bufferDurationsRef.current.set(bufferId, durationSec)
      const beforeEnqueue = queuedSecondsRef.current
      queuedSecondsRef.current += durationSec

      enqueueCountRef.current += 1

      void startIfReady()
    },
    [ensureEngine, interrupt, maxBufferSeconds, sampleRate, startIfReady],
  )

  const getStatus = useCallback(async (): Promise<BufferStatus> => {
    // react-native-audio-api doesn’t currently expose detailed buffer stats.
    options.onStatus?.(null)
    return null
  }, [options])

  useEffect(() => {
    // Best-effort cleanup.
    return () => {
      interrupt()
      const ctx = audioContextRef.current
      audioContextRef.current = null
      if (ctx) {
        void ctx.close().catch(() => {
          // ignore
        })
      }
    }
  }, [interrupt])

  const stats = useMemo(
    () => ({
      totalChunksProcessed: enqueueCountRef.current,
      queuedMs: Math.round(queuedSecondsRef.current * 1000),
    }),
    [],
  )

  return {
    isPlaying: isPlayingState,
    level: levelSmoothedRef.current,
    enqueue,
    interrupt,
    clear,
    getStatus,
    stats,
  }
}

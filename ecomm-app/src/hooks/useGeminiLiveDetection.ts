import { useCallback, useEffect, useRef, useState } from "react"

import type { DetectionResult, GeminiLiveConfig } from "@/lib/geminiLive"
import { GeminiLiveClient } from "@/lib/geminiLive"

export type DetectionStatus = "idle" | "connecting" | "connected" | "error"

export type UseGeminiLiveDetectionOptions = {
  /**
   * Throttle outgoing frames to this interval (ms).
   */
  frameIntervalMs?: number
  /**
   * Throttle outgoing audio chunks to this interval (ms).
   */
  audioIntervalMs?: number
}

export function useGeminiLiveDetection(
  config: GeminiLiveConfig,
  options: UseGeminiLiveDetectionOptions = {},
) {
  const frameInterval = options.frameIntervalMs ?? 400
  const audioInterval = options.audioIntervalMs ?? 500

  const [status, setStatus] = useState<DetectionStatus>("idle")
  const [detection, setDetection] = useState<DetectionResult | null>(null)
  const [lastError, setLastError] = useState<unknown>(null)

  const clientRef = useRef<GeminiLiveClient>()
  const lastFrameSentAt = useRef<number>(0)
  const lastAudioSentAt = useRef<number>(0)

  useEffect(() => {
    const client = new GeminiLiveClient(config, {
      onDetection: setDetection,
      onStatus: (s) => {
        if (s === "connecting") setStatus("connecting")
        if (s === "connected") setStatus("connected")
        if (s === "disconnected") setStatus("idle")
        if (s === "error") setStatus("error")
      },
      onError: (err) => {
        setLastError(err)
        setStatus("error")
      },
    })
    clientRef.current = client

    return () => {
      client.close()
      clientRef.current = undefined
    }
  }, [config])

  const start = useCallback(async () => {
    try {
      await clientRef.current?.connect()
    } catch (error) {
      setLastError(error)
      setStatus("error")
    }
  }, [])

  const stop = useCallback(() => {
    clientRef.current?.close()
    setStatus("idle")
  }, [])

  const sendFrameBase64 = useCallback(
    (jpegBase64: string) => {
      const now = Date.now()
      if (now - lastFrameSentAt.current < frameInterval) return
      lastFrameSentAt.current = now
      clientRef.current?.sendFrame(jpegBase64)
    },
    [frameInterval],
  )

  const sendPcmBase64 = useCallback(
    (pcmBase64: string, sampleRate?: number, mimeType?: string) => {
      const now = Date.now()
      if (now - lastAudioSentAt.current < audioInterval) return
      lastAudioSentAt.current = now
      clientRef.current?.sendAudio(pcmBase64, sampleRate, mimeType)
    },
    [audioInterval],
  )

  return {
    status,
    detection,
    lastError,
    start,
    stop,
    sendFrameBase64,
    sendPcmBase64,
  }
}

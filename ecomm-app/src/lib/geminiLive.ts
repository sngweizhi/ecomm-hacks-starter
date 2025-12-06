/**
 * Bounding box defined with normalized coordinates (0-1).
 */
export type NormalizedBoundingBox = {
  x: number
  y: number
  width: number
  height: number
}

export type DetectionResult = {
  detected: boolean
  boundingBox?: NormalizedBoundingBox
  label?: string
  confidence?: number
  rawText?: string
}

export type GeminiLiveConfig = {
  apiKey: string
  model?: string
  /**
   * Optional custom prompt for the model.
   */
  systemPrompt?: string
}

type GeminiLiveCallbacks = {
  onDetection?: (result: DetectionResult) => void
  onStatus?: (status: "connecting" | "connected" | "disconnected" | "error") => void
  onError?: (error: unknown) => void
}

/**
 * Lightweight Gemini Live WebSocket client for streaming video frames (and optional audio)
 * and receiving bounding box JSON responses.
 */
export class GeminiLiveClient {
  private ws?: WebSocket
  private readonly apiKey: string
  private readonly model: string
  private readonly systemPrompt: string
  private readonly callbacks: GeminiLiveCallbacks
  private isClosed = false

  constructor(config: GeminiLiveConfig, callbacks: GeminiLiveCallbacks = {}) {
    this.apiKey = config.apiKey
    this.model = config.model ?? "models/gemini-2.0-flash-live-001"
    this.callbacks = callbacks
    this.systemPrompt =
      config.systemPrompt ??
      [
        "You are assisting a user who is recording video of products to sell.",
        "The user may also speak to indicate which product is the target (e.g., 'this backpack' or 'the one on the right').",
        "Given the latest frame and optional audio hint, respond ONLY with JSON describing one bounding box for the primary product the user refers to.",
        "If unsure, return detected: false.",
        "JSON format:",
        '{',
        '  "detected": boolean,',
        '  "boundingBox": { "x": number, "y": number, "width": number, "height": number },',
        '  "label": string,',
        '  "confidence": number',
        '}',
        "Coordinates are normalized (0-1). Keep responses concise, no markdown.",
      ].join(" ")
  }

  /**
  connects to Gemini Live WebSocket and sends initial setup.
   */
  async connect(): Promise<void> {
    if (this.ws) return

    this.callbacks.onStatus?.("connecting")

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`
    const WSImpl: typeof WebSocket | undefined = (global as any).WebSocket
    if (!WSImpl) {
      throw new Error("WebSocket implementation not found in this environment")
    }

    this.ws = new WSImpl(url)

    this.ws.onopen = () => {
      if (this.isClosed) return
      this.callbacks.onStatus?.("connected")
      this.sendSetup()
    }

    this.ws.onmessage = (event: { data: string | ArrayBuffer }) => {
      if (this.isClosed) return
      const text = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data)
      this.handleMessage(text)
    }

    this.ws.onerror = (err) => {
      this.callbacks.onStatus?.("error")
      this.callbacks.onError?.(err)
    }

    this.ws.onclose = () => {
      if (!this.isClosed) {
        this.callbacks.onStatus?.("disconnected")
      }
      this.ws = undefined
    }
  }

  /**
   * Send a JPEG frame (base64 string, no data URI prefix).
   */
  sendFrame(jpegBase64: string) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return
    const message = {
      realtimeInput: {
        video: {
          data: jpegBase64,
          mimeType: "image/jpeg",
        },
      },
    }
    this.ws.send(JSON.stringify(message))
  }

  /**
   * Send a PCM audio chunk (base64) to give voice guidance.
   * @param pcmBase64 base64-encoded PCM16 audio
   * @param sampleRate defaults to 16000
   */
  sendAudio(pcmBase64: string, sampleRate = 16000, mimeType = `audio/pcm;rate=${sampleRate}`) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return
    const message = {
      realtimeInput: {
        audio: {
          data: pcmBase64,
          mimeType,
        },
      },
    }
    this.ws.send(JSON.stringify(message))
  }

  close() {
    this.isClosed = true
    if (this.ws) {
      this.ws.close()
      this.ws = undefined
    }
  }

  private sendSetup() {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return
    const payload = {
      setup: {
        model: this.model,
        responseModalities: ["TEXT"],
        systemInstruction: {
          parts: [{ text: this.systemPrompt }],
        },
      },
    }
    this.ws.send(JSON.stringify(payload))
  }

  private handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw)
      const textPart =
        msg?.serverContent?.modelTurn?.parts?.find((p: any) => typeof p?.text === "string")?.text ||
        msg?.serverContent?.text

      if (textPart) {
        const detection = this.parseDetection(textPart)
        if (detection) {
          this.callbacks.onDetection?.(detection)
        }
      }
    } catch (error) {
      this.callbacks.onError?.(error)
    }
  }

  private parseDetection(text: string): DetectionResult | null {
    const trimmed = text.trim()
    const detection: DetectionResult = { detected: false, rawText: trimmed }

    try {
      const parsed = JSON.parse(trimmed)
      detection.detected = !!parsed.detected
      detection.boundingBox = parsed.boundingBox
      detection.label = parsed.label
      detection.confidence = typeof parsed.confidence === "number" ? parsed.confidence : undefined
      return detection
    } catch {
      // Model responded with non-JSON text; ignore silently.
      return detection
    }
  }
}

/**
 * Gemini Live API client with function calling support for marketplace listings.
 * Uses the official @google/genai Live SDK for lower-latency transport.
 */

import {
  FunctionResponseScheduling,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  EndSensitivity,
  type LiveServerMessage,
  type Session,
} from "@google/genai"

import { GEMINI_LIVE_LISTING_SYSTEM_PROMPT } from "../../convex/lib/prompts"

function toBase64(data: string | ArrayBuffer | Uint8Array): string | null {
  if (typeof data === "string") {
    return data
  }

  try {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
    let binary = ""
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    if (typeof globalThis.btoa === "function") {
      return globalThis.btoa(binary)
    }
    // Fallback for environments without btoa (manual base64)
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    let base64 = ""
    for (let i = 0; i < binary.length; i += 3) {
      const c1 = binary.charCodeAt(i)
      const c2 = binary.charCodeAt(i + 1)
      const c3 = binary.charCodeAt(i + 2)
      base64 += chars[c1 >> 2]
      base64 += chars[((c1 & 3) << 4) | (c2 >> 4)]
      base64 += Number.isNaN(c2) ? "=" : chars[((c2 & 15) << 2) | (c3 >> 6)]
      base64 += Number.isNaN(c3) ? "=" : chars[c3 & 63]
    }
    return base64
  } catch (error) {
    console.warn("[GeminiLive] Failed to convert inline data to base64", error)
    return null
  }
}

// Response type constants
export const GeminiLiveResponseType = {
  TEXT: "TEXT",
  AUDIO: "AUDIO",
  SETUP_COMPLETE: "SETUP_COMPLETE",
  INTERRUPTED: "INTERRUPTED",
  TURN_COMPLETE: "TURN_COMPLETE",
  TOOL_CALL: "TOOL_CALL",
  ERROR: "ERROR",
  INPUT_TRANSCRIPTION: "INPUT_TRANSCRIPTION",
  OUTPUT_TRANSCRIPTION: "OUTPUT_TRANSCRIPTION",
} as const

export type GeminiLiveResponseTypeValue =
  (typeof GeminiLiveResponseType)[keyof typeof GeminiLiveResponseType]

/**
 * Parsed response message from Gemini Live API
 */
export type GeminiLiveMessage = {
  type: GeminiLiveResponseTypeValue
  data?: unknown
  endOfTurn?: boolean
  /**
   * MIME type for audio data (e.g., "audio/pcm", "audio/wav")
   */
  mimeType?: string
  /**
   * Sample rate extracted from mimeType (e.g., 24000)
   */
  sampleRate?: number
}

/**
 * Function call from Gemini
 */
export type FunctionCall = {
  id: string
  name: string
  args: Record<string, unknown>
}

/**
 * Tool call response data
 */
export type ToolCallData = {
  functionCalls: FunctionCall[]
}

/**
 * Base class for function call definitions
 */
export class FunctionCallDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  requiredParameters: string[]

  constructor(
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    requiredParameters: string[] = [],
  ) {
    this.name = name
    this.description = description
    this.parameters = parameters
    this.requiredParameters = requiredParameters
  }

  /**
   * Override this method to implement the function logic
   */
  async execute(args: Record<string, unknown>): Promise<unknown> {
    console.log(`[FunctionCallDefinition] Default execute for ${this.name}:`, args)
    return { success: true }
  }

  /**
   * Get the function definition for Gemini API setup
   */
  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        ...this.parameters,
        required: this.requiredParameters,
      },
    }
  }
}

export type GeminiLiveConfig = {
  apiKey: string
  model?: string
  systemPrompt?: string
}

type GeminiLiveCallbacks = {
  onMessage?: (message: GeminiLiveMessage) => void
  onToolCall?: (toolCall: ToolCallData) => void
  onStatus?: (status: "connecting" | "connected" | "disconnected" | "error") => void
  onError?: (error: unknown) => void
}

/**
 * Gemini Live WebSocket client with function calling support
 */
export class GeminiLiveClient {
  private session?: Session
  private readonly ai: GoogleGenAI
  private readonly apiKey: string
  private readonly model: string
  private readonly systemPrompt: string
  private readonly callbacks: GeminiLiveCallbacks
  private audioLogCount = 0
  private audioSendLogCount = 0
  private isClosed = false
  private isConnecting = false
  private functions: FunctionCallDefinition[] = []
  private functionsMap: Map<string, FunctionCallDefinition> = new Map()
  private connectStartedAtMs: number | null = null
  // Track recently processed audio chunks to prevent duplicates (simple size-based dedup)
  private recentAudioChunks: Map<string, number> = new Map()
  private readonly AUDIO_DEDUP_WINDOW_MS = 100 // 100ms window for deduplication

  constructor(config: GeminiLiveConfig, callbacks: GeminiLiveCallbacks = {}) {
    this.apiKey = config.apiKey
    this.model = config.model ?? "gemini-2.5-flash-native-audio-preview-09-2025"
    this.callbacks = callbacks
    this.systemPrompt = config.systemPrompt ?? GEMINI_LIVE_LISTING_SYSTEM_PROMPT
    this.ai = new GoogleGenAI({ apiKey: this.apiKey })
  }

  /**
   * Add a function that Gemini can call
   */
  addFunction(func: FunctionCallDefinition) {
    this.functions.push(func)
    this.functionsMap.set(func.name, func)
    console.log("[GeminiLive] Added function:", func.name)
  }

  /**
   * Get a registered function by name
   */
  getFunction(name: string): FunctionCallDefinition | undefined {
    return this.functionsMap.get(name)
  }

  /**
   * Connect using the official Live SDK
   */
  async connect(): Promise<void> {
    if (this.session) {
      console.log("[GeminiLive] connect() called but session already exists, ignoring")
      return
    }
    if (this.isConnecting) {
      console.log("[GeminiLive] connect() already in progress, ignoring")
      return
    }

    console.log("[GeminiLive] Connecting via SDK...")
    this.isConnecting = true
    this.isClosed = false
    this.connectStartedAtMs = Date.now()
    this.callbacks.onStatus?.("connecting")

    const functionDeclarations = this.functions.map((f) => f.getDefinition())
    const toolsConfig =
      functionDeclarations.length > 0 ? ([{ functionDeclarations }] as any) : undefined

    const liveConfig: any = {
      responseModalities: [Modality.AUDIO],
      // Audio output is automatically 24kHz PCM for native audio models
      systemInstruction: {
        parts: [{ text: this.systemPrompt }],
      },
      tools: toolsConfig,
      // Disable thinking for faster responses
      thinkingConfig: {
        thinkingBudget: 0,
      },
      // Configure automatic VAD with low sensitivity to prevent false interruptions
      // from background noise or brief pauses
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
          prefixPaddingMs: 20, // Default from docs
          silenceDurationMs: 100, // Default from docs - reduced from 1500ms to improve responsiveness
        },
      },
    }

    try {
      const session = await this.ai.live.connect({
        model: this.model,
        config: liveConfig,
        callbacks: {
          onopen: () => {
            const elapsed = this.connectStartedAtMs ? Date.now() - this.connectStartedAtMs : null
            console.log("[GeminiLive] Live session OPEN", {
              elapsedMs: elapsed ?? "n/a",
              model: this.model,
            })
            this.isConnecting = false
            if (this.isClosed) return
            this.callbacks.onStatus?.("connected")
          },
          onmessage: (msg: LiveServerMessage) => {
            this.handleServerMessage(msg)
          },
          onerror: (err: any) => {
            console.log("[GeminiLive] Live ERROR:", err)
            this.isConnecting = false
            this.callbacks.onStatus?.("error")
            this.callbacks.onError?.(err)
          },
          onclose: (e: CloseEvent | any) => {
            console.log("[GeminiLive] Live CLOSED, code:", e?.code)
            this.isConnecting = false
            if (!this.isClosed) {
              this.callbacks.onStatus?.("disconnected")
            }
            this.session = undefined
          },
        },
      })

      this.session = session
    } catch (error) {
      console.log("[GeminiLive] connect() failed:", error)
      this.isConnecting = false
      this.callbacks.onStatus?.("error")
      this.callbacks.onError?.(error)
    }
  }

  /**
   * Send a JPEG frame (base64 string, no data URI prefix)
   */
  sendFrame(jpegBase64: string) {
    if (!this.session) return
    const size = jpegBase64.length
    console.log("[GeminiLive] Sending frame", { sizeBytes: size, ts: Date.now() })
    // According to docs, images should be sent via media property
    this.session.sendRealtimeInput({
      media: { data: jpegBase64, mimeType: "image/jpeg" },
    })
  }

  /**
   * Send PCM audio chunk (base64)
   * According to Live API docs, audio should use the 'audio' property
   */
  sendAudio(pcmBase64: string, sampleRate = 16000) {
    if (!this.session) return
    const size = pcmBase64.length
    this.audioSendLogCount += 1
    if (this.audioSendLogCount <= 2 || this.audioSendLogCount % 30 === 0) {
      console.log("[GeminiLive] Sending audio", {
        sizeBytes: size,
        sampleRate,
        ts: Date.now(),
        count: this.audioSendLogCount,
      })
    }
    // According to Live API docs, audio should use 'audio' property, not 'media'
    this.session.sendRealtimeInput({
      audio: { data: pcmBase64, mimeType: `audio/pcm;rate=${sampleRate}` },
    })
  }

  /**
   * Signal start of user activity (required when VAD is disabled)
   */
  sendActivityStart() {
    if (!this.session) return
    console.log("[GeminiLive] Sending activity start")
    this.session.sendRealtimeInput({ activityStart: {} })
  }

  /**
   * Signal end of user activity (required when VAD is disabled)
   */
  sendActivityEnd() {
    if (!this.session) return
    console.log("[GeminiLive] Sending activity end")
    this.session.sendRealtimeInput({ activityEnd: {} })
  }

  /**
   * Send a text message to Gemini
   */
  sendText(text: string) {
    this.session?.sendClientContent({
      turns: [
        {
          role: "user",
          parts: [{ text }],
        },
      ],
      turnComplete: true,
    })
  }

  /**
   * Send a tool/function response back to Gemini
   * According to docs, scheduling should be part of the response object for non-blocking functions
   */
  sendToolResponse(functionCallId: string, response: unknown, functionName?: string) {
    if (!this.session) return
    console.log("[GeminiLive] Sending tool response", {
      id: functionCallId,
      name: functionName,
      ts: Date.now(),
    })

    // According to docs, scheduling should be inside the response object
    // Wrap response if needed and add scheduling for non-blocking behavior
    let responsePayload: Record<string, unknown>
    if (typeof response === "object" && response !== null) {
      responsePayload = { ...(response as Record<string, unknown>) }
    } else {
      responsePayload = { result: response }
    }

    // Add scheduling inside the response object for non-blocking async behavior
    // This allows the model to continue processing without waiting
    responsePayload.scheduling = FunctionResponseScheduling?.SILENT ?? "SILENT"

    this.session.sendToolResponse({
      functionResponses: [
        {
          id: functionCallId,
          name: functionName,
          response: responsePayload,
        },
      ],
    })
  }

  /**
   * Close the Live connection
   */
  close() {
    console.log("[GeminiLive] close() called")
    this.isClosed = true
    this.isConnecting = false
    this.recentAudioChunks.clear() // Clear deduplication cache on close
    if (this.session) {
      this.session.close()
      this.session = undefined
    }
  }

  private handleServerMessage(msg: LiveServerMessage) {
    try {
      const now = Date.now()

      // Log all incoming messages for debugging
      const msgKeys = Object.keys(msg || {})
      if (msgKeys.length > 0) {
        console.log("[GeminiLive] Message received", {
          keys: msgKeys,
          hasServerContent: !!(msg as any).serverContent,
        })
      }

      const setupComplete = (msg as any)?.setupComplete
      if (setupComplete) {
        console.log("[GeminiLive] Setup complete", {
          elapsedMs: this.connectStartedAtMs ? now - this.connectStartedAtMs : "n/a",
        })
        this.callbacks.onMessage?.({
          type: GeminiLiveResponseType.SETUP_COMPLETE,
        })
        return
      }

      const functionCalls: FunctionCall[] = []
      const toolCall = (msg as any)?.toolCall as { functionCalls?: any[] } | undefined
      if (toolCall?.functionCalls?.length) {
        for (const fc of toolCall.functionCalls) {
          functionCalls.push({
            id: fc.id,
            name: fc.name,
            args: fc.args || {},
          })
        }
      }

      // Check for direct data property (audio chunks can come directly)
      // Note: We process this but don't return early, as serverContent may contain
      // additional audio parts that need to be processed
      let processedDirectAudio = false
      if ((msg as any).data) {
        const audioData = (msg as any).data
        const mimeType = (msg as any).mimeType || "audio/pcm"
        const sampleRateMatch = mimeType.match(/rate=(\d+)/i)
        const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : undefined

        let audioBase64: string | null = null
        try {
          audioBase64 = toBase64(audioData)
        } catch (error) {
          console.error("[GeminiLive] Failed to encode direct audio data to base64", error)
        }

        if (audioBase64 && audioBase64.length > 0) {
          // Deduplication: Check if we've seen this exact chunk recently
          const chunkKey = `${audioBase64.length}-${audioBase64.substring(0, 20)}`
          const lastSeen = this.recentAudioChunks.get(chunkKey)

          if (lastSeen && now - lastSeen < this.AUDIO_DEDUP_WINDOW_MS) {
            console.log("[GeminiLive] Skipping duplicate direct audio chunk", {
              size: audioBase64.length,
              timeSinceLastMs: now - lastSeen,
            })
            processedDirectAudio = true
            // Continue to process serverContent for non-audio parts (text, tool calls, etc.)
          } else {
            // Clean up old entries (keep only recent ones)
            for (const [key, timestamp] of this.recentAudioChunks.entries()) {
              if (now - timestamp > this.AUDIO_DEDUP_WINDOW_MS) {
                this.recentAudioChunks.delete(key)
              }
            }
            this.recentAudioChunks.set(chunkKey, now)

            this.audioLogCount += 1
            if (this.audioLogCount <= 2 || this.audioLogCount % 15 === 0) {
              console.log("[GeminiLive] Direct audio chunk received", {
                mimeType,
                sampleRate: sampleRate ?? "default (24000)",
                size: audioBase64.length,
                count: this.audioLogCount,
              })
            }
            this.callbacks.onMessage?.({
              type: GeminiLiveResponseType.AUDIO,
              data: audioBase64,
              mimeType,
              sampleRate: sampleRate ?? 24000, // Default to 24000 if not specified
            })
            processedDirectAudio = true
          }
        }
      }

      const serverContent = msg.serverContent
      if (!serverContent) {
        // Log when we receive messages but no serverContent
        console.log("[GeminiLive] Message has no serverContent", {
          msgKeys: Object.keys(msg || {}),
        })
        return
      }

      if (serverContent) {
        console.log("[GeminiLive] Server content received", {
          hasModelTurn: !!serverContent.modelTurn,
          partsCount: serverContent.modelTurn?.parts?.length || 0,
          turnComplete: !!serverContent.turnComplete,
          interrupted: !!serverContent.interrupted,
          hasInputTranscription: !!serverContent.inputTranscription,
          hasOutputTranscription: !!serverContent.outputTranscription,
        })

        let hasAudioPart = false
        let hasAnyPart = false

        if (serverContent.turnComplete) {
          console.log("[GeminiLive] Turn complete signal received")
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.TURN_COMPLETE,
            endOfTurn: true,
          })
        }

        if (serverContent.interrupted) {
          console.log("[GeminiLive] Interrupted signal received")
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.INTERRUPTED,
          })
        }

        if (serverContent.inputTranscription) {
          console.log("[GeminiLive] Input transcription", {
            text: serverContent.inputTranscription.text?.substring(0, 50) || "",
            finished: serverContent.inputTranscription.finished || false,
          })
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.INPUT_TRANSCRIPTION,
            data: {
              text: serverContent.inputTranscription.text || "",
              finished: serverContent.inputTranscription.finished || false,
            },
          })
        }

        if (serverContent.outputTranscription) {
          console.log("[GeminiLive] Output transcription", {
            text: serverContent.outputTranscription.text?.substring(0, 50) || "",
            finished: serverContent.outputTranscription.finished || false,
          })
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.OUTPUT_TRANSCRIPTION,
            data: {
              text: serverContent.outputTranscription.text || "",
              finished: serverContent.outputTranscription.finished || false,
            },
          })
        }

        const parts = serverContent.modelTurn?.parts
        if (parts?.length) {
          console.log("[GeminiLive] Processing parts", { count: parts.length })
          for (const part of parts) {
            hasAnyPart = true
            if (part.text) {
              console.log("[GeminiLive] Text part received", {
                length: part.text.length,
              })
              this.callbacks.onMessage?.({
                type: GeminiLiveResponseType.TEXT,
                data: part.text,
              })
            } else if ((part as any).functionCall) {
              const fc = (part as any).functionCall
              functionCalls.push({
                id: fc.id,
                name: fc.name,
                args: fc.args || {},
              })
            } else if (part.inlineData) {
              const mimeType = part.inlineData.mimeType || "audio/pcm"

              // Skip audio parts if we already processed direct audio from msg.data
              // This prevents duplicate audio playback when the same audio chunk appears
              // in both msg.data and serverContent.modelTurn.parts
              if (processedDirectAudio && mimeType.startsWith("audio/")) {
                console.log(
                  "[GeminiLive] Skipping inlineData audio (already processed direct audio)",
                  {
                    mimeType,
                  },
                )
                hasAudioPart = true // Mark as having audio part for logging purposes
                continue
              }

              const rawData = part.inlineData.data
              const dataSize = rawData?.length || 0

              // Guard: Skip empty or invalid audio chunks
              if (!rawData || dataSize === 0) {
                console.warn("[GeminiLive] Skipping empty audio chunk", { mimeType, dataSize })
                continue
              }

              // Guard: Validate data is ArrayBuffer/Uint8Array before encoding
              let audioBase64: string | null = null
              try {
                audioBase64 = rawData ? toBase64(rawData) : null
              } catch (error) {
                console.error("[GeminiLive] Failed to encode audio chunk to base64", {
                  error,
                  mimeType,
                  dataSize,
                  dataType: rawData?.constructor?.name,
                })
                continue
              }

              // Guard: Validate base64 encoding succeeded
              if (!audioBase64 || audioBase64.length === 0) {
                console.warn("[GeminiLive] Dropping audio chunk: empty base64 result", {
                  mimeType,
                  rawSize: dataSize,
                })
                continue
              }

              // Extract sample rate from mimeType (e.g., "audio/pcm;rate=24000")
              const sampleRateMatch = mimeType.match(/rate=(\d+)/i)
              const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000 // Default to 24000 if not specified

              // Deduplication: Check if we've seen this exact chunk recently
              const chunkKey = `${audioBase64.length}-${audioBase64.substring(0, 20)}`
              const lastSeen = this.recentAudioChunks.get(chunkKey)

              if (lastSeen && now - lastSeen < this.AUDIO_DEDUP_WINDOW_MS) {
                console.log("[GeminiLive] Skipping duplicate inlineData audio chunk", {
                  size: audioBase64.length,
                  timeSinceLastMs: now - lastSeen,
                })
                hasAudioPart = true // Mark as having audio part for logging purposes
                continue
              }

              // Clean up old entries (keep only recent ones)
              for (const [key, timestamp] of this.recentAudioChunks.entries()) {
                if (now - timestamp > this.AUDIO_DEDUP_WINDOW_MS) {
                  this.recentAudioChunks.delete(key)
                }
              }
              this.recentAudioChunks.set(chunkKey, now)

              this.audioLogCount += 1
              if (this.audioLogCount <= 2 || this.audioLogCount % 15 === 0) {
                console.log(
                  `[GeminiLive] Audio chunk received: mimeType=${mimeType}, rawSize=${dataSize}, base64Size=${audioBase64.length}, sampleRate=${sampleRate}, count=${this.audioLogCount}`,
                )
              }

              hasAudioPart = true
              this.callbacks.onMessage?.({
                type: GeminiLiveResponseType.AUDIO,
                data: audioBase64,
                mimeType,
                sampleRate,
              })
            }
          }
        } else {
          if (serverContent.modelTurn) {
            console.log("[GeminiLive] Server content has modelTurn but no parts array")
          } else {
            console.log("[GeminiLive] Server content without modelTurn or parts")
          }
        }

        if (hasAnyPart && !hasAudioPart) {
          console.warn("[GeminiLive] Server content had parts but no audio parts")
        }
      }

      if (functionCalls.length) {
        console.log("[GeminiLive] Tool call received", {
          count: functionCalls.length,
          ts: now,
        })
        const toolCallData: ToolCallData = { functionCalls }
        this.callbacks.onToolCall?.(toolCallData)
        this.callbacks.onMessage?.({
          type: GeminiLiveResponseType.TOOL_CALL,
          data: toolCallData,
        })
      }
    } catch (error) {
      console.log("[GeminiLive] Message parse error:", error)
      this.callbacks.onError?.(error)
    }
  }
}

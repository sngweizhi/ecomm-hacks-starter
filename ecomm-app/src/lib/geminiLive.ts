/**
 * Gemini Live API client with function calling support for marketplace listings.
 * Note: Live API currently uses WebSocket directly as the SDK's Live API support
 * may not be fully available yet.
 */

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
      behavior: "NON_BLOCKING",
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
 * Default system prompt for marketplace assistant
 */
const DEFAULT_SYSTEM_PROMPT = `You are a product listing assistant. Your ONLY job is to call the create_product_listing function when you detect a product in the video feed and hear the user indicate they want to sell it.

When the user says anything like "sell this", "list this", "how much for this", or shows intent to sell - immediately call create_product_listing with your best assessment of:
- title: Concise product name with brand if visible
- description: Key features and condition
- price: Estimated fair market value in USD
- condition: One of "new", "like_new", "good", "fair", "poor"
- brand: Brand name if visible
- category: One of "electronics", "clothing", "furniture", "books", "sports", "other"
- imagePrompt: Detailed prompt for studio photo generation

Do NOT engage in conversation. Do NOT ask questions. Just call the function.`

/**
 * Gemini Live WebSocket client with function calling support
 */
export class GeminiLiveClient {
  private ws?: WebSocket
  private readonly apiKey: string
  private readonly model: string
  private readonly systemPrompt: string
  private readonly callbacks: GeminiLiveCallbacks
  private isClosed = false
  private functions: FunctionCallDefinition[] = []
  private functionsMap: Map<string, FunctionCallDefinition> = new Map()

  constructor(config: GeminiLiveConfig, callbacks: GeminiLiveCallbacks = {}) {
    this.apiKey = config.apiKey
    this.model = config.model ?? "gemini-live-2.5-flash-preview"
    this.callbacks = callbacks
    this.systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
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
   * Connect to Gemini Live WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws) {
      console.log("[GeminiLive] connect() called but WebSocket already exists")
      return
    }

    console.log("[GeminiLive] Connecting to WebSocket...")
    this.callbacks.onStatus?.("connecting")

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`
    const WSImpl: typeof WebSocket | undefined = (globalThis as any).WebSocket
    if (!WSImpl) {
      throw new Error("WebSocket implementation not found in this environment")
    }

    this.ws = new WSImpl(url)

    this.ws.onopen = () => {
      console.log("[GeminiLive] WebSocket OPEN")
      if (this.isClosed) return
      this.callbacks.onStatus?.("connected")
      this.sendSetup()
    }

    this.ws.onmessage = (event: { data: string | ArrayBuffer }) => {
      if (this.isClosed) return
      const text =
        typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data)
      this.handleMessage(text)
    }

    this.ws.onerror = (err: unknown) => {
      console.log("[GeminiLive] WebSocket ERROR:", err)
      this.callbacks.onStatus?.("error")
      this.callbacks.onError?.(err)
    }

    this.ws.onclose = (event: { code?: number; reason?: string }) => {
      console.log("[GeminiLive] WebSocket CLOSED, code:", event?.code)
      if (!this.isClosed) {
        this.callbacks.onStatus?.("disconnected")
      }
      this.ws = undefined
    }
  }

  /**
   * Send a JPEG frame (base64 string, no data URI prefix)
   */
  sendFrame(jpegBase64: string) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return
    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "image/jpeg",
            data: jpegBase64,
          },
        ],
      },
    }
    this.ws.send(JSON.stringify(message))
  }

  /**
   * Send PCM audio chunk (base64)
   */
  sendAudio(pcmBase64: string, sampleRate = 16000) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return
    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: `audio/pcm;rate=${sampleRate}`,
            data: pcmBase64,
          },
        ],
      },
    }
    this.ws.send(JSON.stringify(message))
  }

  /**
   * Send a text message to Gemini
   */
  sendText(text: string) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return
    const message = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      },
    }
    this.ws.send(JSON.stringify(message))
  }

  /**
   * Send a tool/function response back to Gemini
   */
  sendToolResponse(functionCallId: string, response: unknown) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return
    const message = {
      toolResponse: {
        functionResponses: [
          {
            id: functionCallId,
            response: { result: response },
          },
        ],
      },
    }
    console.log("[GeminiLive] Sending tool response:", message)
    this.ws.send(JSON.stringify(message))
  }

  /**
   * Close the WebSocket connection
   */
  close() {
    console.log("[GeminiLive] close() called")
    this.isClosed = true
    if (this.ws) {
      this.ws.close()
      this.ws = undefined
    }
  }

  private sendSetup() {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return

    // Build function declarations
    const functionDeclarations = this.functions.map((f) => f.getDefinition())

    const payload = {
      setup: {
        model: `models/${this.model}`,
        generationConfig: {
          responseModalities: ["TEXT"],
        },
        systemInstruction: {
          parts: [{ text: this.systemPrompt }],
        },
        tools:
          functionDeclarations.length > 0
            ? { functionDeclarations: functionDeclarations }
            : undefined,
      },
    }

    console.log("[GeminiLive] Sending setup:", JSON.stringify(payload, null, 2))
    this.ws.send(JSON.stringify(payload))
  }

  private handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw)

      // Setup complete
      if (msg?.setupComplete) {
        console.log("[GeminiLive] Setup complete")
        this.callbacks.onMessage?.({
          type: GeminiLiveResponseType.SETUP_COMPLETE,
        })
        return
      }

      // Tool/function call
      if (msg?.toolCall) {
        console.log("[GeminiLive] Tool call received:", msg.toolCall)
        const functionCalls: FunctionCall[] = (msg.toolCall.functionCalls || []).map(
          (fc: { id: string; name: string; args: Record<string, unknown> }) => ({
            id: fc.id,
            name: fc.name,
            args: fc.args || {},
          }),
        )
        const toolCallData: ToolCallData = { functionCalls }
        this.callbacks.onToolCall?.(toolCallData)
        this.callbacks.onMessage?.({
          type: GeminiLiveResponseType.TOOL_CALL,
          data: toolCallData,
        })
        return
      }

      // Server content responses
      const serverContent = msg?.serverContent
      if (serverContent) {
        // Turn complete
        if (serverContent.turnComplete) {
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.TURN_COMPLETE,
            endOfTurn: true,
          })
          return
        }

        // Interrupted
        if (serverContent.interrupted) {
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.INTERRUPTED,
          })
          return
        }

        // Input transcription
        if (serverContent.inputTranscription) {
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.INPUT_TRANSCRIPTION,
            data: {
              text: serverContent.inputTranscription.text || "",
              finished: serverContent.inputTranscription.finished || false,
            },
          })
          return
        }

        // Output transcription
        if (serverContent.outputTranscription) {
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.OUTPUT_TRANSCRIPTION,
            data: {
              text: serverContent.outputTranscription.text || "",
              finished: serverContent.outputTranscription.finished || false,
            },
          })
          return
        }

        // Model turn with parts (text or audio)
        const parts = serverContent.modelTurn?.parts
        if (parts?.length) {
          for (const part of parts) {
            if (part.text) {
              this.callbacks.onMessage?.({
                type: GeminiLiveResponseType.TEXT,
                data: part.text,
              })
            } else if (part.inlineData) {
              this.callbacks.onMessage?.({
                type: GeminiLiveResponseType.AUDIO,
                data: part.inlineData.data,
              })
            }
          }
        }
      }
    } catch (error) {
      console.log("[GeminiLive] Message parse error:", error)
      this.callbacks.onError?.(error)
    }
  }
}

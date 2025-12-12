/**
 * Gemini Live API client with function calling support for marketplace listings.
 * Uses the official @google/genai Live SDK for lower-latency transport.
 */

import {
  Behavior,
  FunctionResponseScheduling,
  GoogleGenAI,
  Modality,
  FunctionCallingConfigMode,
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
   *
   * Returns a function declaration in the format expected by Gemini Live API:
   * {
   *   name: string,
   *   description: string,
   *   behavior: Behavior.NON_BLOCKING (for async execution),
   *   parameters: {
   *     type: "object",
   *     properties: { ... },
   *     required: string[]
   *   }
   * }
   *
   * This matches the format shown in: https://ai.google.dev/gemini-api/docs/live-tools
   * NON_BLOCKING ensures the function runs asynchronously while you can continue interacting with the model.
   */
  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      behavior: Behavior.NON_BLOCKING,
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
  private isClosed = false
  private isConnecting = false
  private functions: FunctionCallDefinition[] = []
  private functionsMap: Map<string, FunctionCallDefinition> = new Map()
  private connectStartedAtMs: number | null = null
  // Track recently processed audio chunks to prevent duplicates (simple size-based dedup)
  private recentAudioChunks: Map<string, number> = new Map()
  private readonly AUDIO_DEDUP_WINDOW_MS = 100 // 100ms window for deduplication
  // Track if setup is complete (like the sample's WebSocketService.isSetupComplete)
  private setupComplete = false
  // Buffer for audio/frames sent before setup is complete
  private pendingAudioBuffer: Array<{ pcmBase64: string; sampleRate: number }> = []
  private pendingFrameBuffer: string[] = []
  private readonly MAX_PENDING_BUFFER_SIZE = 5
  // Track last tool response time and name for debugging self-talk issue
  private lastToolResponseTime: number | null = null
  private lastToolResponseName: string | null = null
  // Track last model audio time for debugging echo/feedback issues
  private lastModelAudioTime: number | null = null
  // Track last tool call time and name for debugging interruption issues
  private lastToolCallTime: number | null = null
  private lastToolCallName: string | null = null
  // Track processed tool call IDs to prevent duplicate processing
  private processedToolCallIds: Set<string> = new Set()
  // Track last turn complete time to detect duplicate turn completes
  private lastTurnCompleteTime: number | null = null
  // Cooldown period for turn complete signals to prevent duplicate processing
  private readonly TURN_COMPLETE_COOLDOWN_MS = 1000 // 1 second cooldown

  constructor(config: GeminiLiveConfig, callbacks: GeminiLiveCallbacks = {}) {
    this.apiKey = config.apiKey
    this.model = config.model ?? "gemini-2.5-flash-native-audio-preview-09-2025"
    this.callbacks = callbacks
    this.systemPrompt = config.systemPrompt ?? GEMINI_LIVE_LISTING_SYSTEM_PROMPT
    this.ai = new GoogleGenAI({
      apiKey: this.apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    })
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
   * Get the timestamp of the last tool response (for debugging)
   */
  getLastToolResponseTime(): number | null {
    return this.lastToolResponseTime
  }

  /**
   * Get the name of the last tool response (for debugging)
   */
  getLastToolResponseName(): string | null {
    return this.lastToolResponseName
  }

  /**
   * Get the timestamp of the last model audio output (for debugging echo/feedback)
   */
  getLastModelAudioTime(): number | null {
    return this.lastModelAudioTime
  }

  /**
   * Get the timestamp of the last tool call (for debugging interruption issues)
   */
  getLastToolCallTime(): number | null {
    return this.lastToolCallTime
  }

  /**
   * Get the name of the last tool call (for debugging interruption issues)
   */
  getLastToolCallName(): string | null {
    return this.lastToolCallName
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

    // Build tools array: include function declarations and Google Search grounding
    const toolsArray: any[] = []

    // Add function declarations if any exist
    if (functionDeclarations.length > 0) {
      toolsArray.push({ functionDeclarations })
    }

    // Always add Google Search grounding tool for real-time web information
    toolsArray.push({ googleSearch: {} })

    const toolsConfig = toolsArray.length > 0 ? toolsArray : undefined

    const liveConfig: any = {
      responseModalities: [Modality.AUDIO],
      // Audio output is automatically 24kHz PCM for native audio models
      systemInstruction: {
        parts: [{ text: this.systemPrompt }],
      },
      tools: toolsConfig,
      // Enable affective dialog for adaptive response style
      enableAffectiveDialog: true,
      // Configure thinking budget for reasoning
      thinkingConfig: {
        thinkingBudget: 0,
      },
      // Configure tool calling to force function calls when appropriate
      ...(toolsConfig && {
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
          },
        },
      }),
      // Configure automatic VAD - Google handles VAD detection automatically
      // Using low sensitivity to prevent false interruptions from background noise
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false, // Enable Google's automatic VAD
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
          prefixPaddingMs: 20, // Include 20ms before speech start
          silenceDurationMs: 100, // Wait 100ms of silence before detecting end
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
   * Check if setup is complete and ready to send audio/frames
   */
  isSetupComplete(): boolean {
    return this.setupComplete && !!this.session
  }

  /**
   * Send a JPEG frame (base64 string, no data URI prefix)
   * Frames are buffered until setup is complete.
   */
  sendFrame(jpegBase64: string) {
    if (!this.session) return

    // Buffer frames until setup is complete (like sample's WebSocketService pattern)
    if (!this.setupComplete) {
      // Keep only most recent frames to prevent unbounded growth
      if (this.pendingFrameBuffer.length >= this.MAX_PENDING_BUFFER_SIZE) {
        this.pendingFrameBuffer.shift()
      }
      this.pendingFrameBuffer.push(jpegBase64)
      console.log("[GeminiLive] Buffering frame (setup not complete)", {
        bufferedFrames: this.pendingFrameBuffer.length,
      })
      return
    }

    const size = jpegBase64.length
    console.log("[GeminiLive] Sending frame", { sizeBytes: size, ts: Date.now() })
    // According to docs, images should be sent via media property
    this.session.sendRealtimeInput({
      media: { data: jpegBase64, mimeType: "image/jpeg" },
    })
  }

  /**
   * Send PCM audio chunk (base64)
   * According to Live API docs, audio should use the 'audio' property.
   * Audio is buffered until setup is complete.
   */
  sendAudio(pcmBase64: string, sampleRate = 16000) {
    if (!this.session) return

    // Buffer audio until setup is complete (like sample's WebSocketService pattern)
    if (!this.setupComplete) {
      // Keep only most recent audio to prevent unbounded growth
      if (this.pendingAudioBuffer.length >= this.MAX_PENDING_BUFFER_SIZE) {
        this.pendingAudioBuffer.shift()
      }
      this.pendingAudioBuffer.push({ pcmBase64, sampleRate })
      return
    }
    // According to Live API docs, audio should use 'audio' property, not 'media'
    this.session.sendRealtimeInput({
      audio: { data: pcmBase64, mimeType: `audio/pcm;rate=${sampleRate}` },
    })
  }

  /**
   * Flush any buffered audio/frames after setup completes
   */
  private flushPendingBuffers() {
    if (!this.session || !this.setupComplete) return

    // Flush buffered frames (only send most recent one to avoid spam)
    if (this.pendingFrameBuffer.length > 0) {
      const latestFrame = this.pendingFrameBuffer.pop()!
      this.pendingFrameBuffer = []
      console.log("[GeminiLive] Flushing buffered frame after setup complete")
      this.session.sendRealtimeInput({
        media: { data: latestFrame, mimeType: "image/jpeg" },
      })
    }

    // Flush buffered audio
    if (this.pendingAudioBuffer.length > 0) {
      for (const { pcmBase64, sampleRate } of this.pendingAudioBuffer) {
        this.session.sendRealtimeInput({
          audio: { data: pcmBase64, mimeType: `audio/pcm;rate=${sampleRate}` },
        })
      }
      this.pendingAudioBuffer = []
    }
  }

  /**
   * Signal start of user activity (deprecated - Google's automatic VAD handles this)
   * Kept for backward compatibility but does nothing
   */
  sendActivityStart() {
    // No-op: Google's automatic VAD handles activity detection
  }

  /**
   * Signal end of user activity (deprecated - Google's automatic VAD handles this)
   * Kept for backward compatibility but does nothing
   */
  sendActivityEnd() {
    // No-op: Google's automatic VAD handles activity detection
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
   * Execute a function call asynchronously and send the response back to Gemini
   * This method ensures non-blocking execution with proper error handling
   */
  async executeFunctionCall(functionCall: FunctionCall): Promise<void> {
    const startTime = Date.now()
    console.log("[GeminiLive] Executing function call", {
      id: functionCall.id,
      name: functionCall.name,
      args: functionCall.args,
      timestamp: startTime,
    })

    const func = this.getFunction(functionCall.name)
    if (!func) {
      console.error(`[GeminiLive] Function not found: ${functionCall.name}`, {
        id: functionCall.id,
        availableFunctions: Array.from(this.functionsMap.keys()),
      })
      this.sendToolResponse(
        functionCall.id,
        {
          success: false,
          error: `Function ${functionCall.name} not found`,
        },
        functionCall.name,
      )
      return
    }

    try {
      // Execute the function asynchronously
      const result = await func.execute(functionCall.args)
      const executionTime = Date.now() - startTime
      console.log("[GeminiLive] Function call completed", {
        id: functionCall.id,
        name: functionCall.name,
        executionTimeMs: executionTime,
        resultType: typeof result,
        resultKeys: typeof result === "object" && result !== null ? Object.keys(result) : undefined,
      })
      // Send the result back with SILENT scheduling (non-blocking)
      this.sendToolResponse(functionCall.id, result, functionCall.name)
    } catch (error) {
      const executionTime = Date.now() - startTime
      console.error(`[GeminiLive] Error executing function ${functionCall.name}`, {
        id: functionCall.id,
        name: functionCall.name,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: executionTime,
      })
      this.sendToolResponse(
        functionCall.id,
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        functionCall.name,
      )
    }
  }

  /**
   * Send a tool/function response back to Gemini
   * According to docs, scheduling should be part of the response object for non-blocking functions
   */
  sendToolResponse(functionCallId: string, response: unknown, functionName?: string) {
    if (!this.session) {
      console.warn("[GeminiLive] Cannot send tool response - session not available", {
        id: functionCallId,
        name: functionName,
      })
      return
    }
    const responseTime = Date.now()
    const responseSummary =
      typeof response === "object" && response !== null
        ? {
            keys: Object.keys(response),
            hasSuccess: "success" in response,
            success: (response as any).success,
          }
        : { type: typeof response }

    console.log("[GeminiLive] Sending tool response", {
      id: functionCallId,
      name: functionName,
      timestamp: responseTime,
      responseSummary,
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
    // Use SILENT scheduling to allow the model to continue generating responses
    // while the function executes asynchronously in the background
    responsePayload.scheduling = FunctionResponseScheduling.SILENT

    // #region agent log
    if (functionName === 'create_product_listing') {
      fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:546',message:'Sending create_product_listing tool response',data:{functionCallId,functionName,scheduling:'SILENT'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    }
    // #endregion

    this.session.sendToolResponse({
      functionResponses: [
        {
          id: functionCallId,
          name: functionName,
          response: responsePayload,
        },
      ],
    })
    
    // Track tool response time for debugging self-talk
    this.lastToolResponseTime = Date.now()
    this.lastToolResponseName = functionName || null
    
    // #region agent log
    if (functionName === 'create_product_listing') {
      fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:571',message:'Tool response sent, tracking subsequent messages',data:{functionCallId,functionName,timeAfterResponse:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    }
    // #endregion
  }

  /**
   * Close the Live connection and reset all state
   */
  close() {
    console.log("[GeminiLive] close() called")
    this.isClosed = true
    this.isConnecting = false
    this.setupComplete = false
    this.recentAudioChunks.clear() // Clear deduplication cache on close
    this.pendingAudioBuffer = [] // Clear any buffered audio
    this.pendingFrameBuffer = [] // Clear any buffered frames
    this.processedToolCallIds.clear() // Clear processed tool call IDs on close
    this.lastTurnCompleteTime = null // Reset turn complete tracking
    if (this.session) {
      this.session.close()
      this.session = undefined
    }
  }

  private handleServerMessage(msg: LiveServerMessage) {
    try {
      const now = Date.now()
      
      // #region agent log
      // Track all incoming messages to identify duplicates
      const msgId = (msg as any)?.id || `msg-${now}-${Math.random()}`
      const hasServerContent = !!msg.serverContent
      const hasToolCall = !!(msg as any)?.toolCall
      const hasData = !!(msg as any)?.data
      fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:656',message:'Server message received',data:{msgId,hasServerContent,hasToolCall,hasData,hasTurnComplete:!!msg.serverContent?.turnComplete,hasInterrupted:!!msg.serverContent?.interrupted,hasParts:!!msg.serverContent?.modelTurn?.parts,partsCount:msg.serverContent?.modelTurn?.parts?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      const setupCompleteMsg = (msg as any)?.setupComplete
      if (setupCompleteMsg) {
        console.log("[GeminiLive] Setup complete", {
          elapsedMs: this.connectStartedAtMs ? now - this.connectStartedAtMs : "n/a",
        })
        // Mark setup as complete and flush any buffered audio/frames
        this.setupComplete = true
        this.flushPendingBuffers()

        this.callbacks.onMessage?.({
          type: GeminiLiveResponseType.SETUP_COMPLETE,
        })
        return
      }

      // According to Live API docs: tool calls come in message.toolCall at the top level
      // https://ai.google.dev/gemini-api/docs/live-tools
      const toolCall = (msg as any)?.toolCall as { functionCalls?: any[] } | undefined
      const serverContent = msg.serverContent // Declare early for use in logging

      const functionCalls: FunctionCall[] = []
      if (toolCall?.functionCalls?.length) {
        console.log("[GeminiLive] Tool call received at top level", {
          count: toolCall.functionCalls.length,
          functionNames: toolCall.functionCalls.map((fc: any) => fc.name),
        })
        // Track tool call time for interruption debugging
        this.lastToolCallTime = now
        this.lastToolCallName = toolCall.functionCalls[0]?.name || null
        
        // #region agent log
        const toolCallIds = toolCall.functionCalls.map((fc: any) => ({ id: fc.id, name: fc.name }))
        fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:616',message:'Tool call received - tracking for interruption',data:{toolCallIds,functionNames:toolCall.functionCalls.map((fc: any) => fc.name),count:toolCall.functionCalls.length,hasInterrupted:!!serverContent?.interrupted,hasTurnComplete:!!serverContent?.turnComplete,processedIds:Array.from(this.processedToolCallIds)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        for (const fc of toolCall.functionCalls) {
          // Deduplicate: Skip if we've already processed this tool call ID
          if (this.processedToolCallIds.has(fc.id)) {
            console.log("[GeminiLive] Skipping duplicate tool call", {
              id: fc.id,
              name: fc.name,
            })
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:693',message:'Duplicate tool call detected - skipping',data:{functionCallId:fc.id,functionName:fc.name,processedIds:Array.from(this.processedToolCallIds)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            continue
          }
          
          // Mark as processed
          this.processedToolCallIds.add(fc.id)
          
          const functionCall: FunctionCall = {
            id: fc.id,
            name: fc.name,
            args: fc.args || {},
          }
          console.log("[GeminiLive] Tool call details", {
            id: functionCall.id,
            name: functionCall.name,
            args: functionCall.args,
            timestamp: now,
          })
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:710',message:'Tool call added to functionCalls array',data:{functionCallId:fc.id,functionName:fc.name,functionCallsLength:functionCalls.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          functionCalls.push(functionCall)
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
        } catch {
          // Failed to encode direct audio data to base64
        }

        if (audioBase64 && audioBase64.length > 0) {
          // Deduplication: Check if we've seen this exact chunk recently
          const chunkKey = `${audioBase64.length}-${audioBase64.substring(0, 20)}`
          const lastSeen = this.recentAudioChunks.get(chunkKey)

          if (lastSeen && now - lastSeen < this.AUDIO_DEDUP_WINDOW_MS) {
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

            // Track model audio time for echo detection
            this.lastModelAudioTime = now
            
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

      if (!serverContent) {
        // If we have function calls, process them before returning
        // Tool calls can come in messages without serverContent
        if (functionCalls.length) {
          console.log("[GeminiLive] Tool call received (no serverContent)", {
            count: functionCalls.length,
            calls: functionCalls.map((fc) => ({
              id: fc.id,
              name: fc.name,
              argsKeys: Object.keys(fc.args || {}),
            })),
            timestamp: now,
          })
          const toolCallData: ToolCallData = { functionCalls }
          this.callbacks.onToolCall?.(toolCallData)
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.TOOL_CALL,
            data: toolCallData,
          })
        }
        // Only return if we don't have direct audio to process
        // Direct audio is already processed above, so we can return safely
        return
      }

      if (serverContent) {
        // Check for Google Search grounding metadata at the serverContent level
        if ((serverContent as any).groundingMetadata) {
          console.log("[GeminiLive] Server-level grounding metadata (Google Search)", {
            hasGroundingChunks: !!(serverContent as any).groundingMetadata?.groundingChunks,
            chunksCount: (serverContent as any).groundingMetadata?.groundingChunks?.length || 0,
            timestamp: now,
          })
        }
        // #region agent log
        const hasTurnComplete = !!serverContent.turnComplete
        const hasInterrupted = !!serverContent.interrupted
        const hasBothSignals = hasTurnComplete && hasInterrupted
        if (hasBothSignals || hasTurnComplete || hasInterrupted) {
          fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:701',message:'Signal flags in message',data:{hasTurnComplete,hasInterrupted,hasBothSignals,hasParts:!!serverContent.modelTurn?.parts,partsCount:serverContent.modelTurn?.parts?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion
        if (serverContent.turnComplete) {
          // Deduplicate: Skip if we've received a turn complete recently (cooldown period)
          const msSinceLastTurnComplete = this.lastTurnCompleteTime ? now - this.lastTurnCompleteTime : null
          const isInTurnCompleteCooldown = msSinceLastTurnComplete !== null && msSinceLastTurnComplete < this.TURN_COMPLETE_COOLDOWN_MS
          
          if (isInTurnCompleteCooldown) {
            console.log("[GeminiLive] Skipping duplicate turn complete (cooldown)", {
              msgId,
              msSinceLastTurnComplete,
              cooldownMs: this.TURN_COMPLETE_COOLDOWN_MS,
            })
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:828',message:'Duplicate turn complete detected - skipping (cooldown)',data:{msgId,msSinceLastTurnComplete,cooldownMs:this.TURN_COMPLETE_COOLDOWN_MS},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return // Don't process duplicate turn complete
          }
          
          console.log("[GeminiLive] Turn complete signal received")
          // #region agent log
          const msSinceLastToolResponse = this.lastToolResponseTime ? now - this.lastToolResponseTime : null
          fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:702',message:'TURN_COMPLETE callback firing',data:{hasInterruptedInSameMessage:hasInterrupted,msSinceLastToolResponse,msSinceLastTurnComplete,lastToolResponseName:this.lastToolResponseName,msgId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          this.lastTurnCompleteTime = now // Track when turn complete was received
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.TURN_COMPLETE,
            endOfTurn: true,
          })
        }

        if (serverContent.interrupted) {
          console.log("[GeminiLive] Interrupted signal received")
          
          // #region agent log
          // Track interruptions relative to tool calls
          const msSinceToolCall = this.lastToolCallTime ? now - this.lastToolCallTime : null
          const msSinceToolResponse = this.lastToolResponseTime ? now - this.lastToolResponseTime : null
          fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:775',message:'INTERRUPTED signal received',data:{hasTurnCompleteInSameMessage:hasTurnComplete,hasParts:!!serverContent.modelTurn?.parts,partsCount:serverContent.modelTurn?.parts?.length||0,msSinceToolCall,msSinceToolResponse,lastToolCallName:this.lastToolCallName,lastToolResponseName:this.lastToolResponseName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.INTERRUPTED,
          })
        }

        if (serverContent.inputTranscription) {
          const transcriptionText = serverContent.inputTranscription.text || ""
          const isFinished = serverContent.inputTranscription.finished || false
          console.log("[GeminiLive] Input transcription", {
            text: transcriptionText.substring(0, 50) || "",
            finished: isFinished,
          })
          
          // #region agent log
          // Track input transcriptions to identify hallucinations (transcriptions when user didn't speak)
          const msSinceLastToolResponse = this.lastToolResponseTime ? now - this.lastToolResponseTime : null
          const msSinceModelAudio = this.lastModelAudioTime ? now - this.lastModelAudioTime : null
          const msSinceLastTurnComplete = this.lastTurnCompleteTime ? now - this.lastTurnCompleteTime : null
          fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:773',message:'Input transcription received',data:{textPreview:transcriptionText.substring(0,100),textLength:transcriptionText.length,isFinished,msSinceLastToolResponse,msSinceModelAudio,msSinceLastTurnComplete,lastToolResponseName:this.lastToolResponseName,msgId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          this.callbacks.onMessage?.({
            type: GeminiLiveResponseType.INPUT_TRANSCRIPTION,
            data: {
              text: transcriptionText,
              finished: isFinished,
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
          for (const part of parts) {
            // Check for Google Search grounding or code execution results
            if ((part as any).codeExecutionResult) {
              console.log("[GeminiLive] Google Search/code execution result detected", {
                hasOutput: !!(part as any).codeExecutionResult?.output,
                outputLength: (part as any).codeExecutionResult?.output?.length || 0,
                timestamp: now,
              })
            }
            if ((part as any).groundingMetadata) {
              console.log("[GeminiLive] Grounding metadata detected (Google Search)", {
                hasGroundingChunks: !!(part as any).groundingMetadata?.groundingChunks,
                chunksCount: (part as any).groundingMetadata?.groundingChunks?.length || 0,
                timestamp: now,
              })
            }
            if (part.text) {
              console.log("[GeminiLive] Text part received", {
                length: part.text.length,
              })
              // #region agent log
              const textPreview = part.text.substring(0, 100)
              const msSinceLastTurnComplete = this.lastTurnCompleteTime ? now - this.lastTurnCompleteTime : null
              fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:791',message:'Text part received',data:{textPreview,textLength:part.text.length,hasTurnComplete:!!serverContent.turnComplete,hasInterrupted:!!serverContent.interrupted,msSinceLastTurnComplete,msgId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              this.callbacks.onMessage?.({
                type: GeminiLiveResponseType.TEXT,
                data: part.text,
              })
            } else if ((part as any).functionCall) {
              // Function calls can also appear in parts (for compatibility)
              const fc = (part as any).functionCall
              
              // Deduplicate: Skip if we've already processed this tool call ID
              if (this.processedToolCallIds.has(fc.id)) {
                console.log("[GeminiLive] Skipping duplicate tool call from parts", {
                  id: fc.id,
                  name: fc.name,
                })
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:906',message:'Duplicate tool call from parts - skipping',data:{functionCallId:fc.id,functionName:fc.name,processedIds:Array.from(this.processedToolCallIds)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                continue
              }
              
              // Mark as processed
              this.processedToolCallIds.add(fc.id)
              
              const functionCall: FunctionCall = {
                id: fc.id,
                name: fc.name,
                args: fc.args || {},
              }
              console.log("[GeminiLive] Tool call found in parts", {
                id: functionCall.id,
                name: functionCall.name,
                args: functionCall.args,
                timestamp: now,
              })
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:927',message:'Tool call from parts added to functionCalls array',data:{functionCallId:fc.id,functionName:fc.name,functionCallsLength:functionCalls.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              functionCalls.push(functionCall)
            } else if (part.inlineData) {
              const mimeType = part.inlineData.mimeType || "audio/pcm"

              // Skip audio parts if we already processed direct audio from msg.data
              // This prevents duplicate audio playback when the same audio chunk appears
              // in both msg.data and serverContent.modelTurn.parts
              if (processedDirectAudio && mimeType.startsWith("audio/")) {
                continue
              }

              const rawData = part.inlineData.data
              const dataSize = rawData?.length || 0

              // Guard: Skip empty or invalid audio chunks
              if (!rawData || dataSize === 0) {
                continue
              }

              // Guard: Validate data is ArrayBuffer/Uint8Array before encoding
              let audioBase64: string | null = null
              try {
                audioBase64 = rawData ? toBase64(rawData) : null
              } catch {
                continue
              }

              // Guard: Validate base64 encoding succeeded
              if (!audioBase64 || audioBase64.length === 0) {
                continue
              }

              // Extract sample rate from mimeType (e.g., "audio/pcm;rate=24000")
              const sampleRateMatch = mimeType.match(/rate=(\d+)/i)
              const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000 // Default to 24000 if not specified

              // Deduplication: Check if we've seen this exact chunk recently
              const chunkKey = `${audioBase64.length}-${audioBase64.substring(0, 20)}`
              const lastSeen = this.recentAudioChunks.get(chunkKey)

              if (lastSeen && now - lastSeen < this.AUDIO_DEDUP_WINDOW_MS) {
                continue
              }

              // Clean up old entries (keep only recent ones)
              for (const [key, timestamp] of this.recentAudioChunks.entries()) {
                if (now - timestamp > this.AUDIO_DEDUP_WINDOW_MS) {
                  this.recentAudioChunks.delete(key)
                }
              }
              this.recentAudioChunks.set(chunkKey, now)

              // #region agent log
              const hasInterruptedFlag = !!serverContent?.interrupted
              const hasTurnCompleteFlag = !!serverContent?.turnComplete
              // Track audio chunks after tool responses to detect self-talk
              const timeSinceLastToolResponse = this.lastToolResponseTime ? now - this.lastToolResponseTime : null
              if (timeSinceLastToolResponse !== null && timeSinceLastToolResponse < 5000) {
                fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:869',message:'Audio chunk received shortly after tool response',data:{hasInterruptedFlag,hasTurnCompleteFlag,chunkSize:audioBase64.length,msSinceToolResponse:timeSinceLastToolResponse,lastToolResponseName:this.lastToolResponseName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              }
              if (hasInterruptedFlag || hasTurnCompleteFlag) {
                fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:872',message:'Audio chunk in message with interrupt/turnComplete',data:{hasInterruptedFlag,hasTurnCompleteFlag,chunkSize:audioBase64.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              }
              // #endregion

              // Track model audio time for echo detection
              this.lastModelAudioTime = now
              
              this.callbacks.onMessage?.({
                type: GeminiLiveResponseType.AUDIO,
                data: audioBase64,
                mimeType,
                sampleRate,
              })
            }
          }
        }
      }

      if (functionCalls.length) {
        console.log("[GeminiLive] Processing tool calls", {
          count: functionCalls.length,
          calls: functionCalls.map((fc) => ({
            id: fc.id,
            name: fc.name,
            argsKeys: Object.keys(fc.args || {}),
          })),
          timestamp: now,
        })
        // #region agent log
        const functionCallIds = functionCalls.map(fc => ({ id: fc.id, name: fc.name }))
        const msSinceLastTurnComplete = this.lastTurnCompleteTime ? now - this.lastTurnCompleteTime : null
        fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiLive.ts:1019',message:'Invoking tool call handler',data:{functionCallIds,count:functionCalls.length,msSinceLastTurnComplete,msgId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
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

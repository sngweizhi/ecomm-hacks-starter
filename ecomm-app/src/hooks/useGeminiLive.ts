import { useCallback, useEffect, useRef, useState } from "react"
import { useAction } from "convex/react"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type {
  FunctionCall,
  GeminiLiveConfig,
  GeminiLiveMessage,
  ToolCallData,
} from "@/lib/geminiLive"
import { GeminiLiveClient, GeminiLiveResponseType } from "@/lib/geminiLive"
import type { ProductListingParams, StoredProductImage } from "@/lib/productListingTool"
import {
  CreateProductListingTool,
  StoreProductImageTool,
  validateProductParams,
} from "@/lib/productListingTool"
import { showSuccessToast, showErrorToast } from "@/utils/toast"

export type GeminiLiveStatus = "idle" | "connecting" | "connected" | "error"

export type ListingCreatedResult = {
  listingId: Id<"listings">
  title: string
  imageUrl?: string
  panelUrl?: string
}

export type UseGeminiLiveOptions = {
  /**
   * Throttle outgoing frames to this interval (ms).
   */
  frameIntervalMs?: number
  /**
   * Throttle outgoing audio chunks to this interval (ms).
   */
  audioIntervalMs?: number
  /**
   * Callback when a listing is successfully created
   */
  onListingCreated?: (result: ListingCreatedResult) => void
  /**
   * Callback when listing creation fails
   */
  onListingError?: (error: string) => void
  /**
   * Callback for text messages from Gemini
   */
  onTextMessage?: (text: string) => void
  /**
   * Callback for audio chunks (base64 PCM) from Gemini
   * @param base64Pcm - Base64-encoded audio data
   * @param mimeType - MIME type of the audio (e.g., "audio/pcm", "audio/wav")
   * @param sampleRate - Sample rate in Hz extracted from mimeType (e.g., 24000)
   */
  onAudioData?: (base64Pcm: string, mimeType?: string, sampleRate?: number) => void
  /**
   * Callback when Gemini sends an interruption signal
   */
  onAudioInterrupted?: () => void
  /**
   * Callback when model's turn is complete
   */
  onTurnComplete?: () => void
}

function toBase64(data: unknown): string | null {
  if (typeof data === "string") {
    return data
  }
  if (data instanceof ArrayBuffer) {
    data = new Uint8Array(data)
  }
  if (data instanceof Uint8Array) {
    const bytes = data
    let binary = ""
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    if (typeof globalThis.btoa === "function") {
      return globalThis.btoa(binary)
    }
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
  }
  return null
}

export function useGeminiLive(config: GeminiLiveConfig, options: UseGeminiLiveOptions = {}) {
  const frameInterval = options.frameIntervalMs ?? 500 // target ~2 FPS by default
  const audioInterval = options.audioIntervalMs ?? 200 // faster audio cadence for lower latency

  const [status, setStatus] = useState<GeminiLiveStatus>("idle")
  const [lastError, setLastError] = useState<unknown>(null)

  const clientRef = useRef<GeminiLiveClient | null>(null)
  const lastFrameSentAt = useRef<number>(0)
  const lastAudioSentAt = useRef<number>(0)
  const frameSentCount = useRef<number>(0)
  const audioSentCount = useRef<number>(0)
  const lastFrameBase64Ref = useRef<string | null>(null)
  const productListingToolRef = useRef<CreateProductListingTool | null>(null)
  // Map of productRef -> array of stored images for that product
  const storedImagesRef = useRef<Map<string, StoredProductImage[]>>(new Map())
  // Track current productRef being worked on (for fallback when productRef missing)
  const currentProductRefRef = useRef<string | null>(null)
  // Track in-flight listing creations to handle concurrency
  const inFlightListingsRef = useRef<Set<string>>(new Set())
  // Track last TURN_COMPLETE time to prevent continuous audio from triggering new responses
  const lastTurnCompleteTimeRef = useRef<number | null>(null)
  // Cooldown period after TURN_COMPLETE during which we don't send audio to prevent VAD false positives
  const TURN_COMPLETE_AUDIO_COOLDOWN_MS = 2000

  // Convex action for generating studio photo and creating listing
  const generateStudioPhotoAndCreateListing = useAction(
    api.productImageGeneration.generateStudioPhotoAndCreateListing,
  )
  const generateProductPanel = useAction(api.productImageGeneration.generateProductPanel)

  // Handle tool calls from Gemini - non-blocking background processing
  const handleToolCall = useCallback(
    (toolCallData: ToolCallData, client: GeminiLiveClient) => {
      const toolCallReceivedTime = Date.now()
      console.log("[useGeminiLive] Tool call received:", toolCallData)
      
      // #region agent log
      // Track tool call reception to debug interruptions
      const functionNames = toolCallData.functionCalls.map(fc => fc.name)
      const functionCallIds = toolCallData.functionCalls.map(fc => ({ id: fc.id, name: fc.name }))
      fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGeminiLive.ts:131',message:'Tool call handler invoked',data:{functionCallIds,functionNames,count:toolCallData.functionCalls.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      for (const functionCall of toolCallData.functionCalls) {
        if (functionCall.name === "store_product_image") {
          const imageBase64 = lastFrameBase64Ref.current
          const description =
            typeof functionCall.args.description === "string"
              ? functionCall.args.description.trim()
              : ""
          
          // Extract productRef or generate/use fallback
          let productRef: string
          if (typeof functionCall.args.productRef === "string" && functionCall.args.productRef.trim()) {
            productRef = functionCall.args.productRef.trim()
            currentProductRefRef.current = productRef
          } else {
            // Fallback: use current productRef or generate a new one
            if (!currentProductRefRef.current) {
              productRef = `product-${Date.now()}`
              currentProductRefRef.current = productRef
            } else {
              productRef = currentProductRefRef.current
            }
          }

          if (!imageBase64) {
            console.error("[useGeminiLive] No frame captured to store")
            client.sendToolResponse(
              functionCall.id,
              {
                success: false,
                error: "No frame available. Please show the product while storing an image.",
              },
              functionCall.name,
            )
            continue
          }

          const record: StoredProductImage = {
            imageBase64,
            description: description || "Unspecified angle/condition",
            timestamp: Date.now(),
          }

          // Get or create image array for this productRef
          const productImages = storedImagesRef.current.get(productRef) || []
          // Keep the most recent 9 images per product
          const updatedImages = [...productImages.slice(-8), record]
          storedImagesRef.current.set(productRef, updatedImages)

          console.log("[useGeminiLive] Image stored successfully", {
            productRef,
            description,
            totalImagesStored: updatedImages.length,
            timestamp: Date.now(),
          })

          client.sendToolResponse(
            functionCall.id,
            {
              success: true,
              imagesStored: updatedImages.length,
              productRef,
            },
            functionCall.name,
          )
          continue
        }

        if (functionCall.name === "create_product_listing") {
          const toolStartedAt = Date.now()
          console.log("[useGeminiLive] Processing create_product_listing", {
            args: functionCall.args,
            ts: toolStartedAt,
          })

          // Validate and extract params
          const params = validateProductParams(functionCall.args)

          // Extract productRef or use current/fallback
          let productRef: string | null = null
          if (typeof functionCall.args.productRef === "string" && functionCall.args.productRef.trim()) {
            productRef = functionCall.args.productRef.trim()
          } else if (currentProductRefRef.current) {
            productRef = currentProductRefRef.current
          }

          // Show immediate success toast - Gemini understood the intent!
          showSuccessToast(
            `${params.title} listing!`,
            "Creating your professional listing...",
          )

          // Get images for this productRef, or fall back to last streamed frame
          let imageBase64: string | null = null
          let storedImages: StoredProductImage[] = []
          
          if (productRef) {
            storedImages = storedImagesRef.current.get(productRef) || []
            imageBase64 = storedImages.at(-1)?.imageBase64 ?? null
          }
          
          // Fallback to last streamed frame if no product-specific images
          if (!imageBase64) {
            imageBase64 = lastFrameBase64Ref.current
          }
          
          if (!imageBase64) {
            console.error("[useGeminiLive] No frame captured for listing creation")
            client.sendToolResponse(
              functionCall.id,
              {
                success: false,
                error: "No image captured. Please try again while pointing the camera at the item.",
              },
              functionCall.name,
            )
            options.onListingError?.("No image captured")
            continue
          }

          // Track this listing creation to prevent duplicate processing (include productRef in key)
          const listingKey = productRef 
            ? `${productRef}-${functionCall.id}-${params.title}`
            : `${functionCall.id}-${params.title}`
          if (inFlightListingsRef.current.has(listingKey)) {
            console.log("[useGeminiLive] Listing already in progress, skipping:", listingKey)
            continue
          }
          inFlightListingsRef.current.add(listingKey)

          // Immediately send acknowledgment to Gemini so it can continue processing
          // This allows the stream to continue without blocking
          client.sendToolResponse(
            functionCall.id,
            {
              success: true,
              message: `Processing listing for "${params.title}" in the background. The user can continue streaming.`,
            },
            functionCall.name,
          )

          // Process listing creation in the background (fire-and-forget)
          void (async () => {
            try {
              let panelUrl: string | undefined
              // Use the stored images for this specific productRef
              const productStoredImages = [...storedImages]

              if (productStoredImages.length > 0) {
                const panelResult = await generateProductPanel({
                  images: productStoredImages,
                  title: params.title,
                  description: params.description,
                  brand: params.brand,
                  category: params.category,
                  toolCallId: functionCall.id,
                  toolCallArgsJson: JSON.stringify(functionCall.args),
                })

                if (panelResult.success && panelResult.panelUrl) {
                  panelUrl = panelResult.panelUrl
                  console.log("[useGeminiLive] Panel generated", {
                    panelUrl,
                    elapsedMs: Date.now() - toolStartedAt,
                  })
                } else {
                  console.warn("[useGeminiLive] Panel generation failed", panelResult.error)
                }
              }

              // Call Convex action to generate studio photo and create listing
              // Include tool call metadata for audit logging
              const result = await generateStudioPhotoAndCreateListing({
                imageBase64,
                title: params.title,
                description: params.description,
                price: params.price,
                condition: params.condition,
                brand: params.brand,
                category: params.category,
                imagePrompt: params.imagePrompt,
                toolCallId: functionCall.id,
                toolCallArgsJson: JSON.stringify(functionCall.args),
              })

              if (result.success && result.listingId) {
                console.log("[useGeminiLive] Listing created", {
                  listingId: result.listingId,
                  productRef,
                  elapsedMs: Date.now() - toolStartedAt,
                })

                // Show success toast
                showSuccessToast(
                  "Listing Created!",
                  `${params.title} is ready for review`,
                )

                // Notify the app (but don't navigate automatically - let user continue)
                options.onListingCreated?.({
                  listingId: result.listingId,
                  title: params.title,
                  imageUrl: result.imageUrl,
                  panelUrl,
                })
              } else {
                throw new Error(result.error || "Failed to create listing")
              }
            } catch (error) {
              console.error("[useGeminiLive] Error creating listing:", error)
              const errorMessage = error instanceof Error ? error.message : "Unknown error"

              showErrorToast("Listing Failed", errorMessage)
              options.onListingError?.(errorMessage)
            } finally {
              console.log("[useGeminiLive] Listing processing finished", {
                productRef,
                elapsedMs: Date.now() - toolStartedAt,
              })
              // Remove from in-flight tracking
              inFlightListingsRef.current.delete(listingKey)
              // Clear stored images ONLY for this productRef (not all products)
              if (productRef) {
                storedImagesRef.current.delete(productRef)
                // Reset current productRef if it was the one we just processed
                if (currentProductRefRef.current === productRef) {
                  currentProductRefRef.current = null
                }
              }
            }
          })()
        } else {
          // Unknown function
          console.warn("[useGeminiLive] Unknown function called:", functionCall.name)
          client.sendToolResponse(
            functionCall.id,
            {
              success: false,
              error: `Unknown function: ${functionCall.name}`,
            },
            functionCall.name,
          )
        }
      }
    },
    [generateStudioPhotoAndCreateListing, options],
  )

  // Handle messages from Gemini
  const handleMessage = useCallback(
    (message: GeminiLiveMessage) => {
      if (message.type === GeminiLiveResponseType.TEXT && typeof message.data === "string") {
        options.onTextMessage?.(message.data)
      } else if (message.type === GeminiLiveResponseType.AUDIO && message.data != null) {
        const base64Audio = toBase64(message.data)
        if (base64Audio && base64Audio.length > 0) {
          // Extract sample rate from message (already parsed in geminiLive.ts)
          const sampleRate = message.sampleRate
          options.onAudioData?.(base64Audio, message.mimeType, sampleRate)
        }
      } else if (message.type === GeminiLiveResponseType.INTERRUPTED) {
        options.onAudioInterrupted?.()
      } else if (message.type === GeminiLiveResponseType.TURN_COMPLETE) {
        // Turn has finished (model completed its response). We don't reset audio here
        // to avoid cutting off the tail of the response; the player will naturally
        // finish as buffered audio is played out.
        console.log("[useGeminiLive] Turn complete")
        // Track TURN_COMPLETE time to implement audio cooldown
        lastTurnCompleteTimeRef.current = Date.now()
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGeminiLive.ts:403',message:'TURN_COMPLETE received - starting audio cooldown',data:{turnCompleteTime:lastTurnCompleteTimeRef.current,cooldownMs:TURN_COMPLETE_AUDIO_COOLDOWN_MS},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        options.onTurnComplete?.()
      }
    },
    [options],
  )

  // Create and configure the client ONCE on mount
  useEffect(() => {
    console.log("[useGeminiLive] Creating client")

    // Create the product listing tool
    const productTool = new CreateProductListingTool()
    const storeImageTool = new StoreProductImageTool()
    productListingToolRef.current = productTool

    // Create the Gemini Live client
    const client = new GeminiLiveClient(config, {
      onMessage: handleMessage,
      onToolCall: (toolCallData) => handleToolCall(toolCallData, client),
      onStatus: (s) => {
        console.log("[useGeminiLive] Status changed:", s)
        if (s === "connecting") setStatus("connecting")
        if (s === "connected") setStatus("connected")
        if (s === "disconnected") setStatus("idle")
        if (s === "error") setStatus("error")
      },
      onError: (err) => {
        console.log("[useGeminiLive] Error:", err)
        setLastError(err)
        setStatus("error")
      },
    })

    // Register the product listing tool
    client.addFunction(productTool)
    client.addFunction(storeImageTool)

    clientRef.current = client

    return () => {
      console.log("[useGeminiLive] Cleanup: closing client")
      client.close()
      clientRef.current = null
      // Reset cooldown timer on cleanup
      lastTurnCompleteTimeRef.current = null
    }
    // Empty deps - only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(async () => {
    console.log("[useGeminiLive] start() called")
    
    // Prevent multiple concurrent connections
    if (status !== "idle") {
      console.log("[useGeminiLive] Already connecting/connected, skipping start()")
      return
    }
    
    try {
      await clientRef.current?.connect()
    } catch (error) {
      console.log("[useGeminiLive] connect() error:", error)
      setLastError(error)
      setStatus("error")
    }
  }, [status])

  const stop = useCallback(() => {
    console.log("[useGeminiLive] stop() called")
    clientRef.current?.close()
    setStatus("idle")
    // Reset cooldown timer on stop
    lastTurnCompleteTimeRef.current = null
  }, [])

  const sendFrameBase64 = useCallback(
    (jpegBase64: string) => {
      const now = Date.now()
      const timeSinceLastFrame = now - lastFrameSentAt.current
      
      if (timeSinceLastFrame < frameInterval) {
        console.log("[useGeminiLive] Frame skipped (throttled)", {
          sinceLastMs: timeSinceLastFrame,
          frameInterval,
        })
        return
      }

      if (!clientRef.current) {
        return
      }

      lastFrameSentAt.current = now
      frameSentCount.current += 1
      // Store the frame for potential listing creation
      lastFrameBase64Ref.current = jpegBase64
      console.log("[useGeminiLive] Sending frame", {
        sizeBytes: jpegBase64.length,
        frameNumber: frameSentCount.current,
        ts: now,
      })
      clientRef.current.sendFrame(jpegBase64)
    },
    [frameInterval],
  )

  const sendPcmBase64 = useCallback(
    (pcmBase64: string, sampleRate?: number) => {
      const now = Date.now()
      
      if (!clientRef.current) {
        return
      }

      // #region agent log
      // Check if we're within cooldown period after TURN_COMPLETE
      const msSinceTurnComplete = lastTurnCompleteTimeRef.current 
        ? now - lastTurnCompleteTimeRef.current 
        : null
      const isInCooldown = msSinceTurnComplete !== null && msSinceTurnComplete < TURN_COMPLETE_AUDIO_COOLDOWN_MS
      
      if (isInCooldown) {
        // Block audio sending during cooldown to prevent Google's VAD from interpreting
        // continuous audio stream as new speech after TURN_COMPLETE
        fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGeminiLive.ts:510',message:'Audio blocked during TURN_COMPLETE cooldown',data:{msSinceTurnComplete,cooldownMs:TURN_COMPLETE_AUDIO_COOLDOWN_MS,audioChunkSize:pcmBase64.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        return // Skip sending audio during cooldown
      }
      // #endregion

      lastAudioSentAt.current = now
      audioSentCount.current += 1
      
      // #region agent log
      // Track if user audio is being sent shortly after tool responses (potential echo/feedback)
      const lastToolResponseTime = clientRef.current?.getLastToolResponseTime()
      const msSinceToolResponse = lastToolResponseTime ? now - lastToolResponseTime : null
      if (msSinceToolResponse !== null && msSinceToolResponse < 10000) {
        const lastToolResponseName = clientRef.current?.getLastToolResponseName()
        fetch('http://127.0.0.1:7242/ingest/0039e2fc-a7e4-4ef9-b946-c52a89a638e6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGeminiLive.ts:510',message:'User audio sent after tool response',data:{msSinceToolResponse,lastToolResponseName,audioChunkSize:pcmBase64.length,audioSentCount:audioSentCount.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      }
      // #endregion
      
      clientRef.current.sendAudio(pcmBase64, sampleRate)
    },
    [],
  )

  const sendText = useCallback((text: string) => {
    clientRef.current?.sendText(text)
  }, [])

  const sendActivityStart = useCallback(() => {
    clientRef.current?.sendActivityStart()
  }, [])

  const sendActivityEnd = useCallback(() => {
    clientRef.current?.sendActivityEnd()
  }, [])

  const clearStoredImages = useCallback(() => {
    storedImagesRef.current.clear()
    currentProductRefRef.current = null
  }, [])

  // Check if Gemini Live setup is complete and ready for audio/frames
  const isSetupComplete = useCallback(() => {
    return clientRef.current?.isSetupComplete() ?? false
  }, [])

  return {
    status,
    lastError,
    start,
    stop,
    sendFrameBase64,
    sendPcmBase64,
    sendText,
    sendActivityStart,
    sendActivityEnd,
    clearStoredImages,
    isSetupComplete,
    clientRef, // Expose for debugging access
  }
}

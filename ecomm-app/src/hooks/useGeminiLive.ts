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
  const audioLogCount = useRef<number>(0)
  const lastFrameBase64Ref = useRef<string | null>(null)
  const productListingToolRef = useRef<CreateProductListingTool | null>(null)
  const storedImagesRef = useRef<StoredProductImage[]>([])
  // Track in-flight listing creations to handle concurrency
  const inFlightListingsRef = useRef<Set<string>>(new Set())

  // Convex action for generating studio photo and creating listing
  const generateStudioPhotoAndCreateListing = useAction(
    api.productImageGeneration.generateStudioPhotoAndCreateListing,
  )
  const generateProductPanel = useAction(api.productImageGeneration.generateProductPanel)

  // Handle tool calls from Gemini - non-blocking background processing
  const handleToolCall = useCallback(
    (toolCallData: ToolCallData, client: GeminiLiveClient) => {
      console.log("[useGeminiLive] Tool call received:", toolCallData)

      for (const functionCall of toolCallData.functionCalls) {
        if (functionCall.name === "store_product_image") {
          const imageBase64 = lastFrameBase64Ref.current
          const description =
            typeof functionCall.args.description === "string"
              ? functionCall.args.description.trim()
              : ""

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

          // Keep the most recent 9 images
          storedImagesRef.current = [...storedImagesRef.current.slice(-8), record]

          client.sendToolResponse(
            functionCall.id,
            {
              success: true,
              imagesStored: storedImagesRef.current.length,
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

          // Show immediate success toast - Gemini understood the intent!
          showSuccessToast(
            `${params.title} listing!`,
            "Creating your professional listing...",
          )

          // Prefer the latest stored frame; fall back to last streamed frame
          const imageBase64 =
            storedImagesRef.current.at(-1)?.imageBase64 ?? lastFrameBase64Ref.current
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

          // Track this listing creation to prevent duplicate processing
          const listingKey = `${functionCall.id}-${params.title}`
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
              const storedImages = [...storedImagesRef.current]

              if (storedImages.length > 0) {
                const panelResult = await generateProductPanel({
                  images: storedImages,
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
                elapsedMs: Date.now() - toolStartedAt,
              })
              // Remove from in-flight tracking
              inFlightListingsRef.current.delete(listingKey)
              // Clear stored images for the next product session
              storedImagesRef.current = []
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
          // Throttle audio logs to reduce JS thread load
          audioLogCount.current += 1
          if (audioLogCount.current <= 2 || audioLogCount.current % 20 === 0) {
            console.log("[useGeminiLive] Received audio chunk", {
              mimeType: message.mimeType,
              sampleRate: sampleRate ?? "default",
              sizeBytes: base64Audio.length,
              count: audioLogCount.current,
            })
          }
          options.onAudioData?.(base64Audio, message.mimeType, sampleRate)
        } else {
          console.warn("[useGeminiLive] Unable to decode audio chunk from Gemini", {
            type: typeof message.data,
            mimeType: message.mimeType,
          })
        }
      } else if (message.type === GeminiLiveResponseType.INTERRUPTED) {
        console.log("[useGeminiLive] Audio interrupted")
        options.onAudioInterrupted?.()
      } else if (message.type === GeminiLiveResponseType.TURN_COMPLETE) {
        // Turn has finished (model completed its response). We don't reset audio here
        // to avoid cutting off the tail of the response; the player will naturally
        // finish as buffered audio is played out.
        console.log("[useGeminiLive] Turn complete")
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

      lastAudioSentAt.current = now
      audioSentCount.current += 1
      // Do not log every chunk to avoid spam, maybe every 10th
      if (audioSentCount.current % 10 === 0) {
        console.log("[useGeminiLive] Sending audio chunk", {
          sizeBytes: pcmBase64.length,
          sampleRate,
          audioNumber: audioSentCount.current,
          ts: now,
        })
      }
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
    storedImagesRef.current = []
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
  }
}

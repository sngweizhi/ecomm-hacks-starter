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
import type { ProductListingParams } from "@/lib/productListingTool"
import { CreateProductListingTool, validateProductParams } from "@/lib/productListingTool"
import { showSuccessToast, showErrorToast } from "@/utils/toast"

export type GeminiLiveStatus = "idle" | "connecting" | "connected" | "error"

export type ListingCreatedResult = {
  listingId: Id<"listings">
  title: string
  imageUrl?: string
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
}

export function useGeminiLive(config: GeminiLiveConfig, options: UseGeminiLiveOptions = {}) {
  const frameInterval = options.frameIntervalMs ?? 1000
  const audioInterval = options.audioIntervalMs ?? 500

  const [status, setStatus] = useState<GeminiLiveStatus>("idle")
  const [lastError, setLastError] = useState<unknown>(null)
  const [isProcessingListing, setIsProcessingListing] = useState(false)

  const clientRef = useRef<GeminiLiveClient | null>(null)
  const lastFrameSentAt = useRef<number>(0)
  const lastAudioSentAt = useRef<number>(0)
  const lastFrameBase64Ref = useRef<string | null>(null)
  const productListingToolRef = useRef<CreateProductListingTool | null>(null)

  // Convex action for generating studio photo and creating listing
  const generateStudioPhotoAndCreateListing = useAction(
    api.productImageGeneration.generateStudioPhotoAndCreateListing,
  )

  // Handle tool calls from Gemini
  const handleToolCall = useCallback(
    async (toolCallData: ToolCallData, client: GeminiLiveClient) => {
      console.log("[useGeminiLive] Tool call received:", toolCallData)

      for (const functionCall of toolCallData.functionCalls) {
        if (functionCall.name === "create_product_listing") {
          console.log("[useGeminiLive] Processing create_product_listing:", functionCall.args)

          // Validate and extract params
          const params = validateProductParams(functionCall.args)

          // Show immediate success toast - Gemini understood the intent!
          showSuccessToast(
            `${params.title} listing!`,
            "Creating your professional listing...",
          )

          // Get the last captured frame
          const imageBase64 = lastFrameBase64Ref.current
          if (!imageBase64) {
            console.error("[useGeminiLive] No frame captured for listing creation")
            client.sendToolResponse(functionCall.id, {
              success: false,
              error: "No image captured. Please try again while pointing the camera at the item.",
            })
            options.onListingError?.("No image captured")
            continue
          }

          setIsProcessingListing(true)

          try {
            // Call Convex action to generate studio photo and create listing
            const result = await generateStudioPhotoAndCreateListing({
              imageBase64,
              title: params.title,
              description: params.description,
              price: params.price,
              condition: params.condition,
              brand: params.brand,
              category: params.category,
              imagePrompt: params.imagePrompt,
            })

            if (result.success && result.listingId) {
              console.log("[useGeminiLive] Listing created:", result.listingId)

              // Send success response to Gemini
              client.sendToolResponse(functionCall.id, {
                success: true,
                message: `Successfully created listing for "${params.title}" at $${params.price}. The user can now review and publish it.`,
                listingId: result.listingId,
              })

              // Notify the app
              options.onListingCreated?.({
                listingId: result.listingId,
                title: params.title,
                imageUrl: result.imageUrl,
              })
            } else {
              throw new Error(result.error || "Failed to create listing")
            }
          } catch (error) {
            console.error("[useGeminiLive] Error creating listing:", error)
            const errorMessage = error instanceof Error ? error.message : "Unknown error"

            client.sendToolResponse(functionCall.id, {
              success: false,
              error: errorMessage,
            })

            options.onListingError?.(errorMessage)
          } finally {
            setIsProcessingListing(false)
          }
        } else {
          // Unknown function
          console.warn("[useGeminiLive] Unknown function called:", functionCall.name)
          client.sendToolResponse(functionCall.id, {
            success: false,
            error: `Unknown function: ${functionCall.name}`,
          })
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
      }
    },
    [options],
  )

  // Create and configure the client
  useEffect(() => {
    console.log("[useGeminiLive] Creating client")

    // Create the product listing tool
    const productTool = new CreateProductListingTool()
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

    clientRef.current = client

    return () => {
      console.log("[useGeminiLive] Cleanup: closing client")
      client.close()
      clientRef.current = null
    }
  }, [config, handleMessage, handleToolCall])

  const start = useCallback(async () => {
    console.log("[useGeminiLive] start() called")
    try {
      await clientRef.current?.connect()
    } catch (error) {
      console.log("[useGeminiLive] connect() error:", error)
      setLastError(error)
      setStatus("error")
    }
  }, [])

  const stop = useCallback(() => {
    console.log("[useGeminiLive] stop() called")
    clientRef.current?.close()
    setStatus("idle")
  }, [])

  const sendFrameBase64 = useCallback(
    (jpegBase64: string) => {
      const now = Date.now()
      if (now - lastFrameSentAt.current < frameInterval) return

      lastFrameSentAt.current = now
      // Store the frame for potential listing creation
      lastFrameBase64Ref.current = jpegBase64
      clientRef.current?.sendFrame(jpegBase64)
    },
    [frameInterval],
  )

  const sendPcmBase64 = useCallback(
    (pcmBase64: string, sampleRate?: number) => {
      const now = Date.now()
      if (now - lastAudioSentAt.current < audioInterval) return

      lastAudioSentAt.current = now
      clientRef.current?.sendAudio(pcmBase64, sampleRate)
    },
    [audioInterval],
  )

  const sendText = useCallback((text: string) => {
    clientRef.current?.sendText(text)
  }, [])

  return {
    status,
    lastError,
    isProcessingListing,
    start,
    stop,
    sendFrameBase64,
    sendPcmBase64,
    sendText,
  }
}

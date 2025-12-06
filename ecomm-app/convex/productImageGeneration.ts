"use node"

import { GoogleGenAI } from "@google/genai"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action } from "./_generated/server"
import { getAuthenticatedUser } from "./lib/auth"

/**
 * Product condition validator
 */
const conditionValidator = v.union(
  v.literal("new"),
  v.literal("like_new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("poor"),
)

/**
 * Product category validator
 */
const categoryValidator = v.union(
  v.literal("electronics"),
  v.literal("clothing"),
  v.literal("furniture"),
  v.literal("books"),
  v.literal("sports"),
  v.literal("other"),
)

/**
 * Generate a professional studio photo and create a draft listing.
 *
 * This action:
 * 1. Calls gemini-3-pro-image-preview to generate a professional product photo
 * 2. Stores the generated image in Convex file storage
 * 3. Creates a draft listing with the image
 *
 * @returns The listing ID and image URL
 */
export const generateStudioPhotoAndCreateListing = action({
  args: {
    // Original image from camera (base64)
    imageBase64: v.string(),
    // Product details from Gemini function call
    title: v.string(),
    description: v.string(),
    price: v.number(),
    condition: conditionValidator,
    brand: v.optional(v.string()),
    category: categoryValidator,
    imagePrompt: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    listingId: v.optional(v.id("listings")),
    imageUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean
    listingId?: Id<"listings">
    imageUrl?: string
    error?: string
  }> => {
    try {
      // Ensure user is authenticated
      const { userId } = await getAuthenticatedUser(ctx)

      // Get Gemini API key
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY not configured")
      }

      console.log("[ProductImageGeneration] Starting image generation for:", args.title)

      // Build the prompt for studio photo generation
      const brandStr = args.brand ? `${args.brand} ` : ""
      const editPrompt = `Remove the background from this image. Isolate the ${brandStr}${args.title} and place it on a clean white studio background. Apply professional e-commerce product photography lighting with soft shadows. The final image should look like a professional marketplace listing photo.`

      // Initialize Google GenAI SDK
      const genAI = new GoogleGenAI({ apiKey })

      // Call Gemini for image editing using the SDK
      // Note: gemini-3-pro-image-preview automatically supports image generation
      const response = await genAI.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [
          {
            role: "user",
            parts: [
              { text: editPrompt },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: args.imageBase64,
                },
              },
            ],
          },
        ],
      })

      console.log("[ProductImageGeneration] Gemini response received")

      // Extract the generated image from the response
      let generatedImageBase64: string | null = null
      const candidates = response.candidates || []

      for (const candidate of candidates) {
        const parts = candidate.content?.parts || []
        for (const part of parts) {
          if (part.inlineData?.data) {
            generatedImageBase64 = part.inlineData.data
            break
          }
        }
        if (generatedImageBase64) break
      }

      // If no generated image, use the original image
      const finalImageBase64 = generatedImageBase64 || args.imageBase64

      // Store the image in Convex file storage
      const imageBlob = Buffer.from(finalImageBase64, "base64")
      const storageId = await ctx.storage.store(new Blob([imageBlob], { type: "image/jpeg" }))
      const imageUrl = await ctx.storage.getUrl(storageId)

      if (!imageUrl) {
        throw new Error("Failed to get image URL from storage")
      }

      console.log("[ProductImageGeneration] Image stored, URL:", imageUrl)

      // Create the draft listing
      const listingId: Id<"listings"> = await ctx.runMutation(
        internal.productImageGenerationMutations.createDraftListing,
        {
          ownerId: userId,
          title: args.title,
          description: args.description,
          price: args.price,
          category: args.category,
          imageUrl,
          condition: args.condition,
          brand: args.brand,
        },
      )

      console.log("[ProductImageGeneration] Draft listing created:", listingId)

      return {
        success: true,
        listingId,
        imageUrl,
      }
    } catch (error) {
      console.error("[ProductImageGeneration] Error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }
    }
  },
})

/**
 * Generate upload URL for direct image upload from client
 * (Alternative approach if server-side generation is too slow)
 */
export const generateUploadUrl = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await getAuthenticatedUser(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

"use node"

import { GoogleGenAI } from "@google/genai"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action, internalAction } from "./_generated/server"
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

const storedImageValidator = v.object({
  imageBase64: v.string(),
  description: v.string(),
  timestamp: v.optional(v.number()),
})

const PANEL_PROMPT = `
Analyze the entire composition of the input image. Identify ALL key items present (whether it’s a single product, a small set, or multiple related pieces) and their spatial relationship/arrangement.

Generate a cohesive 3x3 “College Marketplace Product Sheet” featuring 9 distinct camera angles of exactly these items isolated on a studio white background. Prioritize views that help buyers quickly understand condition, size, and usability of the item(s). No lifestyle or heavily styled shots — keep the focus on the real product as a buyer would receive it.

CRITICAL BACKGROUND REQUIREMENT:
- Every panel MUST have a pure studio white background (RGB 255, 255, 255 or very close to it).
- The product must be isolated on its own with NO other objects, items, or elements in the background.
- Remove all background elements, surfaces, textures, or distractions.
- The product should appear as if photographed in a professional product photography studio with a seamless white backdrop.
- Only the product itself should be visible, with soft shadows beneath it if needed for depth perception.

Row 1 – Overall Views (What am I buying?)
1. Full Product Shot (Primary View): The complete item (or full set) clearly visible in its entirety, centered, and evenly lit against a pure studio white background. The product must be isolated with no other objects visible.
2. 3/4 Angle Shot: Product angled to show depth, typically showing the front and one side. This should help buyers understand shape, thickness, and overall form. Product isolated on studio white background.
3. Scale/Context Shot: The full item shown with a common college object for size reference (e.g., laptop, water bottle, notebook) OR positioned so its size relative to a typical desk/floor is obvious. Both the product and reference object must be isolated on a pure studio white background with no other elements.

Row 2 – Condition & Key Features (Is it functional and what’s included?)
1. Front-Facing Shot: Straight-on view of the main usable side (e.g., front of a mini-fridge, screen side of a laptop, seating side of a chair). Product isolated on studio white background.
2. Key Feature Close-Up: Close-up of the most important functional feature (e.g., laptop ports/keyboard, shelf inside a fridge, adjustment knobs on a chair, storage compartments in a backpack). Feature isolated on studio white background.
3. Condition Detail Shot: Tight framing on any area that matters for used-condition evaluation: labels, corners, seams, controls, or areas that typically show wear. Detail isolated on studio white background.

Row 3 – Wear, Material, and Extra Angles (What’s the true condition?)
1. Wear & Tear Macro: Extreme close-up on representative material/finish areas that show condition: fabric wear, scratches, scuffs, chipped paint, fraying, etc. If the item is in like-new condition, show a clean, detailed close-up of the material. Isolated on studio white background.
2. Low / Underside Angle: Upward or low-angle shot that reveals the base or underside (e.g., chair legs, bottom of a microwave, underside of a desk) to show stability and hidden wear points. Isolated on studio white background.
3. Top-Down Shot: Overhead view looking directly down at the product(s), clearly showing overall footprint and what is included (e.g., all parts, accessories, cables, shelves). All items isolated on studio white background.

Global Requirements
- Use the same item(s), same setup, and same lighting across all 9 panels.
- EVERY panel MUST have a pure studio white background (RGB 255, 255, 255) with the product isolated on its own.
- NO other objects, surfaces, textures, or background elements should be visible in any panel.
- The product should appear as if photographed in a professional product photography studio.
- Depth of field may vary (milder background blur on close-ups is fine), but the product details must remain clearly visible and sharp.
- Composition should prioritize honesty and clarity over stylization, so buyers can accurately judge what they are getting and the item’s real condition.
`.trim()

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
    // Tool call metadata for audit logging
    toolCallId: v.optional(v.string()),
    toolCallArgsJson: v.optional(v.string()),
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
    const startTime = Date.now()
    const modelName = "gemini-3-pro-image-preview"
    let userId: string | undefined
    let finalImageUrl: string | undefined
    let listingId: Id<"listings"> | undefined
    let errorMessage: string | undefined

    try {
      // Ensure user is authenticated
      const { userId: authenticatedUserId } = await getAuthenticatedUser(ctx)
      userId = authenticatedUserId

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
      finalImageUrl = imageUrl

      // Create the draft listing
      listingId = await ctx.runMutation(
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

      // Log audit record for success
      if (userId && args.toolCallId && args.toolCallArgsJson) {
        const durationMs = Date.now() - startTime
        await ctx.runMutation(internal.productImageGenerationMutations.logAuditRecord, {
          userId,
          toolCallId: args.toolCallId,
          functionName: "create_product_listing",
          toolCallArgsJson: args.toolCallArgsJson,
          actionArgsSnapshot: {
            title: args.title,
            description: args.description,
            price: args.price,
            condition: args.condition,
            brand: args.brand,
            category: args.category,
            imagePrompt: args.imagePrompt,
          },
          finalImageUrl,
          listingId,
          status: "success",
          modelName,
          durationMs,
        })
      }

      return {
        success: true,
        listingId,
        imageUrl,
      }
    } catch (error) {
      console.error("[ProductImageGeneration] Error:", error)
      errorMessage = error instanceof Error ? error.message : "Unknown error occurred"

      // Log audit record for failure
      if (userId && args.toolCallId && args.toolCallArgsJson) {
        const durationMs = Date.now() - startTime
        try {
          await ctx.runMutation(internal.productImageGenerationMutations.logAuditRecord, {
            userId,
            toolCallId: args.toolCallId,
            functionName: "create_product_listing",
            toolCallArgsJson: args.toolCallArgsJson,
            actionArgsSnapshot: {
              title: args.title,
              description: args.description,
              price: args.price,
              condition: args.condition,
              brand: args.brand,
              category: args.category,
              imagePrompt: args.imagePrompt,
            },
            finalImageUrl,
            listingId,
            status: "failed",
            error: errorMessage,
            modelName,
            durationMs,
          })
        } catch (auditError) {
          // Don't fail the main operation if audit logging fails
          console.error("[ProductImageGeneration] Failed to log audit record:", auditError)
        }
      }

      return {
        success: false,
        error: errorMessage,
      }
    }
  },
})

/**
 * Generate a 3x3 storyboard/panel of product angles using reference frames.
 * Internal version that can be called from other internal actions.
 */
export const generateProductPanelInternal = internalAction({
  args: {
    images: v.array(storedImageValidator),
    title: v.string(),
    description: v.string(),
    brand: v.optional(v.string()),
    category: categoryValidator,
    // Tool call metadata for audit logging
    toolCallId: v.optional(v.string()),
    toolCallArgsJson: v.optional(v.string()),
    // Optional userId for internal calls
    userId: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    panelUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const startTime = Date.now()
    const modelName = "gemini-3-pro-image-preview"
    let userId: string | undefined
    let panelUrl: string | undefined
    let errorMessage: string | undefined

    try {
      // For internal calls, userId should be provided by caller
      // If not provided, try to authenticate (for backward compatibility)
      userId = args.userId
      if (!userId) {
        try {
          const { userId: authenticatedUserId } = await getAuthenticatedUser(ctx)
          userId = authenticatedUserId
        } catch {
          // If auth fails (e.g., internal call), userId remains undefined
          // Audit logging will be skipped
        }
      }

      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY not configured")
      }

      if (!args.images.length) {
        throw new Error("No reference images provided")
      }

      // Use up to 9 most recent images
      const referenceImages = args.images.slice(-9)
      const genAI = new GoogleGenAI({ apiKey })

      const refParts = referenceImages.flatMap((img, idx) => [
        {
          text: `Reference ${idx + 1}: ${img.description || "No description"}`,
        },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: img.imageBase64,
          },
        },
      ])

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${PANEL_PROMPT}\n\nProduct: ${args.title}\nCategory: ${args.category}${
                  args.brand ? `\nBrand: ${args.brand}` : ""
                }\nNotes: ${args.description}`,
              },
              ...refParts,
            ],
          },
        ],
        config: {
          generationConfig: {
            imageConfig: {
              imageSize: "1K",
            },
          },
        },
      })

      let panelBase64: string | undefined
      const candidates = response.candidates || []
      for (const candidate of candidates) {
        const parts = candidate.content?.parts || []
        for (const part of parts) {
          const inlineData = part.inlineData?.data
          if (typeof inlineData === "string" && inlineData) {
            panelBase64 = inlineData
            break
          }
        }
        if (panelBase64) break
      }

      if (!panelBase64) {
        throw new Error("Gemini did not return a panel image")
      }

      const panelBlob = Buffer.from(panelBase64, "base64")
      const storageId = await ctx.storage.store(new Blob([panelBlob], { type: "image/jpeg" }))
      const storedUrl = await ctx.storage.getUrl(storageId)

      if (!storedUrl) {
        throw new Error("Failed to get panel image URL from storage")
      }
      panelUrl = storedUrl

      // Optional: audit record for success
      if (userId && args.toolCallId && args.toolCallArgsJson) {
        const durationMs = Date.now() - startTime
        await ctx.runMutation(internal.productImageGenerationMutations.logAuditRecord, {
          userId,
          toolCallId: args.toolCallId,
          functionName: "generate_product_panel",
          toolCallArgsJson: args.toolCallArgsJson,
          actionArgsSnapshot: {
            title: args.title,
            description: args.description,
            price: 0,
            condition: "good",
            brand: args.brand,
            category: args.category,
            imagePrompt: "panel_generation",
          },
          finalImageUrl: panelUrl,
          status: "success",
          modelName,
          durationMs,
        })
      }

      return {
        success: true,
        panelUrl,
      }
    } catch (error) {
      console.error("[ProductImageGeneration] Panel generation error:", error)
      errorMessage = error instanceof Error ? error.message : "Unknown error occurred"

      if (userId && args.toolCallId && args.toolCallArgsJson) {
        const durationMs = Date.now() - startTime
        try {
          await ctx.runMutation(internal.productImageGenerationMutations.logAuditRecord, {
            userId,
            toolCallId: args.toolCallId,
            functionName: "generate_product_panel",
            toolCallArgsJson: args.toolCallArgsJson,
            actionArgsSnapshot: {
              title: args.title,
              description: args.description,
              price: 0,
              condition: "good",
              brand: args.brand,
              category: args.category,
              imagePrompt: "panel_generation",
            },
            finalImageUrl: panelUrl,
            status: "failed",
            error: errorMessage,
            modelName,
            durationMs,
          })
        } catch (auditError) {
          console.error("[ProductImageGeneration] Failed to log audit record:", auditError)
        }
      }

      return {
        success: false,
        error: errorMessage,
      }
    }
  },
})

/**
 * Public wrapper for generating a 3x3 storyboard/panel of product angles.
 * Calls the internal version after authenticating the user.
 */
export const generateProductPanel = action({
  args: {
    images: v.array(storedImageValidator),
    title: v.string(),
    description: v.string(),
    brand: v.optional(v.string()),
    category: categoryValidator,
    // Tool call metadata for audit logging
    toolCallId: v.optional(v.string()),
    toolCallArgsJson: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    panelUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean
    panelUrl?: string
    error?: string
  }> => {
    // Authenticate user
    const { userId } = await getAuthenticatedUser(ctx)
    
    // Call internal version with userId
    return await ctx.runAction(internal.productImageGeneration.generateProductPanelInternal, {
      ...args,
      userId,
    })
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

"use node"

/**
 * Analyze product photos using Gemini Flash 2.5 to generate listing details
 * Similar to Gemini Live API schema but using batch photo analysis
 */

import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai"
import { v } from "convex/values"

import { action } from "./_generated/server"

/**
 * System prompt for analyzing product photos and generating listing details
 */
const PHOTO_ANALYSIS_PROMPT = `You are a product listing assistant analyzing photos of items for sale. Analyze the provided product photos and extract all relevant listing details.

Your task is to:
1. Identify the product (title, brand if visible)
2. Assess the condition based on visible wear, damage, or defects
3. Estimate a fair market price based on the item type, brand, and condition
4. Determine the appropriate category
5. Write a detailed description highlighting features, condition, and any visible defects

Be thorough and accurate. If you cannot determine certain details, make reasonable estimates but indicate uncertainty in the description.

Return the listing details using the create_product_listing function.`

/**
 * Function schema for product listing creation (matches Gemini Live API)
 */
const createProductListingFunction = {
  name: "create_product_listing",
  description:
    "Creates a marketplace listing from analyzed product photos. Call this after analyzing all photos.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "A concise, marketable product title (e.g., 'Sony WH-1000XM4 Wireless Headphones', 'Nike Air Max 90 Sneakers Size 10'). Include brand and model if visible.",
      },
      description: {
        type: "string",
        description:
          "A detailed product description including visible features (color, size, material), condition details, any visible defects or wear, selling points, and relevant specifications. Be honest about condition.",
      },
      price: {
        type: "number",
        description:
          "The estimated asking price in USD. Base this on the item type, brand (if visible), condition, and typical market value for similar used items. Be realistic.",
      },
      condition: {
        type: "string",
        enum: ["new", "like_new", "good", "fair", "poor"],
        description:
          "The product condition based on visible assessment: 'new' (unused, in packaging), 'like_new' (barely used, excellent condition), 'good' (normal wear, fully functional), 'fair' (visible wear but functional), 'poor' (significant wear or issues)",
      },
      brand: {
        type: "string",
        description:
          "The brand or manufacturer name if visible on the product or identifiable from logos/labels. Leave empty string if unknown.",
      },
      category: {
        type: "string",
        enum: ["electronics", "clothing", "furniture", "books", "sports", "other"],
        description:
          "The most appropriate product category: 'electronics' (phones, laptops, headphones, etc.), 'clothing' (apparel, shoes, accessories), 'furniture' (chairs, desks, home items), 'books' (textbooks, novels), 'sports' (equipment, gear), 'other' (anything else)",
      },
      imagePrompt: {
        type: "string",
        description:
          "A detailed prompt for generating a professional studio product photo. Format: 'Professional product photo of [detailed item description including color, brand, key features] on clean white background, studio lighting, high resolution, e-commerce style, isolated subject'",
      },
    },
    required: ["title", "description", "price", "condition", "category", "imagePrompt"],
  },
}

/**
 * Analyze product photos and generate listing details
 */
export const analyzeProductPhotos = action({
  args: {
    photos: v.array(v.string()), // Array of base64 image strings
  },
  handler: async (ctx, args): Promise<{
    success: boolean
    listingDetails?: {
      title: string
      description: string
      price: number
      condition: "new" | "like_new" | "good" | "fair" | "poor"
      brand?: string
      category: "electronics" | "clothing" | "furniture" | "books" | "sports" | "other"
      imagePrompt: string
    }
    error?: string
  }> => {
    try {
      // Get Gemini API key
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY not configured")
      }

      if (!args.photos || args.photos.length === 0) {
        throw new Error("No photos provided")
      }

      console.log("[analyzeProductPhotos] Starting analysis", {
        photoCount: args.photos.length,
      })

      // Initialize Google GenAI SDK
      const genAI = new GoogleGenAI({ apiKey })

      // Prepare image parts for the API
      const imageParts = args.photos.map((photoBase64: string) => {
        // Handle both data URIs and plain base64
        let base64Data = photoBase64
        if (photoBase64.startsWith("data:")) {
          const base64Match = photoBase64.match(/base64,(.+)$/)
          if (base64Match) {
            base64Data = base64Match[1]
          }
        }

        return {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data,
          },
        }
      })

      // Build the user message with images and prompt
      const userMessage = {
        role: "user" as const,
        parts: [
          {
            text: `Analyze these ${args.photos.length} product photo(s) and extract all listing details. Look at all angles and details visible across the photos.`,
          },
          ...imageParts,
        ],
      }

      // Call Gemini Flash 2.0 with function calling
      const response = await genAI.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [
          {
            role: "user",
            parts: [
              { text: PHOTO_ANALYSIS_PROMPT },
              ...imageParts,
            ],
          },
        ],
        config: {
          tools: [
            {
              functionDeclarations: [createProductListingFunction],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
            },
          },
        },
      })

      console.log("[analyzeProductPhotos] Gemini response received")

      // Extract function call from response
      const candidates = response.candidates || []
      if (candidates.length === 0) {
        throw new Error("No response candidates from Gemini")
      }

      const candidate = candidates[0]
      const parts = candidate.content?.parts || []
      
      // Find function call in response parts
      let functionCall: any = null
      for (const part of parts) {
        if (part.functionCall?.name === "create_product_listing") {
          functionCall = part.functionCall
          break
        }
      }

      if (!functionCall) {
        // Try to parse text response as fallback
        const textParts = parts.filter((part: any) => part.text)
        if (textParts.length > 0) {
          console.warn("[analyzeProductPhotos] No function call found, got text response:", textParts[0].text)
        }
        throw new Error("No function call returned from Gemini")
      }

      const functionArgs = typeof functionCall.args === "string" 
        ? JSON.parse(functionCall.args) 
        : functionCall.args

      // Validate and normalize the response
      const listingDetails = {
        title: typeof functionArgs.title === "string" ? functionArgs.title.trim() : "Untitled Item",
        description: typeof functionArgs.description === "string" ? functionArgs.description.trim() : "",
        price: typeof functionArgs.price === "number" && functionArgs.price > 0 ? functionArgs.price : 0,
        condition: ["new", "like_new", "good", "fair", "poor"].includes(functionArgs.condition)
          ? (functionArgs.condition as "new" | "like_new" | "good" | "fair" | "poor")
          : ("good" as const),
        brand: typeof functionArgs.brand === "string" && functionArgs.brand.trim() ? functionArgs.brand.trim() : undefined,
        category: ["electronics", "clothing", "furniture", "books", "sports", "other"].includes(
          functionArgs.category,
        )
          ? (functionArgs.category as "electronics" | "clothing" | "furniture" | "books" | "sports" | "other")
          : ("other" as const),
        imagePrompt:
          typeof functionArgs.imagePrompt === "string"
            ? functionArgs.imagePrompt.trim()
            : `Professional product photo of ${functionArgs.title || "item"} on clean white background, studio lighting, high resolution, e-commerce style, isolated subject`,
      }

      console.log("[analyzeProductPhotos] Analysis complete", {
        title: listingDetails.title,
        price: listingDetails.price,
        condition: listingDetails.condition,
        category: listingDetails.category,
      })

      return {
        success: true,
        listingDetails,
      }
    } catch (error) {
      console.error("[analyzeProductPhotos] Error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }
    }
  },
})

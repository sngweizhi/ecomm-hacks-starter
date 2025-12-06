/**
 * Product Listing Tool for Gemini Function Calling
 *
 * This tool is called by Gemini when a user indicates they want to sell an item.
 * It captures product details and triggers the listing creation flow.
 */

import { FunctionCallDefinition } from "./geminiLive"

/**
 * Product condition enum
 */
export type ProductCondition = "new" | "like_new" | "good" | "fair" | "poor"

/**
 * Product category enum
 */
export type ProductCategory =
  | "electronics"
  | "clothing"
  | "furniture"
  | "books"
  | "sports"
  | "other"

/**
 * Product listing parameters extracted by Gemini
 */
export type ProductListingParams = {
  /** Product title/name */
  title: string
  /** Detailed product description */
  description: string
  /** Asking price in USD */
  price: number
  /** Product condition */
  condition: ProductCondition
  /** Brand name (if identifiable) */
  brand?: string
  /** Product category */
  category: ProductCategory
  /** Descriptive prompt for studio photo generation */
  imagePrompt: string
}

/**
 * Stored product image captured via Gemini function calls
 */
export type StoredProductImage = {
  imageBase64: string
  description: string
  timestamp: number
}

/**
 * Validates and normalizes product listing parameters
 */
export function validateProductParams(args: Record<string, unknown>): ProductListingParams {
  const title = typeof args.title === "string" ? args.title : "Untitled Item"
  const description = typeof args.description === "string" ? args.description : ""
  const price = typeof args.price === "number" ? args.price : 0
  const brand = typeof args.brand === "string" ? args.brand : undefined

  // Validate condition
  const validConditions: ProductCondition[] = ["new", "like_new", "good", "fair", "poor"]
  const condition: ProductCondition = validConditions.includes(args.condition as ProductCondition)
    ? (args.condition as ProductCondition)
    : "good"

  // Validate category
  const validCategories: ProductCategory[] = [
    "electronics",
    "clothing",
    "furniture",
    "books",
    "sports",
    "other",
  ]
  const category: ProductCategory = validCategories.includes(args.category as ProductCategory)
    ? (args.category as ProductCategory)
    : "other"

  // Generate default image prompt if not provided
  const imagePrompt =
    typeof args.imagePrompt === "string"
      ? args.imagePrompt
      : `Professional product photo of ${title} on clean white background, studio lighting, high resolution, e-commerce style, isolated subject`

  return {
    title,
    description,
    price,
    condition,
    brand,
    category,
    imagePrompt,
  }
}

/**
 * CreateProductListingTool - Called by Gemini to create a marketplace listing
 */
export class CreateProductListingTool extends FunctionCallDefinition {
  private onExecute?: (params: ProductListingParams) => Promise<{ success: boolean; listingId?: string; error?: string }>

  constructor(
    onExecute?: (params: ProductListingParams) => Promise<{ success: boolean; listingId?: string; error?: string }>,
  ) {
    super(
      "create_product_listing",
      "Creates a marketplace listing when a user indicates they want to sell an item they are showing. Call this function after gathering enough information about the product from the user's description and the video feed.",
      {
        properties: {
          title: {
            type: "string",
            description:
              "A concise, marketable product title (e.g., 'Sony WH-1000XM4 Wireless Headphones', 'Nike Air Max 90 Sneakers Size 10')",
          },
          description: {
            type: "string",
            description:
              "A detailed product description including features, condition details mentioned by the user, selling points, and any relevant specifications",
          },
          price: {
            type: "number",
            description:
              "The asking price in USD. Use the price mentioned by the user, or estimate a fair market value based on the item type, brand, and condition",
          },
          condition: {
            type: "string",
            enum: ["new", "like_new", "good", "fair", "poor"],
            description:
              "The product condition: 'new' (unused, in packaging), 'like_new' (barely used, excellent condition), 'good' (normal wear, fully functional), 'fair' (visible wear but functional), 'poor' (significant wear or issues)",
          },
          brand: {
            type: "string",
            description:
              "The brand or manufacturer name if visible on the product or mentioned by the user. Leave empty if unknown.",
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
      },
      ["title", "description", "price", "category", "imagePrompt"],
    )

    this.onExecute = onExecute
  }

  /**
   * Set the execution callback
   */
  setExecuteCallback(
    callback: (params: ProductListingParams) => Promise<{ success: boolean; listingId?: string; error?: string }>,
  ) {
    this.onExecute = callback
  }

  /**
   * Execute the tool - validates params and calls the callback
   */
  async execute(args: Record<string, unknown>): Promise<{ success: boolean; listingId?: string; error?: string }> {
    console.log("[CreateProductListingTool] Executing with args:", args)

    const params = validateProductParams(args)
    console.log("[CreateProductListingTool] Validated params:", params)

    if (this.onExecute) {
      return this.onExecute(params)
    }

    // Default behavior if no callback set
    console.log("[CreateProductListingTool] No execute callback set, returning default success")
    return { success: true }
  }
}

/**
 * StoreProductImageTool - Captures current frame with a description (non-blocking)
 */
export class StoreProductImageTool extends FunctionCallDefinition {
  constructor() {
    super(
      "store_product_image",
      "Captures the current video frame with a description of what's visible (angle/condition/defects). Call this multiple times as the user moves around the product.",
      {
        properties: {
          description: {
            type: "string",
            description:
              "Description of what the frame shows: angle (front/back/side/top/bottom), visible defects or wear, materials, or notable features.",
          },
        },
      },
      ["description"],
    )
  }
}

/**
 * Generate image editing prompt for gemini-3-pro-image-preview
 */
export function generateStudioPhotoPrompt(params: ProductListingParams): string {
  const brandStr = params.brand ? `${params.brand} ` : ""
  return `Remove the background from this image. Isolate the ${brandStr}${params.title} and place it on a clean white studio background. Apply professional e-commerce product photography lighting with soft shadows. The final image should look like a professional marketplace listing photo suitable for an online store.

Product: ${params.title}
${params.brand ? `Brand: ${params.brand}` : ""}
Condition: ${params.condition}
Details: ${params.description}

Style: Clean, minimalist, professional product photography with perfect lighting and no distractions.`
}

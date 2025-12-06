"use node"

/**
 * Background processing for manual listing collage generation and splitting
 * This action runs in Node.js runtime to use image processing libraries
 */

import { v } from "convex/values"
import Jimp from "jimp"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalAction } from "./_generated/server"

const storedImageValidator = v.object({
  imageBase64: v.string(),
  description: v.string(),
})

/**
 * Process manual listing collage: generate 3x3 panel and split into 9 images
 */
export const processManualListingCollage = internalAction({
  args: {
    listingId: v.id("listings"),
    images: v.array(storedImageValidator),
    title: v.string(),
    description: v.string(),
    category: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      console.log("[ListingsCollageProcessing] Starting collage processing for listing:", args.listingId)

      // Step 1: Generate 3x3 collage using Gemini
      const panelResult = await ctx.runAction(
        internal.productImageGeneration.generateProductPanelInternal,
        {
          images: args.images,
          title: args.title,
          description: args.description,
          category: args.category as any,
          // No userId needed for internal calls - audit logging will be skipped
        },
      )

      if (!panelResult.success || !panelResult.panelUrl) {
        throw new Error(panelResult.error || "Failed to generate collage")
      }

      console.log("[ListingsCollageProcessing] Collage generated:", panelResult.panelUrl)

      // Step 2: Download the collage image
      const collageResponse = await fetch(panelResult.panelUrl)
      if (!collageResponse.ok) {
        throw new Error(`Failed to download collage: ${collageResponse.statusText}`)
      }

      const collageBuffer = Buffer.from(await collageResponse.arrayBuffer())

      // Step 3: Load image with Jimp and get dimensions
      const image = await Jimp.read(collageBuffer)
      const width = image.getWidth()
      const height = image.getHeight()

      if (!width || !height) {
        throw new Error("Failed to get image dimensions")
      }

      // Step 4: Split into 9 equal parts (3x3 grid)
      const tileWidth = Math.floor(width / 3)
      const tileHeight = Math.floor(height / 3)
      const splitImages: Buffer[] = []

      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const x = col * tileWidth
          const y = row * tileHeight

          // Clone and crop the image
          const tile = image.clone().crop(x, y, tileWidth, tileHeight)
          
          // Convert to buffer as JPEG
          const tileBuffer = await tile.getBufferAsync(Jimp.MIME_JPEG)
          splitImages.push(tileBuffer)
        }
      }

      console.log("[ListingsCollageProcessing] Split collage into 9 images")

      // Step 5: Upload all 9 images to Convex storage
      const uploadedImageUrls: string[] = []
      for (const imageBuffer of splitImages) {
        // Convert Buffer to Uint8Array for Blob compatibility
        const uint8Array = new Uint8Array(imageBuffer)
        const storageId = await ctx.storage.store(new Blob([uint8Array], { type: "image/jpeg" }))
        const imageUrl = await ctx.storage.getUrl(storageId)

        if (!imageUrl) {
          throw new Error("Failed to get image URL from storage")
        }

        uploadedImageUrls.push(imageUrl)
      }

      console.log("[ListingsCollageProcessing] Uploaded 9 images to storage")

      // Step 6: Update listing with the 9 split images
      await ctx.runMutation(internal.listings.updateListingImages, {
        listingId: args.listingId,
        imageUrls: uploadedImageUrls,
        thumbnailUrl: uploadedImageUrls[0],
      })

      // Step 7: Re-trigger embeddings with updated images
      await ctx.scheduler.runAfter(0, internal.listingEmbeddings.embedListing, {
        listingId: args.listingId,
      })

      console.log("[ListingsCollageProcessing] Successfully processed collage for listing:", args.listingId)
    } catch (error) {
      console.error("[ListingsCollageProcessing] Error processing collage:", error)
      
      // Update listing with error status
      await ctx.runMutation(internal.listings.updateProcessingStatus, {
        id: args.listingId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error occurred",
      })
    }

    return null
  },
})

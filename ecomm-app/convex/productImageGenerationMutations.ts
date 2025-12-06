/**
 * Product Image Generation Mutations
 * Mutations for product image generation (must run in default Convex runtime, not Node.js)
 */

import { v } from "convex/values"

import { internalMutation } from "./_generated/server"

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
 * Internal mutation to create a draft listing with the generated image
 */
export const createDraftListing = internalMutation({
  args: {
    ownerId: v.string(),
    title: v.string(),
    description: v.string(),
    price: v.number(),
    category: categoryValidator,
    imageUrl: v.string(),
    condition: conditionValidator,
    brand: v.optional(v.string()),
  },
  returns: v.id("listings"),
  handler: async (ctx, args) => {
    const now = Date.now()

    // Build extended description with condition and brand
    let fullDescription = args.description
    if (args.condition) {
      const conditionLabels: Record<string, string> = {
        new: "New",
        like_new: "Like New",
        good: "Good",
        fair: "Fair",
        poor: "Poor",
      }
      fullDescription = `Condition: ${conditionLabels[args.condition]}\n\n${fullDescription}`
    }
    if (args.brand) {
      fullDescription = `Brand: ${args.brand}\n${fullDescription}`
    }

    const listingId = await ctx.db.insert("listings", {
      ownerId: args.ownerId,
      title: args.title,
      description: fullDescription,
      price: args.price,
      currency: "USD",
      category: args.category,
      imageUrls: [args.imageUrl],
      thumbnailUrl: args.imageUrl,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      viewCount: 0,
      favoriteCount: 0,
      searchText: `${args.title} ${fullDescription}`.toLowerCase(),
      processingStatus: "completed",
    })

    return listingId
  },
})

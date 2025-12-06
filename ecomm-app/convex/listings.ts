import { v } from "convex/values"
import { query, mutation, action, internalMutation } from "./_generated/server"
import { internal } from "./_generated/api"
import { getAuthenticatedUser, getAuthorizedListing } from "./lib/auth"

// Listing status validator (matches schema)
const listingStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("sold"),
  v.literal("archived"),
)

// Processing status validator (matches schema)
const processingStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
)

// Full listing document validator (including system fields)
const listingDocValidator = v.object({
  _id: v.id("listings"),
  _creationTime: v.number(),
  ownerId: v.string(),
  title: v.string(),
  description: v.string(),
  price: v.number(),
  currency: v.string(),
  category: v.string(),
  campus: v.optional(v.string()),
  videoUrl: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  imageUrls: v.optional(v.array(v.string())),
  status: listingStatusValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  viewCount: v.optional(v.number()),
  favoriteCount: v.optional(v.number()),
  processingStatus: v.optional(processingStatusValidator),
  processingError: v.optional(v.string()),
  searchText: v.optional(v.string()),
})

/**
 * List active listings for the home feed
 */
export const listForFeed = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    category: v.optional(v.string()),
    campus: v.optional(v.string()),
  },
  returns: v.array(listingDocValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20

    let q = ctx.db
      .query("listings")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "active"))
      .order("desc")

    const listings = await q.take(limit)

    // Filter by category/campus if provided
    let filtered = listings
    if (args.category) {
      filtered = filtered.filter((l) => l.category === args.category)
    }
    if (args.campus) {
      filtered = filtered.filter((l) => l.campus === args.campus)
    }

    return filtered
  },
})

/**
 * List listings by category
 */
export const listByCategory = query({
  args: {
    category: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(listingDocValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20

    const listings = await ctx.db
      .query("listings")
      .withIndex("by_category_and_status", (q) =>
        q.eq("category", args.category).eq("status", "active"),
      )
      .order("desc")
      .take(limit)

    return listings
  },
})

/**
 * Get a single listing by ID
 */
export const getById = query({
  args: { id: v.id("listings") },
  returns: v.union(listingDocValidator, v.null()),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id)
    if (!listing || listing.status === "archived") {
      return null
    }
    return listing
  },
})

/**
 * List listings for the current user
 */
export const listForUser = query({
  args: {
    status: v.optional(listingStatusValidator),
  },
  returns: v.array(listingDocValidator),
  handler: async (ctx, args) => {
    const { userId } = await getAuthenticatedUser(ctx)

    let listings
    if (args.status) {
      listings = await ctx.db
        .query("listings")
        .withIndex("by_ownerId_and_status", (q) =>
          q.eq("ownerId", userId).eq("status", args.status!),
        )
        .order("desc")
        .collect()
    } else {
      listings = await ctx.db
        .query("listings")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", userId))
        .order("desc")
        .collect()
    }

    return listings
  },
})

/**
 * Search listings by text
 */
export const search = query({
  args: {
    searchTerm: v.string(),
    category: v.optional(v.string()),
    campus: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(listingDocValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20

    if (!args.searchTerm.trim()) {
      return []
    }

    const results = await ctx.db
      .query("listings")
      .withSearchIndex("search_listings", (q) => {
        let search = q.search("searchText", args.searchTerm)
        search = search.eq("status", "active")
        if (args.category) {
          search = search.eq("category", args.category)
        }
        if (args.campus) {
          search = search.eq("campus", args.campus)
        }
        return search
      })
      .take(limit)

    return results
  },
})

/**
 * Create a new listing
 */
export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    price: v.number(),
    currency: v.optional(v.string()),
    category: v.string(),
    campus: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),
    status: v.optional(v.union(v.literal("draft"), v.literal("active"))),
  },
  returns: v.id("listings"),
  handler: async (ctx, args) => {
    const { userId } = await getAuthenticatedUser(ctx)
    const now = Date.now()

    const listingId = await ctx.db.insert("listings", {
      ownerId: userId,
      title: args.title,
      description: args.description,
      price: args.price,
      currency: args.currency ?? "USD",
      category: args.category,
      campus: args.campus,
      videoUrl: args.videoUrl,
      thumbnailUrl: args.thumbnailUrl,
      imageUrls: args.imageUrls,
      status: args.status ?? "active",
      createdAt: now,
      updatedAt: now,
      viewCount: 0,
      favoriteCount: 0,
      searchText: `${args.title} ${args.description}`.toLowerCase(),
    })

    return listingId
  },
})

/**
 * Create a listing from a video draft (AI-ready)
 * This mutation is designed for the video-first listing flow where
 * metadata can be provided manually or later generated by AI.
 */
export const createFromDraft = mutation({
  args: {
    // Video/media (required for video-first flow)
    videoUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),

    // Metadata (can be stubbed/placeholder initially, then updated by AI)
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    category: v.optional(v.string()),
    campus: v.optional(v.string()),

    // Processing status for AI pipeline
    processingStatus: v.optional(processingStatusValidator),
  },
  returns: v.id("listings"),
  handler: async (ctx, args) => {
    const { userId } = await getAuthenticatedUser(ctx)
    const now = Date.now()

    // Default values for draft listings
    const title = args.title ?? "Untitled Listing"
    const description = args.description ?? ""
    const price = args.price ?? 0
    const category = args.category ?? "other"

    const listingId = await ctx.db.insert("listings", {
      ownerId: userId,
      title,
      description,
      price,
      currency: args.currency ?? "USD",
      category,
      campus: args.campus,
      videoUrl: args.videoUrl,
      thumbnailUrl: args.thumbnailUrl,
      status: "draft", // Always starts as draft for video-first flow
      createdAt: now,
      updatedAt: now,
      viewCount: 0,
      favoriteCount: 0,
      searchText: `${title} ${description}`.toLowerCase(),
      processingStatus: args.processingStatus ?? "pending",
    })

    return listingId
  },
})

/**
 * Update an existing listing
 */
export const update = mutation({
  args: {
    id: v.id("listings"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    category: v.optional(v.string()),
    campus: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),
    status: v.optional(v.union(v.literal("draft"), v.literal("active"))),
    processingStatus: v.optional(processingStatusValidator),
    processingError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await getAuthorizedListing(ctx, args.id)
    const now = Date.now()

    const updates: Record<string, unknown> = {
      updatedAt: now,
    }

    if (args.title !== undefined) updates.title = args.title
    if (args.description !== undefined) updates.description = args.description
    if (args.price !== undefined) updates.price = args.price
    if (args.category !== undefined) updates.category = args.category
    if (args.campus !== undefined) updates.campus = args.campus
    if (args.thumbnailUrl !== undefined) updates.thumbnailUrl = args.thumbnailUrl
    if (args.imageUrls !== undefined) updates.imageUrls = args.imageUrls
    if (args.status !== undefined) updates.status = args.status
    if (args.processingStatus !== undefined) updates.processingStatus = args.processingStatus
    if (args.processingError !== undefined) updates.processingError = args.processingError

    // Update search text if title or description changed
    if (args.title !== undefined || args.description !== undefined) {
      const newTitle = args.title ?? listing.title
      const newDesc = args.description ?? listing.description
      updates.searchText = `${newTitle} ${newDesc}`.toLowerCase()
    }

    await ctx.db.patch(args.id, updates)
    return null
  },
})

/**
 * Mark a listing as sold
 */
export const markSold = mutation({
  args: { id: v.id("listings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getAuthorizedListing(ctx, args.id)
    await ctx.db.patch(args.id, {
      status: "sold",
      updatedAt: Date.now(),
    })
    return null
  },
})

/**
 * Archive a listing (soft delete)
 */
export const archive = mutation({
  args: { id: v.id("listings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getAuthorizedListing(ctx, args.id)
    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: Date.now(),
    })
    return null
  },
})

/**
 * Publish a draft listing (make it active)
 */
export const publish = mutation({
  args: { id: v.id("listings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await getAuthorizedListing(ctx, args.id)

    if (listing.status !== "draft") {
      throw new Error("Only draft listings can be published")
    }

    // Validate required fields before publishing
    if (!listing.title || listing.title === "Untitled Listing") {
      throw new Error("Title is required to publish")
    }
    if (!listing.description) {
      throw new Error("Description is required to publish")
    }
    if (listing.price <= 0) {
      throw new Error("Price must be greater than 0 to publish")
    }

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    })
    return null
  },
})

/**
 * Toggle favorite on a listing
 */
export const toggleFavorite = mutation({
  args: { listingId: v.id("listings") },
  returns: v.object({ isFavorited: v.boolean() }),
  handler: async (ctx, args) => {
    const { userId } = await getAuthenticatedUser(ctx)

    // Check if already favorited
    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_userId_and_listingId", (q) =>
        q.eq("userId", userId).eq("listingId", args.listingId),
      )
      .unique()

    const listing = await ctx.db.get(args.listingId)
    if (!listing) {
      throw new Error("Listing not found")
    }

    if (existing) {
      // Remove favorite
      await ctx.db.delete(existing._id)
      await ctx.db.patch(args.listingId, {
        favoriteCount: Math.max(0, (listing.favoriteCount ?? 0) - 1),
      })
      return { isFavorited: false }
    } else {
      // Add favorite
      await ctx.db.insert("favorites", {
        userId,
        listingId: args.listingId,
        createdAt: Date.now(),
      })
      await ctx.db.patch(args.listingId, {
        favoriteCount: (listing.favoriteCount ?? 0) + 1,
      })
      return { isFavorited: true }
    }
  },
})

/**
 * Check if a listing is favorited by the current user
 */
export const isFavorited = query({
  args: { listingId: v.id("listings") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return false
    }

    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_userId_and_listingId", (q) =>
        q.eq("userId", identity.subject).eq("listingId", args.listingId),
      )
      .unique()

    return !!existing
  },
})

/**
 * Get user's favorited listings
 */
export const listFavorites = query({
  args: {},
  returns: v.array(listingDocValidator),
  handler: async (ctx) => {
    const { userId } = await getAuthenticatedUser(ctx)

    const favorites = await ctx.db
      .query("favorites")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect()

    const listings = await Promise.all(favorites.map((f) => ctx.db.get(f.listingId)))

    return listings.filter(
      (l): l is NonNullable<typeof l> => l !== null && l.status === "active",
    )
  },
})

/**
 * Get user stats (for profile page)
 */
export const getUserStats = query({
  args: {},
  returns: v.object({
    totalListings: v.number(),
    activeListings: v.number(),
    soldListings: v.number(),
    totalFavorites: v.number(),
  }),
  handler: async (ctx) => {
    const { userId } = await getAuthenticatedUser(ctx)

    // Get all user's listings
    const allListings = await ctx.db
      .query("listings")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", userId))
      .collect()

    const activeListings = allListings.filter((l) => l.status === "active")
    const soldListings = allListings.filter((l) => l.status === "sold")

    // Get user's favorites count
    const favorites = await ctx.db
      .query("favorites")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect()

    return {
      totalListings: allListings.length,
      activeListings: activeListings.length,
      soldListings: soldListings.length,
      totalFavorites: favorites.length,
    }
  },
})

/**
 * Increment view count
 */
export const incrementViewCount = mutation({
  args: { id: v.id("listings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id)
    if (!listing) return null

    await ctx.db.patch(args.id, {
      viewCount: (listing.viewCount ?? 0) + 1,
    })
    return null
  },
})

// ============================================================================
// AI INTEGRATION (STUBBED FOR FUTURE IMPLEMENTATION)
// ============================================================================

/**
 * Generated metadata result from AI analysis
 */
const generatedMetadataValidator = v.object({
  title: v.string(),
  description: v.string(),
  suggestedPrice: v.number(),
  suggestedCategory: v.string(),
  confidence: v.number(), // 0-1 confidence score
  tags: v.array(v.string()),
})

/**
 * Generate listing metadata from video (AI-ready stub)
 *
 * This action is designed to be called after video upload to analyze
 * the video content and generate suggested metadata for the listing.
 *
 * In production, this would:
 * 1. Extract frames/thumbnails from the video
 * 2. Send to an AI service (OpenAI, Claude, etc.) for analysis
 * 3. Parse audio transcript for additional context
 * 4. Return structured metadata suggestions
 *
 * Currently returns placeholder data for development/testing.
 */
export const generateMetadataFromVideo = action({
  args: {
    videoUrl: v.string(),
    listingId: v.optional(v.id("listings")),
  },
  returns: generatedMetadataValidator,
  handler: async (ctx, args) => {
    // Mark the listing as processing if provided
    if (args.listingId) {
      await ctx.runMutation(internal.listings.updateProcessingStatus, {
        id: args.listingId,
        status: "processing",
      })
    }

    // Simulate AI processing delay
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // STUB: Generate placeholder metadata
    // In production, this would call an AI service
    const generatedMetadata = {
      title: "Item for Sale",
      description:
        "This item is in great condition. Perfect for students looking for a great deal on campus. Message me if you have any questions or want to see more photos!",
      suggestedPrice: 25.0,
      suggestedCategory: "other",
      confidence: 0.75,
      tags: ["campus", "student", "deal"],
    }

    // Update the listing with generated metadata if provided
    if (args.listingId) {
      await ctx.runMutation(internal.listings.applyGeneratedMetadata, {
        id: args.listingId,
        title: generatedMetadata.title,
        description: generatedMetadata.description,
        price: generatedMetadata.suggestedPrice,
        category: generatedMetadata.suggestedCategory,
      })
    }

    return generatedMetadata
  },
})

/**
 * Internal mutation to update processing status
 */
export const updateProcessingStatus = internalMutation({
  args: {
    id: v.id("listings"),
    status: processingStatusValidator,
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      processingStatus: args.status,
      updatedAt: Date.now(),
    }

    if (args.error !== undefined) {
      updates.processingError = args.error
    }

    await ctx.db.patch(args.id, updates)
    return null
  },
})

/**
 * Internal mutation to apply AI-generated metadata to a listing
 */
export const applyGeneratedMetadata = internalMutation({
  args: {
    id: v.id("listings"),
    title: v.string(),
    description: v.string(),
    price: v.number(),
    category: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id)
    if (!listing) {
      throw new Error("Listing not found")
    }

    await ctx.db.patch(args.id, {
      title: args.title,
      description: args.description,
      price: args.price,
      category: args.category,
      searchText: `${args.title} ${args.description}`.toLowerCase(),
      processingStatus: "completed",
      updatedAt: Date.now(),
    })

    return null
  },
})

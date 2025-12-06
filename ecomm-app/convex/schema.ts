import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

// Listing status
const listingStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("sold"),
  v.literal("archived"),
)

// Processing status for AI-generated metadata
const processingStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
)

export default defineSchema({
  // Marketplace listings
  listings: defineTable({
    ownerId: v.string(),
    title: v.string(),
    description: v.string(),
    price: v.number(),
    currency: v.string(), // e.g., "USD"
    category: v.string(),
    campus: v.optional(v.string()), // College/university campus

    // Media
    videoUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),

    // Status
    status: listingStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),

    // Engagement
    viewCount: v.optional(v.number()),
    favoriteCount: v.optional(v.number()),

    // AI Processing (for video-to-listing)
    processingStatus: v.optional(processingStatusValidator),
    processingError: v.optional(v.string()),

    // Search optimization
    searchText: v.optional(v.string()), // Concatenated title + description for search

    // RAG embedding entry ID for semantic search
    ragEntryId: v.optional(v.string()),
  })
    // Core indexes for efficient querying
    .index("by_ownerId", ["ownerId"])
    .index("by_status", ["status"])
    .index("by_category", ["category"])
    .index("by_campus", ["campus"])
    // Compound indexes for filtered/sorted queries
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_category_and_status", ["category", "status"])
    .index("by_campus_and_status", ["campus", "status"])
    .index("by_category_and_status_and_createdAt", ["category", "status", "createdAt"])
    // Full-text search index
    .searchIndex("search_listings", {
      searchField: "searchText",
      filterFields: ["status", "category", "campus"],
    }),

  // User favorites
  favorites: defineTable({
    userId: v.string(),
    listingId: v.id("listings"),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_listingId", ["listingId"])
    .index("by_userId_and_listingId", ["userId", "listingId"]),

  // Categories (predefined but extensible)
  categories: defineTable({
    name: v.string(),
    slug: v.string(),
    icon: v.optional(v.string()),
    displayOrder: v.number(),
    isActive: v.boolean(),
  })
    .index("by_slug", ["slug"])
    .index("by_displayOrder", ["displayOrder"])
    .index("by_isActive_and_displayOrder", ["isActive", "displayOrder"]),

  // Conversations for messaging
  conversations: defineTable({
    listingId: v.id("listings"),
    buyerId: v.string(),
    sellerId: v.string(),
    lastMessageAt: v.number(),
    lastMessagePreview: v.optional(v.string()),
  })
    .index("by_buyerId", ["buyerId"])
    .index("by_sellerId", ["sellerId"])
    .index("by_listingId", ["listingId"])
    .index("by_buyerId_and_sellerId", ["buyerId", "sellerId"])
    .index("by_buyerId_and_lastMessageAt", ["buyerId", "lastMessageAt"])
    .index("by_sellerId_and_lastMessageAt", ["sellerId", "lastMessageAt"]),

  // Messages within conversations
  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.string(),
    content: v.string(),
    createdAt: v.number(),
    isRead: v.boolean(),
  })
    .index("by_conversationId", ["conversationId"])
    .index("by_conversationId_and_createdAt", ["conversationId", "createdAt"]),
})

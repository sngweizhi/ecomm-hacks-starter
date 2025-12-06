import { v } from "convex/values"
import { query, mutation } from "./_generated/server"
import { getAuthenticatedUser } from "./lib/auth"

// Conversation document validator
const conversationDocValidator = v.object({
  _id: v.id("conversations"),
  _creationTime: v.number(),
  listingId: v.id("listings"),
  buyerId: v.string(),
  sellerId: v.string(),
  lastMessageAt: v.number(),
  lastMessagePreview: v.optional(v.string()),
})

// Message document validator
const messageDocValidator = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  conversationId: v.id("conversations"),
  senderId: v.string(),
  content: v.string(),
  createdAt: v.number(),
  isRead: v.boolean(),
})

// Conversation with additional metadata for display
const conversationWithMetadataValidator = v.object({
  _id: v.id("conversations"),
  _creationTime: v.number(),
  listingId: v.id("listings"),
  buyerId: v.string(),
  sellerId: v.string(),
  lastMessageAt: v.number(),
  lastMessagePreview: v.optional(v.string()),
  // Additional metadata
  listingTitle: v.string(),
  listingThumbnail: v.optional(v.string()),
  otherUserName: v.string(),
  otherUserImage: v.optional(v.string()),
  unreadCount: v.number(),
})

/**
 * List all conversations for the current user
 */
export const list = query({
  args: {},
  returns: v.array(conversationWithMetadataValidator),
  handler: async (ctx) => {
    const { userId } = await getAuthenticatedUser(ctx)

    // Get conversations where user is buyer
    const buyerConversations = await ctx.db
      .query("conversations")
      .withIndex("by_buyerId_and_lastMessageAt", (q) => q.eq("buyerId", userId))
      .order("desc")
      .collect()

    // Get conversations where user is seller
    const sellerConversations = await ctx.db
      .query("conversations")
      .withIndex("by_sellerId_and_lastMessageAt", (q) => q.eq("sellerId", userId))
      .order("desc")
      .collect()

    // Combine and sort by lastMessageAt
    const allConversations = [...buyerConversations, ...sellerConversations].sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt,
    )

    // Deduplicate (in case user is both buyer and seller somehow)
    const uniqueConversations = Array.from(
      new Map(allConversations.map((c) => [c._id, c])).values(),
    )

    // Enrich with metadata
    const enrichedConversations = await Promise.all(
      uniqueConversations.map(async (conv) => {
        // Get listing info
        const listing = await ctx.db.get(conv.listingId)

        // Determine the other user
        const otherUserId = conv.buyerId === userId ? conv.sellerId : conv.buyerId

        // Count unread messages
        const unreadMessages = await ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) => q.eq("conversationId", conv._id))
          .filter((q) =>
            q.and(q.eq(q.field("senderId"), otherUserId), q.eq(q.field("isRead"), false)),
          )
          .collect()

        return {
          ...conv,
          listingTitle: listing?.title ?? "Deleted Listing",
          listingThumbnail: listing?.thumbnailUrl,
          // We don't have user info in Convex, so we'll use placeholder
          otherUserName: "User",
          otherUserImage: undefined,
          unreadCount: unreadMessages.length,
        }
      }),
    )

    return enrichedConversations
  },
})

/**
 * Get a single conversation by ID
 */
export const get = query({
  args: { id: v.id("conversations") },
  returns: v.union(conversationWithMetadataValidator, v.null()),
  handler: async (ctx, args) => {
    const { userId } = await getAuthenticatedUser(ctx)

    const conversation = await ctx.db.get(args.id)
    if (!conversation) return null

    // Check user is part of conversation
    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      return null
    }

    // Get listing info
    const listing = await ctx.db.get(conversation.listingId)

    // Determine the other user
    const otherUserId =
      conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId

    // Count unread messages
    const unreadMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.id))
      .filter((q) =>
        q.and(q.eq(q.field("senderId"), otherUserId), q.eq(q.field("isRead"), false)),
      )
      .collect()

    return {
      ...conversation,
      listingTitle: listing?.title ?? "Deleted Listing",
      listingThumbnail: listing?.thumbnailUrl,
      otherUserName: "User",
      otherUserImage: undefined,
      unreadCount: unreadMessages.length,
    }
  },
})

/**
 * Get or create a conversation for a listing between buyer and seller
 */
export const getOrCreate = mutation({
  args: {
    listingId: v.id("listings"),
  },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const { userId } = await getAuthenticatedUser(ctx)

    // Get the listing to find the seller
    const listing = await ctx.db.get(args.listingId)
    if (!listing) {
      throw new Error("Listing not found")
    }

    // Can't message yourself
    if (listing.ownerId === userId) {
      throw new Error("Cannot start a conversation about your own listing")
    }

    // Check if conversation already exists
    const existingConversation = await ctx.db
      .query("conversations")
      .withIndex("by_buyerId_and_sellerId", (q) =>
        q.eq("buyerId", userId).eq("sellerId", listing.ownerId),
      )
      .filter((q) => q.eq(q.field("listingId"), args.listingId))
      .unique()

    if (existingConversation) {
      return existingConversation._id
    }

    // Create new conversation
    const conversationId = await ctx.db.insert("conversations", {
      listingId: args.listingId,
      buyerId: userId,
      sellerId: listing.ownerId,
      lastMessageAt: Date.now(),
    })

    return conversationId
  },
})

/**
 * List messages in a conversation
 */
export const listMessages = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  returns: v.array(messageDocValidator),
  handler: async (ctx, args) => {
    const { userId } = await getAuthenticatedUser(ctx)

    // Verify user is part of conversation
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      throw new Error("Conversation not found")
    }
    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new Error("Not authorized to view this conversation")
    }

    const limit = args.limit ?? 50

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_and_createdAt", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(limit)

    // Return in chronological order (oldest first)
    return messages.reverse()
  },
})

/**
 * Send a message in a conversation
 */
export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const { userId } = await getAuthenticatedUser(ctx)

    // Verify user is part of conversation
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      throw new Error("Conversation not found")
    }
    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new Error("Not authorized to send messages in this conversation")
    }

    const now = Date.now()

    // Insert the message
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: userId,
      content: args.content,
      createdAt: now,
      isRead: false,
    })

    // Update conversation's lastMessageAt and preview
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      lastMessagePreview: args.content.substring(0, 100),
    })

    return messageId
  },
})

/**
 * Mark messages as read
 */
export const markAsRead = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await getAuthenticatedUser(ctx)

    // Verify user is part of conversation
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) {
      throw new Error("Conversation not found")
    }
    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new Error("Not authorized")
    }

    // Get unread messages from the other user
    const unreadMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .filter((q) =>
        q.and(q.neq(q.field("senderId"), userId), q.eq(q.field("isRead"), false)),
      )
      .collect()

    // Mark all as read
    for (const message of unreadMessages) {
      await ctx.db.patch(message._id, { isRead: true })
    }

    return null
  },
})

/**
 * Get unread message count across all conversations
 */
export const getUnreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const { userId } = await getAuthenticatedUser(ctx)

    // Get all conversations for user
    const buyerConversations = await ctx.db
      .query("conversations")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", userId))
      .collect()

    const sellerConversations = await ctx.db
      .query("conversations")
      .withIndex("by_sellerId", (q) => q.eq("sellerId", userId))
      .collect()

    const allConversationIds = [
      ...buyerConversations.map((c) => c._id),
      ...sellerConversations.map((c) => c._id),
    ]

    // Count unread messages across all conversations
    let totalUnread = 0
    for (const convId of allConversationIds) {
      const unreadMessages = await ctx.db
        .query("messages")
        .withIndex("by_conversationId", (q) => q.eq("conversationId", convId))
        .filter((q) =>
          q.and(q.neq(q.field("senderId"), userId), q.eq(q.field("isRead"), false)),
        )
        .collect()
      totalUnread += unreadMessages.length
    }

    return totalUnread
  },
})

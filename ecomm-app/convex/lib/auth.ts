import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"

/**
 * Get authenticated user or throw an error
 * Works in queries, mutations, and actions
 */
export async function getAuthenticatedUser(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<{ userId: string }> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error("Not authenticated")
  }
  return { userId: identity.subject }
}

/**
 * Get a listing and verify the authenticated user owns it
 */
export async function getAuthorizedListing(ctx: QueryCtx | MutationCtx, listingId: Id<"listings">) {
  const { userId } = await getAuthenticatedUser(ctx)
  const listing = await ctx.db.get(listingId)

  if (!listing) {
    throw new Error("Listing not found")
  }

  if (listing.ownerId !== userId) {
    throw new Error("Not authorized to access this listing")
  }

  return listing
}

/**
 * Get a conversation and verify the authenticated user is a participant
 */
export async function getAuthorizedConversation(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
) {
  const { userId } = await getAuthenticatedUser(ctx)
  const conversation = await ctx.db.get(conversationId)

  if (!conversation) {
    throw new Error("Conversation not found")
  }

  if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
    throw new Error("Not authorized to access this conversation")
  }

  return conversation
}

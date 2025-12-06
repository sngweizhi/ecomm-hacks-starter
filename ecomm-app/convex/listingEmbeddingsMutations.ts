/**
 * Listing Embeddings Mutations
 * Mutations for RAG operations (must run in default Convex runtime, not Node.js)
 */

import { v } from "convex/values"

import { internalMutation } from "./_generated/server"

/**
 * Internal mutation to update ragEntryId on a listing
 */
export const updateRagEntryId = internalMutation({
  args: {
    listingId: v.id("listings"),
    ragEntryId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.listingId, {
      ragEntryId: args.ragEntryId,
    })
    return null
  },
})

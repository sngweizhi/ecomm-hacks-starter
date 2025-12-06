"use node"

/**
 * Listing Embeddings - RAG functions for product search
 * Handles embedding generation, removal, and semantic search
 */

import { v } from "convex/values"

import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action, internalAction } from "./_generated/server"
import { rag } from "./lib/rag"

// Namespace for all product embeddings (global, not per-user)
const PRODUCTS_NAMESPACE = "products"

// ============================================================================
// Search
// ============================================================================

/**
 * Search result type for products
 */
type ProductSearchResult = {
  listingId: string
  title: string
  description: string
  price: number
  category: string
  score: number
}

/**
 * Search products using semantic search
 * Called by the marketplace agent's searchProducts tool
 */
export const searchProducts = internalAction({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    results: v.array(
      v.object({
        listingId: v.string(),
        title: v.string(),
        description: v.string(),
        price: v.number(),
        category: v.string(),
        score: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<{ results: ProductSearchResult[] }> => {
    const limit = args.limit ?? 10

    // Check if namespace exists
    const namespace = await rag.getNamespace(ctx, {
      namespace: PRODUCTS_NAMESPACE,
    })

    if (!namespace) {
      console.log("[Search] No products namespace found - no products indexed yet")
      return { results: [] }
    }

    // Perform vector search
    const searchResults = await rag.search(ctx, {
      namespace: PRODUCTS_NAMESPACE,
      query: args.query,
      limit: limit * 2, // Over-fetch to account for duplicates
      vectorScoreThreshold: 0.3,
    })

    if (!searchResults.results || searchResults.results.length === 0) {
      return { results: [] }
    }

    // Build entryId -> listingId mapping
    const entryToListingId = new Map<string, string>()
    for (const entry of searchResults.entries) {
      if (entry.key) {
        entryToListingId.set(entry.entryId, entry.key)
      }
    }

    // Deduplicate by listing ID and keep best score
    const listingScores = new Map<string, { score: number; text: string }>()
    for (const result of searchResults.results) {
      const listingId = entryToListingId.get(result.entryId) ?? result.entryId
      const existing = listingScores.get(listingId)
      if (!existing || result.score > existing.score) {
        listingScores.set(listingId, {
          score: result.score,
          text: result.content[0]?.text ?? "",
        })
      }
    }

    // Get listing details for top results
    const topListingIds = [...listingScores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([id]) => id)

    // Fetch listing details
    const results: ProductSearchResult[] = []
    for (const listingId of topListingIds) {
      try {
        const listing = await ctx.runQuery(api.listings.getById, {
          id: listingId as Id<"listings">,
        })
        if (listing && listing.status === "active") {
          results.push({
            listingId: listing._id,
            title: listing.title,
            description: listing.description,
            price: listing.price,
            category: listing.category,
            score: listingScores.get(listingId)?.score ?? 0,
          })
        }
      } catch (error) {
        console.error(`[Search] Error fetching listing ${listingId}:`, error)
      }
    }

    console.log(`[Search] Found ${results.length} products for query: "${args.query}"`)
    return { results }
  },
})

/**
 * RAG-powered search that returns listing details plus matched text
 * Used by the shopping assistant agent for inline recommendations
 */
export const searchListingsRag = internalAction({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    vectorScoreThreshold: v.optional(v.number()),
  },
  returns: v.object({
    results: v.array(
      v.object({
        listingId: v.string(),
        title: v.string(),
        description: v.string(),
        price: v.number(),
        category: v.string(),
        snippet: v.string(),
        score: v.number(),
      }),
    ),
    text: v.string(),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 8
    const vectorScoreThreshold = args.vectorScoreThreshold ?? 0.3

    const namespace = await rag.getNamespace(ctx, {
      namespace: PRODUCTS_NAMESPACE,
    })

    if (!namespace) {
      console.log("[RAG Search] No products namespace found - no products indexed yet")
      return { results: [], text: "" }
    }

    const { results: vectorResults, entries, text } = await rag.search(ctx, {
      namespace: PRODUCTS_NAMESPACE,
      query: args.query,
      limit: limit * 2, // over-fetch to improve diversity
      vectorScoreThreshold,
      chunkContext: { before: 1, after: 0 },
    })

    if (!vectorResults || vectorResults.length === 0) {
      return { results: [], text: text ?? "" }
    }

    // Map entryId -> listingId
    const entryToListingId = new Map<string, string>()
    for (const entry of entries) {
      if (entry.key) {
        entryToListingId.set(entry.entryId, entry.key)
      }
    }

    // Deduplicate and keep best score/snippet per listing
    const listingScores = new Map<
      string,
      { score: number; text: string; entryId: string }
    >()
    for (const result of vectorResults) {
      const listingId = entryToListingId.get(result.entryId) ?? result.entryId
      const existing = listingScores.get(listingId)
      if (!existing || result.score > existing.score) {
        listingScores.set(listingId, {
          score: result.score,
          text: result.content[0]?.text ?? "",
          entryId: result.entryId,
        })
      }
    }

    const topListingIds = [...listingScores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([id]) => id)

    const formattedResults: Array<{
      listingId: string
      title: string
      description: string
      price: number
      category: string
      snippet: string
      score: number
    }> = []

    for (const listingId of topListingIds) {
      const listing = await ctx.runQuery(api.listings.getById, {
        id: listingId as Id<"listings">,
      })

      if (listing && listing.status === "active") {
        const bestMatch = listingScores.get(listingId)
        formattedResults.push({
          listingId: listing._id,
          title: listing.title,
          description: listing.description,
          price: listing.price,
          category: listing.category,
          snippet: bestMatch?.text ?? "",
          score: bestMatch?.score ?? 0,
        })
      }
    }

    console.log(
      `[RAG Search] Found ${formattedResults.length} products for query: "${args.query}"`,
    )
    return { results: formattedResults, text: text ?? "" }
  },
})

// ============================================================================
// Embedding Management
// ============================================================================

/**
 * Embed a single listing
 * Call this after creating or updating a listing
 */
export const embedListing = internalAction({
  args: {
    listingId: v.id("listings"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get the listing
    const listing = await ctx.runQuery(api.listings.getById, { id: args.listingId })
    if (!listing) {
      console.log(`[Embed] Listing ${args.listingId} not found, skipping`)
      return null
    }

    // Only embed active listings
    if (listing.status !== "active") {
      console.log(`[Embed] Listing ${args.listingId} is not active, skipping`)
      return null
    }

    // Create text to embed: title + description + category
    const textToEmbed = `${listing.title}\n${listing.description}\nCategory: ${listing.category}`

    // Remove existing embedding if any
    if (listing.ragEntryId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await rag.delete(ctx, {
          entryId: listing.ragEntryId as any,
        })
      } catch (error) {
        console.log(`[Embed] Could not delete old entry for ${args.listingId}:`, error)
      }
    }

    // Create new embedding
    const { entryId } = await rag.add(ctx, {
      namespace: PRODUCTS_NAMESPACE,
      key: args.listingId,
      text: textToEmbed,
    })

    // Update listing with new ragEntryId
    await ctx.runMutation(internal.listingEmbeddingsMutations.updateRagEntryId, {
      listingId: args.listingId,
      ragEntryId: entryId,
    })

    console.log(`[Embed] Embedded listing ${args.listingId}`)
    return null
  },
})

/**
 * Remove embedding for a listing
 * Call this when archiving or deleting a listing
 */
export const removeListingEmbedding = internalAction({
  args: {
    listingId: v.id("listings"),
    ragEntryId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.ragEntryId) {
      console.log(`[Embed] No ragEntryId for listing ${args.listingId}, skipping removal`)
      return null
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await rag.delete(ctx, {
        entryId: args.ragEntryId as any,
      })
      console.log(`[Embed] Removed embedding for listing ${args.listingId}`)
    } catch (error) {
      console.error(`[Embed] Error removing embedding for ${args.listingId}:`, error)
    }

    return null
  },
})

// ============================================================================
// Backfill
// ============================================================================

/**
 * Backfill embeddings for all active listings
 * Run this once to index existing products
 */
export const backfillEmbeddings = action({
  args: {},
  returns: v.object({
    processed: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx) => {
    // Get all active listings
    const listings = await ctx.runQuery(api.listings.listForFeed, {
      limit: 1000, // Process in batches if needed
    })

    let processed = 0
    let errors = 0

    for (const listing of listings) {
      try {
        await ctx.runAction(internal.listingEmbeddings.embedListing, {
          listingId: listing._id,
        })
        processed++
      } catch (error) {
        console.error(`[Backfill] Error embedding listing ${listing._id}:`, error)
        errors++
      }
    }

    console.log(`[Backfill] Completed: ${processed} processed, ${errors} errors`)
    return { processed, errors }
  },
})

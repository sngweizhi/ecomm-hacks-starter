"use node"

/**
 * Marketplace Chat Agent for product recommendations
 * Uses Convex Agent Component with a product search tool
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { Agent, createTool } from "@convex-dev/agent"
import { z } from "zod/v3"

import { components, internal } from "./_generated/api"
import { CHAT_AGENT_MODEL, EMBEDDING_MODEL } from "./lib/models"
import { MARKETPLACE_AGENT_SYSTEM_PROMPT } from "./lib/prompts"

// Create Google Generative AI client for the agent (language model)
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? "",
})

/**
 * Search tool that queries product listings using semantic search
 * Returns formatted products with reference numbers for citation
 */
const searchProductsTool = createTool({
  description:
    "Search for products in the marketplace. Use this when users ask about finding items, looking for products, or need recommendations. Returns relevant listings with prices and details.",
  args: z.object({
    query: z
      .string()
      .describe(
        "The search query to find relevant products. Be specific and include key terms like product type, brand, condition, or features.",
      ),
  }),
  handler: async (ctx, args: { query: string }): Promise<string> => {
    try {
      // Call the internal searchProducts action
      const searchResult = await ctx.runAction(internal.listingEmbeddings.searchProducts, {
        query: args.query,
        limit: 8,
      })

      if (!searchResult.results || searchResult.results.length === 0) {
        return "No products found matching your search. Try different search terms or browse our categories."
      }

      // Format results with reference numbers for citation
      const formattedProducts = searchResult.results
        .map((result, index) => {
          const refNum = index + 1
          return `[${refNum}] ID: ${result.listingId}
Title: ${result.title}
Price: $${result.price.toFixed(2)}
Category: ${result.category}
Description: ${result.description.slice(0, 150)}${result.description.length > 150 ? "..." : ""}
---`
        })
        .join("\n\n")

      return `Found ${searchResult.results.length} matching products:\n\n${formattedProducts}\n\nReference products using [[product:1,2,3]] format when recommending them to the user.`
    } catch (error) {
      console.error("[Marketplace Agent] Search error:", error)
      return "Error searching products. Please try again."
    }
  },
})

/**
 * Marketplace Chat Agent
 * Configured with Gemini LLM and product search tool for RAG
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const marketplaceAgent = new Agent(components.agent as any, {
  name: "Marketplace Assistant",
  instructions: MARKETPLACE_AGENT_SYSTEM_PROMPT,
  // Type assertions needed due to ai-sdk version differences
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  languageModel: google(CHAT_AGENT_MODEL) as any,
  // Use the same embedding model as RAG for consistent semantic search
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textEmbeddingModel: google.textEmbeddingModel(EMBEDDING_MODEL) as any,
  tools: {
    searchProducts: searchProductsTool,
  },
  // maxSteps > 1 is required for tool calls to work
  // Steps: 1) Generate (may request tool), 2) Execute tool, 3) Generate with result
  maxSteps: 5,
  contextOptions: {
    recentMessages: 50, // Keep reasonable context window
    excludeToolMessages: false,
    searchOtherThreads: false,
    searchOptions: {
      limit: 0,
      textSearch: false,
      vectorSearch: false,
    },
  },
})

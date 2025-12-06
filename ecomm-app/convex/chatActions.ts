"use node"

/**
 * Chat Actions (Node.js runtime)
 * Internal actions for AI-powered streaming responses
 */

import { v } from "convex/values"

import { internalAction } from "./_generated/server"
import { marketplaceAgent } from "./marketplaceAgent"

/**
 * Stream a response from the marketplace agent
 */
export const streamResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const result = await marketplaceAgent.streamText(
        ctx,
        { threadId: args.threadId },
        {
          promptMessageId: args.promptMessageId,
        },
        { saveStreamDeltas: { chunking: "word", throttleMs: 100 } },
      )

      // Consume the stream to ensure it completes
      await result.consumeStream()
    } catch (error) {
      console.error("[Chat] Stream response error:", error)
      throw error
    }

    return null
  },
})

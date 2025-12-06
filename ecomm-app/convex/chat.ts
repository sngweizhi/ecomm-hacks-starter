/**
 * Chat backend functions for marketplace AI assistant
 * Handles single persistent chat per user, message sending, and streaming
 */

import {
  createThread,
  getThreadMetadata,
  listUIMessages,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { components, internal } from "./_generated/api"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { getAuthenticatedUser } from "./lib/auth"
import { marketplaceAgent } from "./marketplaceAgent"

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get or create the user's single chat thread
 * Each user has exactly one persistent chat thread
 */
async function getOrCreateUserChatThread(ctx: MutationCtx): Promise<string> {
  const { userId } = await getAuthenticatedUser(ctx)

  // Try to find existing thread for this user
  // We use a naming convention: the thread title is the userId to find it later
  const existingThreads = await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
    userId,
    paginationOpts: { numItems: 1, cursor: null },
  })

  if (existingThreads.page.length > 0) {
    return existingThreads.page[0]._id
  }

  // Create a new thread for this user
  const threadId = await createThread(ctx, components.agent, {
    userId,
    title: "Shopping Assistant",
  })

  return threadId
}

/**
 * Authorize access to a thread - ensures the user owns the thread
 */
async function authorizeThreadAccess(ctx: QueryCtx | MutationCtx, threadId: string): Promise<void> {
  const { userId } = await getAuthenticatedUser(ctx)
  const metadata = await getThreadMetadata(ctx, components.agent, { threadId })

  if (metadata.userId && metadata.userId !== userId) {
    throw new Error("Not authorized to access this thread")
  }
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get the current user's chat thread ID
 * Returns null if no thread exists yet
 */
export const getUserChatThreadId = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const { userId } = await getAuthenticatedUser(ctx)

    const existingThreads = await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId,
      paginationOpts: { numItems: 1, cursor: null },
    })

    if (existingThreads.page.length > 0) {
      return existingThreads.page[0]._id
    }

    return null
  },
})

/**
 * List messages in the user's chat with streaming support
 */
export const listMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const { threadId, streamArgs } = args
    await authorizeThreadAccess(ctx, threadId)

    // Get streaming deltas
    const streams = await syncStreams(ctx, components.agent, {
      threadId,
      streamArgs,
    })

    // Get paginated messages
    const paginated = await listUIMessages(ctx, components.agent, args)

    return {
      ...paginated,
      streams,
    }
  },
})

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create the user's chat thread if it doesn't exist
 * Returns the thread ID
 */
export const createUserChat = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await getOrCreateUserChatThread(ctx)
  },
})

// Maximum characters allowed for chat prompts to prevent abuse
const MAX_CHAT_PROMPT_CHARS = 10000

/**
 * Send a message to the user's chat and trigger async streaming response
 */
export const sendMessage = mutation({
  args: {
    threadId: v.string(),
    prompt: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await authorizeThreadAccess(ctx, args.threadId)

    // Truncate prompt if it exceeds the limit
    let prompt = args.prompt
    if (prompt.length > MAX_CHAT_PROMPT_CHARS) {
      prompt = prompt.slice(0, MAX_CHAT_PROMPT_CHARS) + "... [message truncated]"
    }

    // Save the user message
    const { messageId } = await marketplaceAgent.saveMessage(ctx, {
      threadId: args.threadId,
      prompt,
      skipEmbeddings: true, // Skip in mutation, generate lazily
    })

    // Schedule async streaming response
    await ctx.scheduler.runAfter(0, internal.chatActions.streamResponse, {
      threadId: args.threadId,
      promptMessageId: messageId,
    })

    return messageId
  },
})

/**
 * Abort a streaming response
 * Uses the message order to identify which stream to stop
 */
export const abortStream = mutation({
  args: {
    threadId: v.string(),
    order: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await authorizeThreadAccess(ctx, args.threadId)

    const { abortStream: agentAbortStream } = await import("@convex-dev/agent")
    const aborted = await agentAbortStream(ctx, components.agent, {
      threadId: args.threadId,
      order: args.order,
      reason: "User requested stop",
    })

    if (aborted) {
      console.log("[Chat] Aborted stream", args.threadId, args.order)
    }

    return aborted
  },
})

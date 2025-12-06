"use node"

/**
 * Chat Actions (Node.js runtime)
 * Internal actions for AI-powered streaming responses
 */

import { v } from "convex/values"

import { internalAction } from "./_generated/server"
import { marketplaceAgent } from "./marketplaceAgent"

const LOG_PREFIX = "[MarketplaceAgent]"

function truncate(value: unknown, max = 400): string {
  if (value === undefined || value === null) return ""
  const str = typeof value === "string" ? value : JSON.stringify(value)
  return str.length > max ? `${str.slice(0, max)}…` : str
}

function summarizeToolCalls(step: any): string {
  const toolCalls =
    step?.toolCalls ??
    step?.response?.toolCalls ??
    step?.response?.messages?.filter?.((msg: any) => msg?.role === "tool")

  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return "none"

  return toolCalls
    .slice(0, 5)
    .map((call: any, idx: number) => {
      const name = call?.name ?? call?.toolName ?? call?.type ?? "tool"
      const toolCallId = call?.toolCallId ?? call?.id ?? idx
      const args =
        call?.args ??
        call?.arguments ??
        call?.input ??
        call?.params ??
        call?.payload ??
        {}
      return `${toolCallId}:${name} args=${truncate(args, 120)}`
    })
    .join(" | ")
}

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
    const logPrefix = `${LOG_PREFIX}[thread:${args.threadId}][prompt:${args.promptMessageId}]`
    console.log(`${logPrefix} stream start`)

    try {
      const result = await marketplaceAgent.streamText(
        ctx,
        { threadId: args.threadId },
        {
          promptMessageId: args.promptMessageId,
          onStepFinish: (step: any) => {
            const reasoning = truncate(
              step?.reasoningText ?? step?.reasoning ?? step?.response?.reasoning ?? "",
              500,
            )
            const textPreview = truncate(
              step?.text ?? step?.content ?? step?.response?.text ?? "",
              200,
            )
            console.log(`${logPrefix} step`, {
              order: step?.order ?? step?.step ?? step?.index,
              finishReason: step?.finishReason,
              reasoning,
              textPreview,
              tools: summarizeToolCalls(step),
            })
          },
        },
        { saveStreamDeltas: { chunking: "word", throttleMs: 100 } },
      )

      // Consume the stream to ensure it completes
      await result.consumeStream()

      let finishReason: unknown = undefined
      try {
        finishReason = await result.finishReason
      } catch (finishError) {
        finishReason = `finishReason error: ${truncate(finishError, 200)}`
      }
      console.log(`${logPrefix} stream complete`, { finishReason })
    } catch (error) {
      console.error(`${logPrefix} Stream response error:`, error)
      throw error
    }

    return null
  },
})

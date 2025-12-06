import { v } from "convex/values"

import { action } from "./_generated/server"
import { getAuthenticatedUser } from "./lib/auth"

/**
 * Get the Gemini API key for authenticated users.
 * This keeps the API key out of the client bundle, but note that
 * once fetched, it will still be visible in the client's memory.
 *
 * For better security, consider:
 * 1. Using Google Cloud API key restrictions (by app bundle ID, IP, etc.)
 * 2. Implementing rate limiting
 * 3. Using a proxy service that handles the WebSocket connection server-side
 */
export const getGeminiApiKey = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    // Ensure user is authenticated
    await getAuthenticatedUser(ctx)

    // Get API key from Convex secrets
    // Set this via: npx convex env set GEMINI_API_KEY "your-key-here"
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured in Convex secrets")
    }

    return apiKey
  },
})

"use node"

/**
 * RAG (Retrieval-Augmented Generation) component configuration
 * Uses Convex's RAG component for semantic search with Gemini embeddings
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { RAG } from "@convex-dev/rag"

import { EMBEDDING_MODEL, EMBEDDING_DIMENSION } from "./models"
import { components } from "../_generated/api"

// Create Google Generative AI client for embeddings
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? "",
})

/**
 * RAG instance configured with:
 * - Gemini embedding model (configured in models.ts)
 * - Global namespace for all product listings (no per-user isolation needed)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rag = new RAG(components.rag as any, {
  // Type assertion needed due to ai-sdk version differences
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textEmbeddingModel: google.textEmbeddingModel(EMBEDDING_MODEL) as any,
  embeddingDimension: EMBEDDING_DIMENSION,
})

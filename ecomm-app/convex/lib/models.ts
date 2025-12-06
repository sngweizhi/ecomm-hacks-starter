/**
 * Central configuration for all LLM models used across the application
 * This is the single source of truth for model selection
 */

// ============================================================================
// Gemini Models
// ============================================================================

/**
 * Model for chat agent - handles user conversations with tool use
 * Smart model for complex reasoning and RAG
 */
export const CHAT_AGENT_MODEL = "gemini-2.0-flash"

/**
 * Model for embeddings - used for product search
 * Note: text-embedding-004 is an AI SDK 5-compatible v2 model
 */
export const EMBEDDING_MODEL = "text-embedding-004"

/**
 * Embedding dimension for the model
 * Note: text-embedding-004 outputs 768-dimension vectors
 */
export const EMBEDDING_DIMENSION = 768

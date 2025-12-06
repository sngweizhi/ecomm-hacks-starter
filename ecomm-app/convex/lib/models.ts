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
 * Note: gemini-embedding-001 supports AI SDK 5's v2 specification
 */
export const EMBEDDING_MODEL = "gemini-embedding-001"

/**
 * Embedding dimension for the model
 * Note: gemini-embedding-001 uses 3072 dimensions (state-of-the-art quality)
 */
export const EMBEDDING_DIMENSION = 3072

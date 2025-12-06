---
name: Marketplace AI Chat RAG
overview: Implement a persistent single-chat AI assistant for the marketplace app that uses RAG to search products and recommend listings to users, with clickable product cards that navigate to actual listings.
todos:
  - id: setup-dependencies
    content: Add AI SDK v5, @convex-dev/agent, @convex-dev/rag, zod, and react-native-markdown-display to package.json
    status: completed
  - id: convex-config
    content: Create convex/convex.config.ts to register agent and rag components
    status: completed
  - id: lib-files
    content: Create convex/lib/rag.ts, models.ts, and prompts.ts with RAG config, model constants, and system prompt
    status: completed
  - id: marketplace-agent
    content: Create convex/marketplaceAgent.ts with Agent definition and searchProducts tool
    status: completed
  - id: chat-backend
    content: Create convex/chat.ts with getOrCreateUserChat, sendMessage, listMessages queries/mutations
    status: completed
  - id: chat-actions
    content: Create convex/chatActions.ts with streamResponse internal action
    status: completed
  - id: listing-embeddings
    content: Create convex/listingEmbeddings.ts with embedListing, removeListingEmbedding, and backfill actions
    status: completed
  - id: schema-update
    content: Update convex/schema.ts to add ragEntryId field to listings table
    status: completed
  - id: chat-view-component
    content: Create src/components/MarketplaceChatView.tsx main chat UI component
    status: completed
  - id: product-card
    content: Create src/components/ProductChatCard.tsx for inline product display in chat
    status: completed
  - id: markdown-content
    content: Create src/components/MarkdownContent.tsx for rendering AI responses with markdown
    status: completed
  - id: chat-screen
    content: Create chat screen/tab route to render MarketplaceChatView
    status: completed
  - id: integrate-embeddings
    content: Update listings.ts create/update mutations to trigger embedding generation
    status: completed
---

# Marketplace AI Chat with Product RAG

## Overview

Build a single persistent chat per user (no threads) where an AI agent can search and recommend marketplace products using RAG. Products appear as clickable cards in the chat that navigate to the listing detail page.

## Dependencies to Add

**package.json additions:**

```json
{
  "@ai-sdk/openai": "^2.0.0",
  "@convex-dev/agent": "^0.3.2",
  "@convex-dev/rag": "^0.6.1",
  "ai": "^5.0.0",
  "zod": "^3.25.0",
  "react-native-markdown-display": "^7.0.2"
}
```

## Architecture

### 1. Single Chat Per User (No Threads)

Unlike Zeika's multi-thread model, we'll create/retrieve one chat thread per user automatically. The thread ID is derived from or stored with the user, so they always continue the same conversation.

### 2. RAG on Product Listings

- Embed listing `title + description` using the RAG component
- Store embeddings per-listing with listing ID as the key
- Search returns relevant products with scores
- Re-embed when listings are updated

---

## Convex Backend

### `convex/convex.config.ts`

Register the agent and RAG components:

```typescript
import agent from "@convex-dev/agent/convex.config"
import rag from "@convex-dev/rag/convex.config"
import { defineApp } from "convex/server"

const app = defineApp()
app.use(rag)
app.use(agent)
export default app
```

### `convex/lib/rag.ts`

Configure RAG with embedding model (DeepInfra or OpenAI):

```typescript
import { createOpenAI } from "@ai-sdk/openai"
import { RAG } from "@convex-dev/rag"
import { components } from "../_generated/api"

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
})

export const rag = new RAG(components.rag, {
  textEmbeddingModel: openai.textEmbeddingModel("text-embedding-3-small"),
  embeddingDimension: 1536,
})
```

### `convex/lib/models.ts`

```typescript
export const CHAT_AGENT_MODEL = "gpt-4o"
export const EMBEDDING_MODEL = "text-embedding-3-small"
```

### `convex/lib/prompts.ts`

```typescript
export const MARKETPLACE_AGENT_SYSTEM_PROMPT = `You are a helpful shopping assistant...`
```

### `convex/marketplaceAgent.ts`

Define the agent with a `searchProducts` tool:

```typescript
import { Agent, createTool } from "@convex-dev/agent"
import { z } from "zod/v3"
// Tool searches products via RAG and returns formatted results
// with listing IDs for citation/linking
```

### `convex/chat.ts`

Mutations and queries for single-user chat:

- `getOrCreateUserChat` - creates/retrieves the user's single thread
- `sendMessage` - sends user message, schedules agent response
- `listMessages` - paginated messages with streaming support

### `convex/chatActions.ts`

Internal actions for streaming AI responses.

### `convex/listingEmbeddings.ts`

Functions to embed listings:

- `embedListing` - embed a single listing (call on create/update)
- `removeListingEmbedding` - remove on archive/delete
- `backfillEmbeddings` - batch embed existing listings

### Schema Changes (`convex/schema.ts`)

Add `ragEntryId` to listings for tracking embeddings:

```typescript
listings: defineTable({
  // ... existing fields
  ragEntryId: v.optional(v.string()),
})
```

---

## React Native Frontend

### `src/components/MarketplaceChatView.tsx`

Main chat component (simplified from Zeika's `ChatView.tsx`):

- Auto-creates/retrieves single user chat on mount
- Uses `useUIMessages` from `@convex-dev/agent/react`
- Renders messages with markdown support
- Extracts product references from tool results
- Renders inline `ProductChatCard` components

### `src/components/ProductChatCard.tsx`

Compact product card for display in chat:

```typescript
interface ProductChatCardProps {
  listingId: Id<"listings">
  onPress: () => void
}
// Shows thumbnail, title, price in a tappable card
```

### `src/components/MarkdownContent.tsx`

Renders AI responses with markdown formatting and product citations.

### `src/app/(tabs)/chat.tsx` (or new route)

Tab/screen that renders `<MarketplaceChatView />`.

---

## Key Implementation Details

### Product Search Tool Response Format

The tool returns products in a format that can be parsed:

```
Found 3 matching products:

[1] ID: abc123
Title: MacBook Pro 2021
Price: $1,200
Category: Electronics
---

[2] ID: def456
...
```

### Product Citation Pattern

Agent references products using `[[product:1,2]] `format. Frontend parses these and renders `ProductChatCard` components.

### Embedding Flow

1. On listing create/update: schedule `embedListing` action
2. Action generates embedding via RAG component
3. Store `ragEntryId` on listing for cleanup
4. On archive/delete: call `removeListingEmbedding`

### Single Chat Pattern

```typescript
// Get or create user's single chat thread
const threadId = await getOrCreateUserChat(ctx)
// All messages go to this thread
await sendMessage({ threadId, prompt })
```

---

## Environment Variables Required

```
OPENAI_API_KEY=sk-...
# Or for DeepInfra:
DEEPINFRA_API_KEY=...
```
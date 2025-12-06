# E-Commerce Marketplace App

An AI-powered campus marketplace built with React Native and Expo, featuring
voice-first product listing creation, semantic search, and an intelligent chat
assistant for product recommendations.

## Features

- **AI-Powered Product Search**: Semantic search using RAG (Retrieval-Augmented
  Generation) to find products by meaning, not just keywords
- **Voice-First Listing Creation**: Record a video of your product and let AI
  extract details automatically
- **AI Chat Assistant**: Conversational interface for product recommendations
  and marketplace queries
- **Product Image Generation**: AI-generated product images from descriptions
- **Categories & Campus Listings**: Organized by category with campus-specific
  filtering
- **Favorites System**: Save products you're interested in
- **Real-Time Messaging**: Direct communication between buyers and sellers
- **Real-Time Updates**: Live data synchronization via Convex

## Tech Stack

### Frontend

- **React Native** 0.81.5 - Cross-platform mobile framework
- **Expo** 54.0.27 - Development platform and tooling
- **Expo Router** 6.0.10 - File-based routing
- **TypeScript** - Type-safe development
- **Zustand** - Lightweight state management

### Backend & Database

- **Convex** - Serverless backend and real-time database
- **Convex Agent Component** - AI agent framework
- **Convex RAG Component** - Retrieval-augmented generation for semantic search

### Authentication

- **Clerk** (@clerk/clerk-expo) - User authentication and management

### AI/ML

- **Google Gemini**:
  - `gemini-2.0-flash` - Chat agent for conversations and tool use
  - `text-embedding-004` - Vector embeddings for semantic search (768
    dimensions)
- **Gemini Live API** - Real-time voice interactions
- **AI SDK** (@ai-sdk/google) - Unified AI SDK for Google models

### UI Libraries

- **React Navigation** - Bottom tabs and native stack navigation
- **Shopify Flash List** - High-performance list rendering
- **React Native Reanimated** - Smooth animations
- **Gorhom Bottom Sheet** - Bottom sheet modals
- **Phosphor React Native** - Icon library

### Media & Camera

- **React Native Vision Camera** - Product photo capture
- **Expo AV** - Audio/video playback
- **React Native Live Audio Stream** - Real-time audio streaming
- **Expo Image Picker** - Image selection
- **Expo Image Manipulator** - Image processing

### Internationalization

- **i18next** & **react-i18next** - Multi-language support
- **date-fns** - Date formatting

### Development Tools

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Jest** - Testing framework
- **Maestro** - End-to-end testing
- **Reactotron** - Development debugging

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm (recommended) or npm
- Expo CLI
- Convex account
- Clerk account
- Google Cloud account (for Gemini API)

### Installation

1. **Clone the repository and install dependencies:**

```bash
cd ecomm-app
pnpm install
```

2. **Set up environment variables:**

Create a `.env.local` file in the `ecomm-app` directory with the following
variables:

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
EXPO_PUBLIC_CONVEX_URL=your_convex_deployment_url
```

3. **Configure Convex:**

```bash
# Install Convex CLI if you haven't already
npm install -g convex

# Login to Convex
npx convex login

# Set up your Convex project (if not already done)
npx convex dev

# Set the Gemini API key in Convex secrets
npx convex env set GEMINI_API_KEY "your_gemini_api_key"

# Configure Clerk JWT issuer domain in Convex Dashboard
# Set CLERK_JWT_ISSUER_DOMAIN in Convex Dashboard settings
```

4. **Configure Clerk:**

- Create a Clerk application at [clerk.com](https://clerk.com)
- Get your publishable key and add it to `.env.local`
- Configure the JWT issuer domain in your Convex Dashboard

5. **Start the development server:**

```bash
pnpm run start
```

### Building for Devices

To build for iOS simulator:

```bash
pnpm run build:ios:sim
```

To build for iOS device:

```bash
pnpm run build:ios:device
```

To build for Android:

```bash
pnpm run build:android:sim    # Simulator
pnpm run build:android:device # Physical device
```

## Project Structure

```
ecomm-app/
├── app/                    # Expo Router app directory
│   ├── (tabs)/            # Tab navigation screens
│   ├── category/          # Category detail pages
│   ├── listing/           # Product listing detail pages
│   ├── me/                # User profile and settings
│   ├── messages/          # Messaging interface
│   ├── search/            # Search interface
│   └── sell/              # Product listing creation flow
├── convex/                # Convex backend
│   ├── lib/              # Shared utilities (auth, models, prompts, RAG)
│   ├── listings.ts       # Listing queries and mutations
│   ├── marketplaceAgent.ts  # AI chat agent
│   ├── productImageGeneration.ts  # AI image generation
│   └── schema.ts         # Database schema
├── src/
│   ├── components/       # Reusable UI components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Client-side utilities (Gemini Live, product tools)
│   ├── theme/            # Theme configuration (colors, typography, spacing)
│   └── utils/            # Helper functions
└── assets/               # Images and icons
```

## Key Integrations

### Convex Backend

- Serverless functions for data operations
- Real-time subscriptions for live updates
- Vector search for semantic product matching
- AI agent integration for chat functionality

### Clerk Authentication

- Secure user authentication
- JWT-based session management
- Integrated with Convex for protected routes

### Gemini AI

- Chat agent for product recommendations
- Embeddings for semantic search
- Live API for voice interactions
- Image generation for product listings

## Development

### Running Tests

```bash
pnpm test              # Run Jest tests
pnpm test:watch        # Run tests in watch mode
pnpm test:maestro      # Run Maestro E2E tests
```

### Code Quality

```bash
pnpm lint              # Lint and fix code
pnpm lint:check        # Check linting without fixing
pnpm compile           # Type check TypeScript
```

## License

Built for hackathon demonstration purposes.

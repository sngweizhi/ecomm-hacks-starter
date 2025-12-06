
## Your Submission

**Delete the challenge brief above and fill out the sections below:**

### Team Name

R/N

### Team Members

- Nick Sng
- Rafael Mendiola

### Demo

- **Live URL:** [your-app.vercel.app or similar]
- **Demo Video:** https://youtube.com/shorts/crz0Bg6_IWM?si=ceVWdUk61rp3Sciv

### What We Built

An AI-powered campus marketplace mobile app that revolutionizes how students buy
and sell items. Users can create product listings by simply recording a video of
their item and talking to an AI assistant, which automatically extracts product
details, generates professional studio photos, and creates listings. The app
features semantic search powered by RAG to help users find products by meaning
rather than keywords, and includes an intelligent chat assistant for product
recommendations.

### How It Works

The app uses **Gemini Live API** for voice-first listing creation: users record
video while describing their product, and the AI analyzes frames and audio to
extract details through interactive Q&A. **Gemini 3 Pro
(gemini-3-pro-image-preview)** generates professional product images in two
ways: (1) background removal and studio photo generation from a single camera
shot, and (2) a 3x3 storyboard panel combining multiple video frames into a
comprehensive product sheet. **Gemini 2.0 Flash** powers the chat assistant with
function calling for product recommendations. The backend uses **Convex** for
real-time data sync and **Convex RAG Component** with Gemini embeddings
(`text-embedding-004`) for semantic product search. The architecture is fully
serverless with React Native/Expo frontend, Clerk for authentication, and all AI
processing handled server-side via Convex actions.

### Key Features

- **Voice-First Listing Creation**: Record video and let AI extract product
  details automatically through natural conversation
- **AI-Generated Product Images**: Professional studio photos and 3x3 product
  panels generated using Gemini 3 Pro image generation
- **Semantic Search**: Find products by meaning, not just keywords, using
  RAG-powered vector embeddings
- **AI Chat Assistant**: Conversational interface for product recommendations
  and marketplace queries
- **Real-Time Messaging**: Direct communication between buyers and sellers with
  live updates
- **Campus Marketplace**: Organized by category with campus-specific filtering

### Tech Stack

- **Frontend:** React Native 0.81.5, Expo 54.0.27, TypeScript, Expo Router
- **Backend:** Convex (serverless backend & real-time database)
- **Authentication:** Clerk
- **Models:** Gemini 3 Pro (gemini-3-pro-image-preview), Gemini 2.0 Flash,
  Gemini Live API, text-embedding-004
- **Other:** Convex Agent Component, Convex RAG Component, Zustand (state
  management), React Navigation

### Setup Instructions

```bash
# Navigate to the app directory
cd ecomm-app

# Install dependencies
pnpm install

# Set up environment variables in .env.local
# EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_key
# EXPO_PUBLIC_CONVEX_URL=your_convex_url

# Configure Convex and set Gemini API key
npx convex dev
npx convex env set GEMINI_API_KEY "your_gemini_api_key"

# Start the development server
pnpm run start
```

### Screenshots

![Screenshot 1](./ecomm-app/assets/images/photo_6172477310347447241_y.jpg)

![Screenshot 2](./ecomm-app/assets/images/photo_6172477310347447242_y.jpg)

![Screenshot 3](./ecomm-app/assets/images/photo_6172477310347447243_y.jpg)

![Screenshot 4](./ecomm-app/assets/images/photo_6172477310347447244_y.jpg)

### Challenges We Faced

Our biggest challenge was integrating Gemini Live API with React Native's audio
processing constraints. React Native lacks native support for real-time audio
streaming, requiring us to use multiple audio libraries
(`react-native-live-audio-stream`, `react-native-audio-api`,
`react-native-worklets`) and work around platform-specific limitations. We had
to implement custom audio worklets and PCM audio stream handlers to capture and
process audio in real-time, dealing with sample rate mismatches, buffer
management, and WebSocket connection stability. The audio processing pipeline
required extensive debugging across iOS and Android platforms, with different
behaviors on each. Generating high-quality product images with consistent white
backgrounds using Gemini 3 Pro required extensive prompt engineering and
iteration. Implementing semantic search with RAG required careful embedding
management and vector similarity search optimization. Coordinating multiple AI
model calls (Live API, image generation, embeddings) while maintaining good UX
and performance was challenging.

### What's Next

Making the realtime video-first method of creating listings more reliable and
able to process multiple images with different angles at once, as well as draw
bounding boxes to provide realtime feedback that the LLM correctly understood
which product the user is referring to. Enhanced image generation with more
sophisticated prompts for different product categories, improved voice
recognition accuracy for product details, expanded semantic search capabilities
with filters and sorting, push notifications for messages and favorites, and
analytics dashboard for sellers to track listing performance.

---
name: campus-marketplace-app
overview: Scaffold a new React Native/Expo marketplace app that reuses Zeika's Convex backend, auth, and UI foundations, with new listing, feed, and search experiences for a college marketplace.
todos:
  - id: setup-structure
    content: Create new Expo app directory and align configs with Zeika (TypeScript, Metro, babel, env).
    status: pending
  - id: import-shared-infra
    content: Copy Zeika theme, core components, auth context, and Convex backend into the new app structure.
    status: pending
  - id: convex-listings-model
    content: Define Convex listings table and core queries/mutations for feed, search, and user listings.
    status: pending
  - id: ui-home-feed
    content: Implement the two-column waterfall home feed with ListingCards and header search/categories.
    status: pending
  - id: ui-categories-search
    content: Build categories tab and search experience wired to Convex queries with filters/sorting.
    status: pending
  - id: ui-sell-flow
    content: Implement Sell tab with video capture, review screen, and create-listing mutation (AI-ready but stubbed).
    status: pending
  - id: ui-messages-me
    content: Scaffold Messages and Me tabs, including profile and user’s listings list.
    status: pending
---

# Campus Marketplace App – Multi-Phase Plan

## Overview

Reuse Zeika's Convex backend, Clerk-based auth, theming, and core components to scaffold a new Expo/React Native app for a college video-first marketplace. The new app will live alongside Zeika in this repo, but have its own navigation (Home, Categories, Sell, Messages, Me) and marketplace-specific data model, feeds, and listing flows.

## Phase 0 – Architecture & Project Layout

- **Decide app location**: Create a new Expo app directory (e.g. `campus-market/`) at the repo root so Zeika (`/zeika`) remains a private template and the new app is tracked in git.
- **Project structure**:
- New app: `campus-market/app` (Expo Router), `campus-market/src` for components, theme, context, stores.
- Backend: `convex/` at repo root (copied from `zeika/convex`) so both apps can share the same Convex deployment.
- **Tooling alignment**: Reuse Zeika's eslint, prettier, TypeScript, and Metro/babel config patterns as much as possible to keep DX consistent.

## Phase 1 – Import Shared Infrastructure from Zeika

- **Convex backend**:
- Copy `zeika/convex` into a root-level `convex/` directory (data model, functions, and Convex client setup) and adjust import paths so it can be used by the new app.
- Keep Zeika-specific functions (e.g., notes-related APIs) for now, but plan to add a separate `listings` module.
- **Theming & UI primitives**:
- Copy `zeika/src/theme` (colors, spacing, typography, `ThemeProvider`) into `campus-market/src/theme`.
- Copy core components that are generally useful (e.g., `Button`, `Text`, `Screen`, `Icon`, basic layout components) into `campus-market/src/components`.
- **Auth & app shell**:
- Copy `zeika/src/context/AuthContext.tsx` and any related auth utilities into `campus-market/src/context`.
- Implement a root layout similar to `zeika/app/_layout.tsx` in `campus-market/app/_layout.tsx` that wires up `ClerkProvider`, `ConvexProviderWithClerk`, `AuthProvider`, `ThemeProvider`, and global `Toast`.
- **Configuration**:
- Mirror Zeika's `app.config.ts`, `metro.config.js`, `babel.config.js`, and env handling so `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_CONVEX_URL` are shared.

## Phase 2 – Navigation Skeleton & Tab Bar

- **Expo Router structure**:
- Set up a `(tabs)` or `(app)` group under `campus-market/app` with a layout file like `app/(app)/_layout.tsx`.
- Create tab screens for: `home`, `categories`, `sell`, `messages`, and `me`.
- **Custom bottom tab bar**:
- Implement a custom bottom tab bar component that renders 5 tabs, matching the order: Home, Categories, Sell, Messages, Me.
- Design the center **Sell** tab as a large red plus button that visually “floats” above the bar (similar to the screenshot), using the theme colors and spacing.
- **Routing contract**:
- Define route names and params for future detail screens, e.g. `listing/[id].tsx`, `category/[slug].tsx`, and `me/listings.tsx`.

## Phase 3 – Marketplace Data Model in Convex

- **Listings table**:
- Extend Convex data model with a `listings` table including fields such as: `ownerId`, `title`, `description`, `price`, `currency`, `category`, `campus`, `videoUrl`, `thumbnailUrl`, `createdAt`, `status`, and basic engagement counters (views, favorites).
- **Convex functions**:
- Implement queries: `listings.listForFeed`, `listings.listByCategory`, `listings.getById`, `listings.listForUser`.
- Implement mutations: `listings.createFromDraft` (taking in metadata that we’ll later generate from AI + video), `listings.update`, `listings.markSold`, `listings.toggleFavorite`.
- **Indexing & search-readiness**:
- Add indexes on `createdAt`, `category`, `campus`, and a basic full-text-like search field (e.g. concatenated `title + description + tags`) so we can support simple search and filters without over-engineering.

## Phase 4 – Home Feed UI (Two-Column Waterfall)

- **Listing card component**:
- Create a `ListingCard` component in `campus-market/src/components/ListingCard.tsx` based on Zeika’s `Card` and `SearchResultCard` patterns, showing thumbnail, title, price, campus, and optional badges.
- **Waterfall layout**:
- Implement a home feed screen (`campus-market/app/(app)/home.tsx`) that renders listings in a two-column staggered masonry/waterfall layout, visually similar to the provided screenshot.
- Use a performant list implementation (e.g., `FlashList` with numColumns=2 or a masonry list) and spacing from the shared theme.
- **Feed header**:
- Add a top search bar, horizontal category chips, and possibly simple promo banners (as placeholders) at the top of the feed.
- **Data wiring**:
- Wire the feed to Convex via `useQuery` hooks calling `listings.listForFeed`, with basic pagination/infinite scroll.

## Phase 5 – Categories & Search Flows

- **Categories tab**:
- Implement `campus-market/app/(app)/categories.tsx` to show a grid/list of categories (e.g., Electronics, Textbooks, Furniture, Dorm Essentials, etc.), using reusable `CategoryPill`/card components.
- Tapping a category navigates to a category-specific feed (e.g., `category/[slug].tsx`) that reuses the ListingCard grid but calls `listings.listByCategory`.
- **Search UX**:
- Implement a dedicated search screen (either embedded in the Home tab or as a separate route like `search/index.tsx`) with search input, recent searches, and filters.
- Connect to Convex search query (e.g. `listings.search`) with debounce (reusing Zeika’s `useDebouncedValue` hook) and show results using the same card grid.
- **Filtering & sorting**:
- Add basic filters for campus and category, and allow sorting by newest or price, passing these as parameters to Convex queries.

## Phase 6 – Sell Flow (Video-Based Listing Creation, AI-Ready)

- **Sell tab behavior**:
- Make the center red plus button open a dedicated `sell/index.tsx` flow rather than a standard tab content screen.
- **Video capture stub**:
- Implement a simple video capture screen using Expo Camera (or a placeholder component initially) that records a short clip and saves the `videoUri`.
- After capture, navigate to a `sell/review.tsx` screen that shows the video thumbnail and basic auto-generated placeholder text (e.g., “Listing draft for video XYZ”).
- **Listing creation without AI (for now)**:
- Implement a Convex mutation `listings.createFromDraft` that accepts `ownerId`, `videoUrl`, and temporary stubbed metadata (`title`, `description`, `price`), which we can later replace with AI-generated values.
- Wire the review screen’s “Publish Listing” button to this mutation and then redirect to the listing detail or home feed.
- **AI integration hooks (future)**:
- Define a client-side helper or Convex action entrypoint like `listings.generateMetadataFromVideo(videoUrl)` but keep its implementation minimal or stubbed so we can layer AI later without changing the Sell flow UI.

## Phase 7 – Messages & Me Tabs

- **Me tab**:
- Implement `me/index.tsx` to show the logged-in user’s profile (from Clerk) and a list of their listings via `listings.listForUser`.
- Add quick actions: edit profile (Clerk), view campus, manage listings (edit/mark as sold), and logout (via `useAuth().logout`).
- **Messages tab (stub)**:
- Create `messages/index.tsx` showing a placeholder conversations list layout that we can later wire up to real-time messaging (potentially via Convex or a third-party service).
- Ensure navigation hooks to a `messages/[conversationId].tsx` detail screen, even if content is dummy for now.

## Phase 8 – Polish, Theming, and Performance

- **Visual polish**:
- Apply dark theme and high-contrast styling similar to Zeika, including cards, tab bar, and typography tuned for the marketplace use case.
- **Performance & offline**:
- Reuse any relevant offline patterns from Zeika (e.g., `useNetworkStatus`, offline queues) where they make sense for listing creation and viewing.
- **Testing & QA**:
- Add basic unit tests for key components (ListingCard, custom tab bar) and integration tests for the main flows (login, viewing feed, creating a listing) mirroring Zeika’s existing test setups.
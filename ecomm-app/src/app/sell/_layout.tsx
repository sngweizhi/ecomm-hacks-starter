import { Stack } from "expo-router"

import { useAppTheme } from "@/theme/context"

/**
 * Sell Flow Layout
 *
 * This layout wraps the sell flow screens (capture and review) in a Stack navigator.
 * The sell flow is a separate route group from the tabs, allowing for:
 * - Full-screen video capture experience
 * - Proper back navigation from review to capture
 * - Clean exit back to the main tabs
 */
export default function SellLayout() {
  const { theme } = useAppTheme()

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: "slide_from_bottom", // Modal-like presentation
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Create Listing",
        }}
      />
      <Stack.Screen
        name="review"
        options={{
          title: "Review Listing",
          animation: "slide_from_right", // Standard push animation for review
        }}
      />
    </Stack>
  )
}


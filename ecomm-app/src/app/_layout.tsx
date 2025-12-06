import { useEffect, useState } from "react"
import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/clerk-expo"
import { tokenCache } from "@clerk/clerk-expo/token-cache"
import { useFonts } from "@expo-google-fonts/space-grotesk"
import { Slot, SplashScreen } from "expo-router"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { GestureHandlerRootView } from "react-native-gesture-handler"

import { AuthProvider } from "@/context/AuthContext"
import { initI18n } from "@/i18n"
import { ThemeProvider } from "@/theme/context"
import { customFontsToLoad } from "@/theme/typography"
import { loadDateFnsLocale } from "@/utils/formatDate"
import { Toast, toastConfig } from "@/utils/toast"

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync()

// Validate required environment variables
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
if (!clerkPublishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable. " +
      "Please set it in your .env file or environment configuration.",
  )
}

// Initialize Convex client
const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
})

if (__DEV__) {
  // Load Reactotron configuration in development
  require("@/devtools/ReactotronConfig")
}

export default function RootLayout() {
  const [areFontsLoaded, fontLoadError] = useFonts(customFontsToLoad)
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)

  useEffect(() => {
    initI18n()
      .then(() => setIsI18nInitialized(true))
      .then(() => loadDateFnsLocale())
  }, [])

  useEffect(() => {
    if ((areFontsLoaded || fontLoadError) && isI18nInitialized) {
      SplashScreen.hideAsync()
    }
  }, [areFontsLoaded, fontLoadError, isI18nInitialized])

  const isReady = isI18nInitialized && (areFontsLoaded || fontLoadError)

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider tokenCache={tokenCache} publishableKey={clerkPublishableKey}>
        <ConvexProviderWithClerk client={convex} useAuth={useClerkAuth}>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <KeyboardProvider>
              <AuthProvider>
                <ThemeProvider>
                  {isReady ? <Slot /> : null}
                  <Toast config={toastConfig} />
                </ThemeProvider>
              </AuthProvider>
            </KeyboardProvider>
          </SafeAreaProvider>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </GestureHandlerRootView>
  )
}

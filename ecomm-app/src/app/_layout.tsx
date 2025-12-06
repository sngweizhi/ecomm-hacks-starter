import { useEffect, useState } from "react"
import { StyleSheet } from "react-native"
import { Slot, SplashScreen } from "expo-router"
import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/clerk-expo"
import { tokenCache } from "@clerk/clerk-expo/token-cache"
import { useFonts } from "@expo-google-fonts/space-grotesk"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"

import { AuthProvider } from "@/context/AuthContext"
import { initI18n } from "@/i18n"
import { ThemeProvider } from "@/theme/context"
import { customFontsToLoad } from "@/theme/typography"
import { loadDateFnsLocale } from "@/utils/formatDate"
import { Toast, toastConfig } from "@/utils/toast"

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync()

// Handle unhandled promise rejections (e.g., keep-awake errors)
// This prevents non-critical errors from crashing the app
if (typeof global !== "undefined") {
  // Handle React Native error handler
  const ErrorUtils = (global as any).ErrorUtils
  if (ErrorUtils) {
    const originalHandler = ErrorUtils.getGlobalHandler?.()
    ErrorUtils.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
      // Ignore keep-awake errors as they're non-critical
      const errorMessage = error?.message || String(error)
      if (
        errorMessage.includes("keep awake") ||
        errorMessage.includes("keepAwake") ||
        errorMessage.includes("Unable to activate keep awake")
      ) {
        console.warn("[App] Ignoring keep-awake error:", errorMessage)
        return
      }
      // Call original handler for other errors
      if (originalHandler) {
        originalHandler(error, isFatal)
      }
    })
  }

  // Handle unhandled promise rejections
  const originalUnhandledRejection = (global as any).onunhandledrejection
  ;(global as any).onunhandledrejection = (event: { reason?: any; preventDefault?: () => void }) => {
    const reason = event?.reason
    const errorMessage =
      reason?.message || reason?.toString() || String(reason) || ""
    // Ignore keep-awake errors as they're non-critical
    if (
      errorMessage.includes("keep awake") ||
      errorMessage.includes("keepAwake") ||
      errorMessage.includes("Unable to activate keep awake")
    ) {
      console.warn("[App] Ignoring keep-awake promise rejection:", errorMessage)
      event.preventDefault?.()
      return
    }
    // Call original handler for other rejections
    if (originalUnhandledRejection) {
      originalUnhandledRejection(event)
    }
  }
}

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
    <GestureHandlerRootView style={styles.root}>
      <ClerkProvider tokenCache={tokenCache} publishableKey={clerkPublishableKey}>
        <ConvexProviderWithClerk client={convex} useAuth={useClerkAuth}>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <BottomSheetModalProvider>
              <KeyboardProvider>
                <AuthProvider>
                  <ThemeProvider>
                    {isReady ? <Slot /> : null}
                    <Toast config={toastConfig} />
                  </ThemeProvider>
                </AuthProvider>
              </KeyboardProvider>
            </BottomSheetModalProvider>
          </SafeAreaProvider>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})

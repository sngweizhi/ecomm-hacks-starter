import { useCallback, useEffect, useState } from "react"
import { Image, ImageStyle, Platform, TextStyle, View, ViewStyle } from "react-native"
import * as WebBrowser from "expo-web-browser"
import * as Linking from "expo-linking"
import { useOAuth, useAuth } from "@clerk/clerk-expo"
import { router } from "expo-router"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import { showErrorToast } from "@/utils/toast"
import type { ThemedStyle } from "@/theme/types"

const welcomeLogo = require("@assets/images/logo.png")

// Handle any pending authentication sessions
WebBrowser.maybeCompleteAuthSession()

// Warm up the browser for Android to improve UX
const useWarmUpBrowser = () => {
  useEffect(() => {
    if (Platform.OS !== "android") return
    void WebBrowser.warmUpAsync()
    return () => {
      void WebBrowser.coolDownAsync()
    }
  }, [])
}

export default function SignInScreen() {
  useWarmUpBrowser()

  const { themed } = useAppTheme()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { isSignedIn } = useAuth()
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" })

  // Redirect to app if already signed in
  useEffect(() => {
    if (isSignedIn) {
      router.replace("/(tabs)")
    }
  }, [isSignedIn])

  const onGoogleSignIn = useCallback(async () => {
    // If already signed in, just navigate
    if (isSignedIn) {
      router.replace("/(tabs)")
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const { createdSessionId, setActive } = await startOAuthFlow({
        redirectUrl: Linking.createURL("/", { scheme: "ecommapp" }),
      })

      // If sign in was successful, set the active session
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId })
        // Navigate to the main app
        router.replace("/(tabs)")
      }
    } catch (err: unknown) {
      // Check if this is a "session_exists" error - user is already signed in
      const clerkError = err as { errors?: Array<{ code?: string }> }
      if (clerkError?.errors?.some((e) => e.code === "session_exists")) {
        // User is already signed in, just navigate
        router.replace("/(tabs)")
        return
      }
      console.error("OAuth error:", JSON.stringify(err, null, 2))
      showErrorToast("Sign In Failed", "Failed to sign in with Google. Please try again.")
      setError("Failed to sign in with Google. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [startOAuthFlow, isSignedIn])

  return (
    <Screen
      preset="auto"
      contentContainerStyle={themed($screenContentContainer)}
      safeAreaEdges={["top", "bottom"]}
    >
      <View style={themed($topContainer)}>
        <Image style={themed($welcomeLogo)} source={welcomeLogo} resizeMode="contain" />
        <Text testID="login-heading" text="Campus Market" preset="heading" style={themed($heading)} />
        <Text text="Buy & sell with students near you" preset="subheading" style={themed($subheading)} />
      </View>

      <View style={themed($bottomContainer)}>
        {error && <Text text={error} style={themed($errorText)} />}

        <Button
          testID="google-sign-in-button"
          text={isLoading ? "Signing in..." : "Continue with Google"}
          style={themed($googleButton)}
          textStyle={themed($googleButtonText)}
          pressedStyle={themed($googleButtonPressed)}
          disabled={isLoading}
          onPress={onGoogleSignIn}
          LeftAccessory={() => (
            <View style={$googleIconContainer}>
              <GoogleIcon />
            </View>
          )}
        />
      </View>
    </Screen>
  )
}

// Google icon component
const GoogleIcon = () => (
  <View style={$googleIcon}>
    <Text style={$googleIconText}>G</Text>
  </View>
)

const $screenContentContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  paddingHorizontal: spacing.lg,
  justifyContent: "space-between",
})

const $topContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingTop: spacing.xxl,
})

const $bottomContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.xxl,
})

const $welcomeLogo: ThemedStyle<ImageStyle> = ({ spacing }) => ({
  height: 88,
  width: 200,
  marginBottom: spacing.xxl,
})

const $heading: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.xs,
  textAlign: "center",
})

const $subheading: ThemedStyle<TextStyle> = ({ spacing, colors }) => ({
  marginBottom: spacing.lg,
  textAlign: "center",
  color: colors.textDim,
})

const $errorText: ThemedStyle<TextStyle> = ({ spacing, colors }) => ({
  color: colors.error,
  marginBottom: spacing.md,
  textAlign: "center",
})

const $googleButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderWidth: 1,
  borderColor: colors.palette.neutral300,
  borderRadius: 12,
  paddingVertical: spacing.md,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
})

const $googleButtonPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
})

const $googleButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontWeight: "600",
})

const $googleIconContainer: ViewStyle = {
  marginRight: 12,
}

const $googleIcon: ViewStyle = {
  width: 24,
  height: 24,
  borderRadius: 12,
  backgroundColor: "#4285F4",
  justifyContent: "center",
  alignItems: "center",
}

const $googleIconText: TextStyle = {
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: "bold",
}

import { useEffect } from "react"
import { View, ActivityIndicator, StyleSheet } from "react-native"
import { router } from "expo-router"
import { useAuth } from "@clerk/clerk-expo"

import { useAppTheme } from "@/theme/context"

/**
 * Root index screen - redirects based on auth state
 */
export default function IndexScreen() {
  const { isSignedIn, isLoaded } = useAuth()
  const { theme } = useAppTheme()

  useEffect(() => {
    if (!isLoaded) return

    if (isSignedIn) {
      router.replace("/(tabs)")
    } else {
      router.replace("/sign-in")
    }
  }, [isSignedIn, isLoaded])

  // Show loading while checking auth
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" color={theme.colors.tint} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
})

import { View, ViewStyle, TextStyle, Pressable, Image, ActivityIndicator } from "react-native"
import { router } from "expo-router"
import { useQuery } from "convex/react"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Icon } from "@/components/Icon"
import { Button } from "@/components/Button"
import { useAuth } from "@/context/AuthContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { api } from "../../../convex/_generated/api"

const MENU_ITEMS = [
  { title: "My Listings", icon: "menu" as const, route: "/me/listings" },
  { title: "Favorites", icon: "bell" as const, route: "/me/favorites" },
  { title: "Purchase History", icon: "menu" as const, route: "/me/purchases" },
  { title: "Settings", icon: "settings" as const, route: "/me/settings" },
]

export default function MeScreen() {
  const { themed, theme } = useAppTheme()
  const { userName, userEmail, userImageUrl, logout, isAuthenticated } = useAuth()
  
  // Fetch user stats from Convex
  const userStats = useQuery(api.listings.getUserStats, isAuthenticated ? {} : "skip")

  const handleMenuPress = (route: string) => {
    router.push(route)
  }

  const handleLogout = async () => {
    await logout()
    router.replace("/sign-in")
  }

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      {/* Profile Header */}
      <View style={themed($profileHeader)}>
        <View style={themed($avatarContainer)}>
          {userImageUrl ? (
            <Image source={{ uri: userImageUrl }} style={themed($avatar)} />
          ) : (
            <View style={themed($avatarPlaceholder)}>
              <Text text={(userName ?? "U").charAt(0).toUpperCase()} style={themed($avatarText)} />
            </View>
          )}
        </View>
        <Text text={userName ?? "User"} style={themed($userName)} />
        <Text text={userEmail ?? ""} style={themed($userEmail)} />
      </View>

      {/* Stats */}
      <View style={themed($statsContainer)}>
        <Pressable style={themed($statItem)} onPress={() => router.push("/me/listings")}>
          {userStats === undefined ? (
            <ActivityIndicator size="small" color={theme.colors.tint} />
          ) : (
            <Text text={String(userStats?.activeListings ?? 0)} style={themed($statNumber)} />
          )}
          <Text text="Listings" style={themed($statLabel)} />
        </Pressable>
        <View style={themed($statDivider)} />
        <Pressable style={themed($statItem)} onPress={() => router.push("/me/listings")}>
          {userStats === undefined ? (
            <ActivityIndicator size="small" color={theme.colors.tint} />
          ) : (
            <Text text={String(userStats?.soldListings ?? 0)} style={themed($statNumber)} />
          )}
          <Text text="Sold" style={themed($statLabel)} />
        </Pressable>
        <View style={themed($statDivider)} />
        <Pressable style={themed($statItem)} onPress={() => router.push("/me/favorites")}>
          {userStats === undefined ? (
            <ActivityIndicator size="small" color={theme.colors.tint} />
          ) : (
            <Text text={String(userStats?.totalFavorites ?? 0)} style={themed($statNumber)} />
          )}
          <Text text="Favorites" style={themed($statLabel)} />
        </Pressable>
      </View>

      {/* Menu Items */}
      <View style={themed($menuContainer)}>
        {MENU_ITEMS.map((item) => (
          <Pressable
            key={item.route}
            style={({ pressed }) => [themed($menuItem), pressed && themed($menuItemPressed)]}
            onPress={() => handleMenuPress(item.route)}
          >
            <Icon icon={item.icon} size={24} color={theme.colors.text} />
            <Text text={item.title} style={themed($menuItemText)} />
            <Icon icon="caretRight" size={20} color={theme.colors.textDim} />
          </Pressable>
        ))}
      </View>

      {/* Logout Button */}
      <View style={themed($logoutContainer)}>
        <Button
          text="Sign Out"
          preset="default"
          style={themed($logoutButton)}
          onPress={handleLogout}
        />
      </View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexGrow: 1,
  backgroundColor: colors.background,
  paddingHorizontal: spacing.lg,
})

const $profileHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingVertical: spacing.xl,
})

const $avatarContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $avatar: ThemedStyle<ViewStyle> = () => ({
  width: 100,
  height: 100,
  borderRadius: 50,
})

const $avatarPlaceholder: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 100,
  height: 100,
  borderRadius: 50,
  backgroundColor: colors.palette.primary200,
  justifyContent: "center",
  alignItems: "center",
})

const $avatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 40,
  fontWeight: "600",
  color: colors.tint,
})

const $userName: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 24,
  fontWeight: "700",
  color: colors.text,
})

const $userEmail: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 14,
  color: colors.textDim,
  marginTop: spacing.xxs,
})

const $statsContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
  padding: spacing.md,
  marginBottom: spacing.lg,
})

const $statItem: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
})

const $statNumber: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 24,
  fontWeight: "700",
  color: colors.text,
})

const $statLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 12,
  color: colors.textDim,
})

const $statDivider: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 1,
  backgroundColor: colors.separator,
})

const $menuContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $menuItem: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
  padding: spacing.md,
  marginBottom: spacing.sm,
})

const $menuItemPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
})

const $menuItemText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  flex: 1,
  fontSize: 16,
  fontWeight: "500",
  color: colors.text,
  marginLeft: spacing.md,
})

const $logoutContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.xl,
})

const $logoutButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.error,
  borderWidth: 1,
})

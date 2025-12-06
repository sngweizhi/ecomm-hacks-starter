import {
  View,
  ViewStyle,
  TextStyle,
  Pressable,
  FlatList,
  ActivityIndicator,
  Image,
} from "react-native"
import { router } from "expo-router"
import { useQuery } from "convex/react"

import { Icon } from "@/components/Icon"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAuth } from "@/context/AuthContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../../convex/_generated/api"
import type { Doc, Id } from "../../../convex/_generated/dataModel"

export default function FavoritesScreen() {
  const { themed, theme } = useAppTheme()
  const { isAuthenticated } = useAuth()

  // Fetch user's favorited listings
  const favorites = useQuery(api.listings.listFavorites, isAuthenticated ? {} : "skip")

  const handleBack = () => {
    router.back()
  }

  const handleListingPress = (listingId: Id<"listings">) => {
    router.push(`/listing/${listingId}`)
  }

  const renderListing = ({ item }: { item: Doc<"listings"> }) => (
    <Pressable
      style={({ pressed }) => [themed($listingCard), pressed && themed($listingCardPressed)]}
      onPress={() => handleListingPress(item._id)}
    >
      {/* Thumbnail */}
      <View style={themed($thumbnail)}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={themed($thumbnailImage)} />
        ) : (
          <Icon icon="image" size={24} color={theme.colors.textDim} />
        )}
      </View>

      <View style={themed($listingInfo)}>
        <Text text={item.title} style={themed($listingTitle)} numberOfLines={1} />
        <Text text={`$${item.price.toFixed(2)}`} style={themed($listingPrice)} />
        {item.campus && <Text text={item.campus} style={themed($campusText)} numberOfLines={1} />}
      </View>

      <Icon icon="caretRight" size={20} color={theme.colors.textDim} />
    </Pressable>
  )

  const renderEmptyState = () => (
    <View style={themed($emptyContainer)}>
      <Icon icon="heart" size={64} color={theme.colors.textDim} />
      <Text text="No favorites yet" preset="heading" style={themed($emptyTitle)} />
      <Text
        text="Save listings you're interested in by tapping the heart icon. They'll appear here for easy access."
        style={themed($emptySubtitle)}
      />
    </View>
  )

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      {/* Header */}
      <View style={themed($header)}>
        <Pressable onPress={handleBack} style={themed($backButton)}>
          <Icon icon="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text text="Favorites" preset="heading" style={themed($headerTitle)} />
        <View style={themed($headerSpacer)} />
      </View>

      {favorites === undefined ? (
        <View style={themed($loadingContainer)}>
          <ActivityIndicator size="large" color={theme.colors.tint} />
        </View>
      ) : (
        <FlatList
          data={favorites}
          renderItem={renderListing}
          keyExtractor={(item) => item._id}
          contentContainerStyle={themed($listContainer)}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmptyState}
        />
      )}
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
})

const $backButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.palette.neutral100,
  justifyContent: "center",
  alignItems: "center",
  marginRight: spacing.sm,
})

const $headerTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.text,
})

const $headerSpacer: ThemedStyle<ViewStyle> = () => ({
  width: 40,
})

const $loadingContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $listContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.lg,
  flexGrow: 1,
})

const $listingCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
  padding: spacing.sm,
  marginBottom: spacing.sm,
  alignItems: "center",
})

const $listingCardPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
})

const $thumbnail: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 70,
  height: 70,
  borderRadius: 8,
  backgroundColor: colors.palette.neutral200,
  justifyContent: "center",
  alignItems: "center",
  marginRight: spacing.sm,
  overflow: "hidden",
})

const $thumbnailImage: ThemedStyle<ViewStyle> = () => ({
  width: 70,
  height: 70,
})

const $listingInfo: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $listingTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 15,
  fontWeight: "600",
  color: colors.text,
})

const $listingPrice: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "700",
  color: colors.tint,
  marginTop: 2,
})

const $campusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 12,
  color: colors.textDim,
  marginTop: 2,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: spacing.xl,
})

const $emptyTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  textAlign: "center",
  marginTop: spacing.md,
})

const $emptySubtitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  textAlign: "center",
  marginTop: spacing.sm,
})

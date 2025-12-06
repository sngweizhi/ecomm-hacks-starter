import { useEffect, useCallback, useState } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  ImageStyle,
  Share,
  Alert,
} from "react-native"
import { useLocalSearchParams, router } from "expo-router"
import { useQuery, useMutation } from "convex/react"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Icon } from "@/components/Icon"
import { Button } from "@/components/Button"
import { useAppTheme } from "@/theme/context"
import { useAuth } from "@/context/AuthContext"
import type { ThemedStyle } from "@/theme/types"

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { themed, theme } = useAppTheme()
  const { userId, isAuthenticated } = useAuth()
  const [isContacting, setIsContacting] = useState(false)

  // Fetch listing data from Convex
  const listing = useQuery(api.listings.getById, { id: id as Id<"listings"> })
  const isFavorited = useQuery(api.listings.isFavorited, { listingId: id as Id<"listings"> })

  // Mutations
  const toggleFavorite = useMutation(api.listings.toggleFavorite)
  const incrementViewCount = useMutation(api.listings.incrementViewCount)
  const getOrCreateConversation = useMutation(api.conversations.getOrCreate)

  // Increment view count on mount
  useEffect(() => {
    if (id) {
      incrementViewCount({ id: id as Id<"listings"> })
    }
  }, [id, incrementViewCount])

  const handleBack = () => {
    router.back()
  }

  const handleContactSeller = useCallback(async () => {
    if (!listing || !isAuthenticated) {
      if (!isAuthenticated) {
        Alert.alert("Sign In Required", "Please sign in to contact the seller.", [
          { text: "Cancel", style: "cancel" },
          { text: "Sign In", onPress: () => router.push("/sign-in") },
        ])
      }
      return
    }

    // Check if this is the user's own listing
    if (listing.ownerId === userId) {
      Alert.alert("Your Listing", "You can't message yourself about your own listing.")
      return
    }

    setIsContacting(true)
    try {
      const conversationId = await getOrCreateConversation({
        listingId: id as Id<"listings">,
      })
      router.push(`/messages/${conversationId}`)
    } catch (error) {
      Alert.alert("Error", "Failed to start conversation. Please try again.")
    } finally {
      setIsContacting(false)
    }
  }, [listing, isAuthenticated, userId, id, getOrCreateConversation])

  const handleFavorite = useCallback(async () => {
    if (!id) return
    try {
      await toggleFavorite({ listingId: id as Id<"listings"> })
    } catch (error) {
      console.error("Failed to toggle favorite:", error)
    }
  }, [id, toggleFavorite])

  const handleShare = useCallback(async () => {
    if (!listing) return
    try {
      await Share.share({
        message: `Check out ${listing.title} for ${formatPrice(listing.price, listing.currency)}!`,
      })
    } catch (error) {
      console.error("Failed to share:", error)
    }
  }, [listing])

  // Format price
  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)
  }

  // Format category name
  const formatCategory = (category: string) => {
    return category
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  // Get image URL
  const imageUrl = listing?.thumbnailUrl || listing?.imageUrls?.[0]

  // Loading state
  if (listing === undefined) {
    return (
      <Screen preset="fixed" contentContainerStyle={themed($container)}>
        <View style={themed($loadingContainer)}>
          <ActivityIndicator size="large" color={theme.colors.tint} />
        </View>
      </Screen>
    )
  }

  // Not found state
  if (listing === null) {
    return (
      <Screen preset="fixed" contentContainerStyle={themed($container)}>
        <View style={themed($header)}>
          <Pressable onPress={handleBack} style={themed($backButton)}>
            <Icon icon="back" size={24} color={theme.colors.text} />
          </Pressable>
        </View>
        <View style={themed($loadingContainer)}>
          <Text text="📦" style={$notFoundEmoji} />
          <Text text="Listing not found" preset="subheading" style={themed($notFoundText)} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)}>
      {/* Header with back button */}
      <View style={themed($header)}>
        <Pressable onPress={handleBack} style={themed($backButton)}>
          <Icon icon="back" size={24} color={theme.colors.text} />
        </Pressable>
        <View style={themed($headerActions)}>
          <Pressable onPress={handleShare} style={themed($headerAction)}>
            <Icon icon="share" size={24} color={theme.colors.text} />
          </Pressable>
          <Pressable onPress={handleFavorite} style={themed($headerAction)}>
            <Text text={isFavorited ? "❤️" : "🤍"} style={$favoriteIcon} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={themed($scrollView)}
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        {/* Video/Image */}
        <View style={themed($mediaContainer)}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={$mediaImage} resizeMode="cover" />
          ) : (
            <View style={themed($mediaPlaceholder)}>
              <Icon icon="image" size={48} color={theme.colors.textDim} />
              <Text text="No image available" style={themed($mediaPlaceholderText)} />
            </View>
          )}

          {/* Status badge */}
          {listing.status === "sold" && (
            <View style={themed($soldOverlay)}>
              <Text text="SOLD" style={themed($soldOverlayText)} />
            </View>
          )}
        </View>

        {/* Listing Info */}
        <View style={themed($infoContainer)}>
          <Text text={listing.title} preset="heading" style={themed($title)} />
          <Text text={formatPrice(listing.price, listing.currency)} style={themed($price)} />

          <View style={themed($metaRow)}>
            <View style={themed($badge)}>
              <Text text={formatCategory(listing.category)} style={themed($badgeText)} />
            </View>
            {listing.campus && <Text text={`• ${listing.campus}`} style={themed($metaText)} />}
          </View>

          {/* Stats row */}
          <View style={themed($statsRow)}>
            <Text text={`👁 ${listing.viewCount ?? 0} views`} style={themed($statText)} />
            <Text text={`❤️ ${listing.favoriteCount ?? 0} favorites`} style={themed($statText)} />
          </View>

          <View style={themed($divider)} />

          <Text text="Description" preset="subheading" style={themed($sectionTitle)} />
          <Text
            text={listing.description || "No description provided."}
            style={themed($description)}
          />

          <View style={themed($divider)} />

          {/* Seller Info - placeholder until we have user data */}
          <Text text="Seller" preset="subheading" style={themed($sectionTitle)} />
          <View style={themed($sellerContainer)}>
            <View style={themed($sellerAvatar)}>
              <Text text="S" style={themed($sellerAvatarText)} />
            </View>
            <View style={themed($sellerInfo)}>
              <Text text="Campus Seller" style={themed($sellerName)} />
              <Text text="Verified seller" style={themed($sellerMeta)} />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={themed($bottomCta)}>
        <Button
          text={
            listing.status === "sold"
              ? "Item Sold"
              : listing.ownerId === userId
                ? "Your Listing"
                : isContacting
                  ? "Starting Conversation..."
                  : "Contact Seller"
          }
          preset="filled"
          onPress={handleContactSeller}
          style={themed($contactButton)}
          disabled={listing.status === "sold" || listing.ownerId === userId || isContacting}
        />
      </View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $loadingContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $notFoundEmoji: TextStyle = {
  fontSize: 48,
  marginBottom: 16,
}

const $notFoundText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingHorizontal: spacing.md,
  paddingTop: spacing.xl,
  paddingBottom: spacing.sm,
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 10,
})

const $backButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.palette.neutral100,
  justifyContent: "center",
  alignItems: "center",
  shadowColor: colors.palette.neutral800,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 2,
})

const $headerActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
})

const $headerAction: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.palette.neutral100,
  justifyContent: "center",
  alignItems: "center",
  shadowColor: colors.palette.neutral800,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 2,
})

const $favoriteIcon: TextStyle = {
  fontSize: 20,
}

const $scrollView: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.xxl,
})

const $mediaContainer: ThemedStyle<ViewStyle> = () => ({
  aspectRatio: 1,
  width: "100%",
  position: "relative",
})

const $mediaImage: ImageStyle = {
  width: "100%",
  height: "100%",
}

const $mediaPlaceholder: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.palette.neutral200,
  justifyContent: "center",
  alignItems: "center",
})

const $mediaPlaceholderText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  marginTop: spacing.sm,
})

const $soldOverlay: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  justifyContent: "center",
  alignItems: "center",
})

const $soldOverlayText: ThemedStyle<TextStyle> = () => ({
  color: "#FFFFFF",
  fontSize: 32,
  fontWeight: "bold",
})

const $infoContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.lg,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $price: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 28,
  fontWeight: "700",
  color: colors.tint,
  marginTop: spacing.xs,
})

const $metaRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  marginTop: spacing.sm,
})

const $statsRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  marginTop: spacing.sm,
  gap: spacing.md,
})

const $statText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.textDim,
})

const $badge: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary100,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xxs,
  borderRadius: 12,
})

const $badgeText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 12,
  fontWeight: "500",
  color: colors.tint,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 14,
  color: colors.textDim,
  marginLeft: spacing.sm,
})

const $divider: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: 1,
  backgroundColor: colors.separator,
  marginVertical: spacing.lg,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.text,
  marginBottom: spacing.sm,
})

const $description: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  lineHeight: 22,
})

const $sellerContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
})

const $sellerAvatar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 50,
  height: 50,
  borderRadius: 25,
  backgroundColor: colors.palette.primary200,
  justifyContent: "center",
  alignItems: "center",
  marginRight: spacing.md,
})

const $sellerAvatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 20,
  fontWeight: "600",
  color: colors.tint,
})

const $sellerInfo: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $sellerName: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.text,
})

const $sellerMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 14,
  color: colors.textDim,
})

const $bottomCta: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  padding: spacing.md,
  backgroundColor: colors.background,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
})

const $contactButton: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

import { Image, ImageStyle, Pressable, View, ViewStyle, TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Text } from "./Text"
import type { Id } from "../../convex/_generated/dataModel"

export interface ListingData {
  _id: Id<"listings">
  title: string
  price: number
  currency: string
  thumbnailUrl?: string
  imageUrls?: string[]
  campus?: string
  category: string
  favoriteCount?: number
  viewCount?: number
  status: "draft" | "active" | "sold" | "archived"
}

interface ListingCardProps {
  listing: ListingData
  onPress?: () => void
  /** For masonry layout - alternating card heights */
  variant?: "default" | "tall" | "short"
}

/**
 * ListingCard - Displays a marketplace listing in a card format
 * Used in the home feed waterfall grid
 */
export function ListingCard({ listing, onPress, variant = "default" }: ListingCardProps) {
  const { themed } = useAppTheme()

  // Get the image URL from thumbnailUrl or first imageUrl
  const imageUrl = listing.thumbnailUrl || listing.imageUrls?.[0]

  // Format price
  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: listing.currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(listing.price)

  // Determine card height based on variant for masonry effect
  const imageHeight = variant === "tall" ? 200 : variant === "short" ? 120 : 160

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        themed($container),
        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Image Container */}
      <View style={[themed($imageContainer), { height: imageHeight }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={$image} resizeMode="cover" />
        ) : (
          <View style={themed($placeholderImage)}>
            <Text text="📷" style={$placeholderEmoji} />
          </View>
        )}

        {/* Status Badge */}
        {listing.status === "sold" && (
          <View style={themed($soldBadge)}>
            <Text text="SOLD" style={themed($soldBadgeText)} />
          </View>
        )}

        {/* Favorite Count Badge */}
        {(listing.favoriteCount ?? 0) > 0 && (
          <View style={themed($favoriteBadge)}>
            <Text text={`❤️ ${listing.favoriteCount}`} style={themed($favoriteBadgeText)} />
          </View>
        )}
      </View>

      {/* Content */}
      <View style={themed($content)}>
        {/* Title */}
        <Text
          text={listing.title}
          numberOfLines={2}
          style={themed($title)}
          weight="medium"
          size="xs"
        />

        {/* Price */}
        <Text text={formattedPrice} style={themed($price)} weight="bold" size="sm" />

        {/* Campus */}
        {listing.campus && (
          <Text text={listing.campus} numberOfLines={1} style={themed($campus)} size="xxs" />
        )}
      </View>
    </Pressable>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
  overflow: "hidden",
  marginBottom: spacing.sm,
  shadowColor: colors.palette.neutral800,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
})

const $imageContainer: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "100%",
  backgroundColor: colors.palette.neutral200,
  position: "relative",
})

const $image: ImageStyle = {
  width: "100%",
  height: "100%",
}

const $placeholderImage: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: colors.palette.neutral300,
})

const $placeholderEmoji: TextStyle = {
  fontSize: 32,
}

const $soldBadge: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  position: "absolute",
  top: spacing.xs,
  left: spacing.xs,
  backgroundColor: colors.palette.neutral800,
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.xxxs,
  borderRadius: 4,
})

const $soldBadgeText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 10,
  fontWeight: "bold",
})

const $favoriteBadge: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  bottom: spacing.xs,
  right: spacing.xs,
  backgroundColor: "rgba(0, 0, 0, 0.6)",
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.xxxs,
  borderRadius: 12,
})

const $favoriteBadgeText: ThemedStyle<TextStyle> = () => ({
  color: "#FFFFFF",
  fontSize: 11,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.xs,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  marginBottom: 4,
})

const $price: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  marginBottom: 2,
})

const $campus: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
})

import { Image, Pressable, View, ViewStyle, TextStyle, ImageStyle } from "react-native"
import { useQuery } from "convex/react"
import { ShoppingBag } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

interface ProductChatCardProps {
  listingId: Id<"listings">
  onPress: () => void
}

/**
 * Compact product card for display in chat messages
 * Shows thumbnail, title, and price in a tappable card
 */
export function ProductChatCard({ listingId, onPress }: ProductChatCardProps) {
  const {
    theme: { colors },
    themed,
  } = useAppTheme()

  const listing = useQuery(api.listings.getById, { id: listingId })

  if (!listing) {
    return (
      <View style={themed($card)}>
        <View style={themed($placeholderImage)}>
          <ShoppingBag size={20} color={colors.textDim} />
        </View>
        <View style={themed($content)}>
          <Text style={themed($title)} numberOfLines={1}>
            Loading...
          </Text>
        </View>
      </View>
    )
  }

  const thumbnailUrl = listing.thumbnailUrl || listing.imageUrls?.[0]

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [themed($card), pressed && themed($cardPressed)]}
    >
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={themed($image)} resizeMode="cover" />
      ) : (
        <View style={themed($placeholderImage)}>
          <ShoppingBag size={20} color={colors.textDim} />
        </View>
      )}

      <View style={themed($content)}>
        <Text style={themed($title)} numberOfLines={1}>
          {listing.title}
        </Text>
        <Text style={themed($price)}>${listing.price.toFixed(2)}</Text>
        <Text style={themed($category)} numberOfLines={1}>
          {listing.category}
        </Text>
      </View>

      <View style={themed($arrow)}>
        <Text style={themed($arrowText)}>→</Text>
      </View>
    </Pressable>
  )
}

// ============================================================================
// Styles
// ============================================================================

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
  padding: spacing.sm,
  borderWidth: 1,
  borderColor: colors.separator,
})

const $cardPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
})

const $image: ThemedStyle<ImageStyle> = () => ({
  width: 56,
  height: 56,
  borderRadius: 8,
})

const $placeholderImage: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 56,
  height: 56,
  borderRadius: 8,
  backgroundColor: colors.palette.neutral200,
  justifyContent: "center",
  alignItems: "center",
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  marginLeft: spacing.sm,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 14,
  fontWeight: "600",
  color: colors.text,
  marginBottom: 2,
})

const $price: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 15,
  fontWeight: "700",
  color: colors.tint,
  marginBottom: 2,
})

const $category: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 12,
  color: colors.textDim,
})

const $arrow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingLeft: spacing.sm,
})

const $arrowText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 18,
  color: colors.textDim,
})

import { useState, useRef, useCallback } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
} from "react-native"
import { router } from "expo-router"
import { useQuery, useMutation } from "convex/react"

import { Icon } from "@/components/Icon"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ActionSheet, type ActionSheetRef, type ActionSheetConfig } from "@/components/ActionSheet"
import { useAuth } from "@/context/AuthContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../../convex/_generated/api"
import type { Doc, Id } from "../../../convex/_generated/dataModel"

type ListingStatus = "draft" | "active" | "sold" | "archived"
type FilterTab = "all" | ListingStatus

export default function MyListingsScreen() {
  const { themed, theme } = useAppTheme()
  const { isAuthenticated } = useAuth()
  const actionSheetRef = useRef<ActionSheetRef>(null)
  const showSheet = useCallback(
    (sheetConfig: ActionSheetConfig) => actionSheetRef.current?.present(sheetConfig),
    [],
  )
  const [activeTab, setActiveTab] = useState<FilterTab>("all")

  // Fetch user's listings based on filter
  const statusFilter = activeTab === "all" ? undefined : activeTab
  const listings = useQuery(
    api.listings.listForUser,
    isAuthenticated ? { status: statusFilter } : "skip",
  )

  // Mutations
  const markSold = useMutation(api.listings.markSold)
  const deleteListing = useMutation(api.listings.deleteListing)

  const handleBack = () => {
    router.back()
  }

  const handleListingPress = (listingId: Id<"listings">) => {
    router.push(`/listing/${listingId}`)
  }

  const handleEditListing = (listing: Doc<"listings">) => {
    const actions: ActionSheetConfig["actions"] = [
      { text: "Cancel", style: "cancel" },
      { text: "View", onPress: () => router.push(`/listing/${listing._id}`) },
    ]

    if (listing.status === "active") {
      actions.push({
        text: "Mark as Sold",
        onPress: async () => {
          try {
            await markSold({ id: listing._id })
          } catch {
            showSheet({
              title: "Error",
              message: "Failed to mark listing as sold",
              actions: [{ text: "Dismiss", style: "primary" }],
            })
          }
        },
      })
    }

    if (listing.status !== "archived") {
      actions.push({
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteListing({ id: listing._id })
          } catch {
            showSheet({
              title: "Error",
              message: "Failed to delete listing",
              actions: [{ text: "Dismiss", style: "primary" }],
            })
          }
        },
      })
    }

    showSheet({
      title: "Manage Listing",
      message: `What would you like to do with "${listing.title}"?`,
      actions,
    })
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
        <View style={themed($listingMeta)}>
          <View style={[themed($statusBadge), themed($statusBadgeStyles[item.status])]}>
            <Text
              text={item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              style={themed($statusText)}
            />
          </View>
          <Text text={`${item.viewCount ?? 0} views`} style={themed($viewsText)} />
        </View>
      </View>

      <Pressable style={themed($editButton)} onPress={() => handleEditListing(item)}>
        <Icon icon="more" size={20} color={theme.colors.textDim} />
      </Pressable>
    </Pressable>
  )

  const renderEmptyState = () => (
    <View style={themed($emptyContainer)}>
      <Icon icon="package" size={64} color={theme.colors.textDim} />
      <Text text="No listings yet" preset="heading" style={themed($emptyTitle)} />
      <Text
        text="Create your first listing by tapping the red plus button below."
        style={themed($emptySubtitle)}
      />
    </View>
  )

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "sold", label: "Sold" },
    { key: "draft", label: "Drafts" },
  ]

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      {/* Header */}
      <View style={themed($header)}>
        <Pressable onPress={handleBack} style={themed($backButton)}>
          <Icon icon="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text text="My Listings" preset="heading" style={themed($headerTitle)} />
        <View style={themed($headerSpacer)} />
      </View>

      {/* Filter tabs */}
      <View style={themed($tabBar)}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[themed($tab), activeTab === tab.key && themed($tabActive)]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              text={tab.label}
              style={[themed($tabText), activeTab === tab.key && themed($tabTextActive)]}
            />
          </Pressable>
        ))}
      </View>

      {listings === undefined ? (
        <View style={themed($loadingContainer)}>
          <ActivityIndicator size="large" color={theme.colors.tint} />
        </View>
      ) : (
        <FlatList
          data={listings}
          renderItem={renderListing}
          keyExtractor={(item) => item._id}
          contentContainerStyle={themed($listContainer)}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmptyState}
        />
      )}
      <ActionSheet ref={actionSheetRef} />
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

const $tabBar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.sm,
  gap: spacing.xs,
})

const $tab: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  borderRadius: 16,
  backgroundColor: colors.palette.neutral200,
})

const $tabActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
})

const $tabText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 14,
  fontWeight: "500",
  color: colors.text,
})

const $tabTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
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

const $loadingContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
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

const $listingMeta: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  marginTop: spacing.xxs,
  gap: spacing.sm,
})

const $statusBadge: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: 4,
})

const $statusBadgeStyles: Record<string, ThemedStyle<ViewStyle>> = {
  active: ({ colors }) => ({
    backgroundColor: colors.palette.accent100,
  }),
  sold: ({ colors }) => ({
    backgroundColor: colors.palette.secondary100,
  }),
  draft: ({ colors }) => ({
    backgroundColor: colors.palette.neutral200,
  }),
}

const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 11,
  fontWeight: "500",
  color: colors.text,
})

const $viewsText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 12,
  color: colors.textDim,
})

const $editButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.sm,
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

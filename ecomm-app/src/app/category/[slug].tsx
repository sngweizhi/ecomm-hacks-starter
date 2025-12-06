import { useState, useCallback, useMemo } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
} from "react-native"
import { useLocalSearchParams, router } from "expo-router"
import { useQuery } from "convex/react"

import { Icon } from "@/components/Icon"
import { ListingCard, ListingData } from "@/components/ListingCard"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../../convex/_generated/api"

// Map slugs to display names (fallback)
const CATEGORY_NAMES: Record<string, string> = {
  "electronics": "Electronics",
  "textbooks": "Textbooks",
  "furniture": "Furniture",
  "clothing": "Clothing",
  "dorm-essentials": "Dorm Essentials",
  "sports-outdoors": "Sports & Outdoors",
  "tickets-events": "Tickets & Events",
  "free-stuff": "Free Stuff",
  "services": "Services",
  "other": "Other",
}

type SortOption = "newest" | "oldest" | "price_low" | "price_high"
type CampusFilter = string | null

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "price_low", label: "Price: Low to High" },
  { value: "price_high", label: "Price: High to Low" },
]

const SCREEN_WIDTH = Dimensions.get("window").width
const COLUMN_GAP = 12
const HORIZONTAL_PADDING = 16
const COLUMN_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - COLUMN_GAP) / 2

export default function CategoryFeedScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const { themed, theme } = useAppTheme()

  // State for filters and sorting
  const [sortBy, setSortBy] = useState<SortOption>("newest")
  const [campusFilter, setCampusFilter] = useState<CampusFilter>(null)
  const [showSortModal, setShowSortModal] = useState(false)
  const [showCampusModal, setShowCampusModal] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch category details
  const category = useQuery(api.categories.getBySlug, { slug: slug ?? "" })

  // Fetch listings for this category
  const listings = useQuery(api.listings.listByCategory, {
    category: slug ?? "",
    limit: 50,
  })

  // Sort and filter listings client-side
  const processedListings = useMemo(() => {
    if (!listings) return []

    let result = [...listings]

    // Filter by campus if selected
    if (campusFilter) {
      result = result.filter((l) => l.campus === campusFilter)
    }

    // Sort
    switch (sortBy) {
      case "newest":
        result.sort((a, b) => b.createdAt - a.createdAt)
        break
      case "oldest":
        result.sort((a, b) => a.createdAt - b.createdAt)
        break
      case "price_low":
        result.sort((a, b) => a.price - b.price)
        break
      case "price_high":
        result.sort((a, b) => b.price - a.price)
        break
    }

    return result
  }, [listings, sortBy, campusFilter])

  // Get unique campuses from listings
  const availableCampuses = useMemo(() => {
    if (!listings) return []
    const campuses = new Set(listings.map((l) => l.campus).filter(Boolean))
    return Array.from(campuses) as string[]
  }, [listings])

  const categoryName = category?.name ?? CATEGORY_NAMES[slug ?? ""] ?? "Category"

  const handleBack = () => {
    router.back()
  }

  const handleListingPress = (listingId: string) => {
    router.push(`/listing/${listingId}`)
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 1000)
  }, [])

  // Determine variant for masonry-like effect
  const getVariant = useCallback((index: number): "default" | "tall" | "short" => {
    const pattern = index % 4
    if (pattern === 0) return "tall"
    if (pattern === 1) return "short"
    if (pattern === 2) return "default"
    return "tall"
  }, [])

  const renderListingCard = useCallback(
    ({ item, index }: { item: ListingData; index: number }) => (
      <View style={{ width: COLUMN_WIDTH }}>
        <ListingCard
          listing={item}
          variant={getVariant(index)}
          onPress={() => handleListingPress(item._id)}
        />
      </View>
    ),
    [getVariant],
  )

  const renderHeader = () => (
    <View style={themed($filterBar)}>
      {/* Sort Filter */}
      <Pressable style={themed($filterChip)} onPress={() => setShowSortModal(true)}>
        <Text
          text={`Sort: ${SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Newest"}`}
          style={themed($filterChipText)}
          numberOfLines={1}
        />
        <Icon
          icon="caretRight"
          size={16}
          color={theme.colors.textDim}
          style={{ transform: [{ rotate: "90deg" }] }}
        />
      </Pressable>

      {/* Campus Filter */}
      {availableCampuses.length > 0 && (
        <Pressable
          style={[themed($filterChip), campusFilter && themed($filterChipActive)]}
          onPress={() => setShowCampusModal(true)}
        >
          <Text
            text={campusFilter ?? "Campus: All"}
            style={[themed($filterChipText), campusFilter && themed($filterChipTextActive)]}
            numberOfLines={1}
          />
          <Icon
            icon="caretRight"
            size={16}
            color={campusFilter ? theme.colors.palette.neutral100 : theme.colors.textDim}
            style={{ transform: [{ rotate: "90deg" }] }}
          />
        </Pressable>
      )}
    </View>
  )

  const renderEmpty = () => (
    <View style={themed($emptyContainer)}>
      {listings === undefined ? (
        <ActivityIndicator size="large" color={theme.colors.tint} />
      ) : (
        <>
          <Text text="📦" style={$emptyEmoji} />
          <Text text="No listings found" preset="subheading" style={themed($emptyText)} />
          <Text
            text={`Be the first to list something in ${categoryName}!`}
            style={themed($emptySubtext)}
          />
        </>
      )}
    </View>
  )

  const keyExtractor = useCallback((item: ListingData) => item._id, [])

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      {/* Header */}
      <View style={themed($header)}>
        <Pressable onPress={handleBack} style={themed($backButton)}>
          <Icon icon="back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text text={categoryName} preset="heading" style={themed($headerTitle)} numberOfLines={1} />
        <View style={themed($headerSpacer)} />
      </View>

      {/* Listing Count */}
      <View style={themed($countContainer)}>
        <Text
          text={
            processedListings.length === 1 ? "1 listing" : `${processedListings.length} listings`
          }
          style={themed($countText)}
        />
      </View>

      {/* Listings Grid */}
      <FlatList
        data={processedListings}
        renderItem={renderListingCard}
        keyExtractor={keyExtractor}
        numColumns={2}
        columnWrapperStyle={themed($columnWrapper)}
        contentContainerStyle={themed($listContent)}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.tint}
          />
        }
      />

      {/* Sort Modal */}
      <Modal
        visible={showSortModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <Pressable style={themed($modalOverlay)} onPress={() => setShowSortModal(false)}>
          <View style={themed($modalContent)}>
            <Text text="Sort By" preset="subheading" style={themed($modalTitle)} />
            {SORT_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  themed($modalOption),
                  sortBy === option.value && themed($modalOptionActive),
                ]}
                onPress={() => {
                  setSortBy(option.value)
                  setShowSortModal(false)
                }}
              >
                <Text
                  text={option.label}
                  style={[
                    themed($modalOptionText),
                    sortBy === option.value && themed($modalOptionTextActive),
                  ]}
                />
                {sortBy === option.value && (
                  <Icon icon="check" size={20} color={theme.colors.tint} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Campus Modal */}
      <Modal
        visible={showCampusModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCampusModal(false)}
      >
        <Pressable style={themed($modalOverlay)} onPress={() => setShowCampusModal(false)}>
          <View style={themed($modalContent)}>
            <Text text="Filter by Campus" preset="subheading" style={themed($modalTitle)} />
            <Pressable
              style={[themed($modalOption), !campusFilter && themed($modalOptionActive)]}
              onPress={() => {
                setCampusFilter(null)
                setShowCampusModal(false)
              }}
            >
              <Text
                text="All Campuses"
                style={[themed($modalOptionText), !campusFilter && themed($modalOptionTextActive)]}
              />
              {!campusFilter && <Icon icon="check" size={20} color={theme.colors.tint} />}
            </Pressable>
            {availableCampuses.map((campus) => (
              <Pressable
                key={campus}
                style={[
                  themed($modalOption),
                  campusFilter === campus && themed($modalOptionActive),
                ]}
                onPress={() => {
                  setCampusFilter(campus)
                  setShowCampusModal(false)
                }}
              >
                <Text
                  text={campus}
                  style={[
                    themed($modalOptionText),
                    campusFilter === campus && themed($modalOptionTextActive),
                  ]}
                />
                {campusFilter === campus && (
                  <Icon icon="check" size={20} color={theme.colors.tint} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
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

const $countContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xs,
})

const $countText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 14,
})

const $filterBar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  paddingBottom: spacing.sm,
  gap: spacing.sm,
  flexWrap: "wrap",
})

const $filterChip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: 16,
  gap: spacing.xxs,
  maxWidth: 160,
})

const $filterChipActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
})

const $filterChipText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.text,
})

const $filterChipTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xxl,
})

const $columnWrapper: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "space-between",
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xxxl,
  paddingHorizontal: spacing.lg,
})

const $emptyEmoji: TextStyle = {
  fontSize: 48,
  marginBottom: 16,
}

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  textAlign: "center",
  marginBottom: 8,
})

const $emptySubtext: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})

// Modal Styles
const $modalOverlay: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.palette.overlay50,
  justifyContent: "center",
  alignItems: "center",
  padding: 24,
})

const $modalContent: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderRadius: 16,
  padding: spacing.md,
  width: "100%",
  maxWidth: 320,
})

const $modalTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.text,
  marginBottom: spacing.sm,
  textAlign: "center",
})

const $modalOption: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.sm,
  borderRadius: 8,
  marginBottom: spacing.xxs,
})

const $modalOptionActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.primary100,
})

const $modalOptionText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 16,
})

const $modalOptionTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  fontWeight: "600",
})

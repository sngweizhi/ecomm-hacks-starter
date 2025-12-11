import { useState, useCallback, useMemo, useRef } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  ScrollView,
  // eslint-disable-next-line no-restricted-imports
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native"
import { FlashList } from "@shopify/flash-list"
import { useRouter } from "expo-router"
import { useQuery } from "convex/react"
import { Robot } from "phosphor-react-native"

import { ListingCard, ListingData } from "@/components/ListingCard"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Icon } from "@/components/Icon"
import { SelectionSheet, SelectionSheetRef } from "@/components/SelectionSheet"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../../convex/_generated/api"

type PriceFilter = "all" | "free" | "under25" | "25to50" | "50to100" | "100plus"
type SortOption = "newest" | "price_low" | "price_high"

// Price filter options
const priceFilters: { value: PriceFilter; label: string }[] = [
  { value: "all", label: "All Prices" },
  { value: "free", label: "Free" },
  { value: "under25", label: "Under $25" },
  { value: "25to50", label: "$25-$50" },
  { value: "50to100", label: "$50-$100" },
  { value: "100plus", label: "$100+" },
]

// Sort options
const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_low", label: "Price: Low" },
  { value: "price_high", label: "Price: High" },
]

export default function HomeScreen() {
  const { themed, theme } = useAppTheme()
  const router = useRouter()

  // State for filters
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all")
  const [sortBy, setSortBy] = useState<SortOption>("newest")
  const [refreshing, setRefreshing] = useState(false)

  // Refs for selection sheets
  const categorySheetRef = useRef<SelectionSheetRef>(null)
  const priceSheetRef = useRef<SelectionSheetRef>(null)
  const sortSheetRef = useRef<SelectionSheetRef>(null)

  // Fetch categories from Convex
  const categories = useQuery(api.categories.list)

  // Fetch listings from Convex with optional category filter
  const rawListings = useQuery(api.listings.listForFeed, {
    category: selectedCategory ?? undefined,
    limit: 50,
  })

  // Filter and sort listings client-side
  const listings = useMemo(() => {
    if (!rawListings) return undefined

    let filtered = [...rawListings]

    // Apply price filter
    if (priceFilter !== "all") {
      filtered = filtered.filter((listing) => {
        switch (priceFilter) {
          case "free":
            return listing.price === 0
          case "under25":
            return listing.price > 0 && listing.price < 25
          case "25to50":
            return listing.price >= 25 && listing.price < 50
          case "50to100":
            return listing.price >= 50 && listing.price < 100
          case "100plus":
            return listing.price >= 100
          default:
            return true
        }
      })
    }

    // Apply sort
    switch (sortBy) {
      case "newest":
        filtered.sort((a, b) => b.createdAt - a.createdAt)
        break
      case "price_low":
        filtered.sort((a, b) => a.price - b.price)
        break
      case "price_high":
        filtered.sort((a, b) => b.price - a.price)
        break
    }

    return filtered
  }, [rawListings, priceFilter, sortBy])

  // Handle refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true)
    // Convex queries automatically re-fetch, so we just need to wait a bit
    setTimeout(() => setRefreshing(false), 1000)
  }, [])

  // Handle listing press - navigate to listing detail
  const handleListingPress = useCallback(
    (listingId: string) => {
      router.push(`/listing/${listingId}`)
    },
    [router],
  )

  // Handle category selection
  const handleCategorySelect = useCallback((value: string | null) => {
    setSelectedCategory(value)
  }, [])

  // Handle price filter selection
  const handlePriceFilterSelect = useCallback((value: string | null) => {
    setPriceFilter((value as PriceFilter) || "all")
  }, [])

  // Handle sort selection
  const handleSortSelect = useCallback((value: string | null) => {
    setSortBy((value as SortOption) || "newest")
  }, [])

  // Create category list with "All" option
  const categoryList = useMemo(() => {
    const allOption = { slug: null as string | null, name: "All" }
    if (!categories) return [allOption]
    return [allOption, ...categories.map((c) => ({ slug: c.slug, name: c.name }))]
  }, [categories])

  // Open category sheet
  const openCategorySheet = useCallback(() => {
    const options = categoryList.map((cat) => ({
      value: cat.slug,
      label: cat.name,
    }))
    categorySheetRef.current?.present({
      title: "Category",
      options,
      selectedValue: selectedCategory,
      onSelect: handleCategorySelect,
    })
  }, [categoryList, selectedCategory, handleCategorySelect])

  // Open price filter sheet
  const openPriceSheet = useCallback(() => {
    priceSheetRef.current?.present({
      title: "Price Range",
      options: priceFilters.map((f) => ({ value: f.value, label: f.label })),
      selectedValue: priceFilter,
      onSelect: handlePriceFilterSelect,
    })
  }, [priceFilter, handlePriceFilterSelect])

  // Open sort sheet
  const openSortSheet = useCallback(() => {
    sortSheetRef.current?.present({
      title: "Sort By",
      options: sortOptions.map((s) => ({ value: s.value, label: s.label })),
      selectedValue: sortBy,
      onSelect: handleSortSelect,
    })
  }, [sortBy, handleSortSelect])

  // Determine variant for masonry-like effect (alternating heights)
  const getVariant = useCallback((index: number): "default" | "tall" | "short" => {
    const pattern = index % 4
    if (pattern === 0) return "tall"
    if (pattern === 1) return "short"
    if (pattern === 2) return "default"
    return "tall"
  }, [])

  // Render a single listing card
  const renderListingCard = useCallback(
    ({ item, index }: { item: ListingData; index: number }) => (
      <ListingCard
        listing={item}
        variant={getVariant(index)}
        onPress={() => handleListingPress(item._id)}
      />
    ),
    [getVariant, handleListingPress],
  )

  // Get current filter labels
  const currentCategoryLabel = useMemo(() => {
    const category = categoryList.find((c) => c.slug === selectedCategory)
    return category?.name || "All Categories"
  }, [categoryList, selectedCategory])

  const currentPriceLabel = useMemo(() => {
    const filter = priceFilters.find((f) => f.value === priceFilter)
    return filter?.label || "All Prices"
  }, [priceFilter])

  const currentSortLabel = useMemo(() => {
    const option = sortOptions.find((s) => s.value === sortBy)
    return option?.label || "Newest"
  }, [sortBy])

  // Render header (search + filters)
  const renderHeader = () => (
    <View>
      {/* Search Bar */}
      <View style={themed($searchContainer)}>
        <TextInput
          style={themed($searchInput)}
          placeholder="Search listings..."
          placeholderTextColor={theme.colors.textDim}
          onFocus={() => router.push("/search")}
        />
      </View>

      {/* Single Row Filter Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={themed($filterRow)}
      >
        {/* Category Filter */}
        <Pressable
          style={[
            themed($filterTrigger),
            selectedCategory !== null && themed($filterTriggerActive),
          ]}
          onPress={openCategorySheet}
        >
          <Text
            text={currentCategoryLabel}
            style={[
              themed($filterTriggerText),
              selectedCategory !== null && themed($filterTriggerTextActive),
            ]}
          />
          <Icon
            icon="caretRight"
            size={14}
            color={
              selectedCategory !== null
                ? theme.colors.palette.neutral100
                : theme.colors.textDim
            }
            style={themed($filterTriggerIcon)}
          />
        </Pressable>

        {/* Price Filter */}
        <Pressable
          style={[
            themed($filterTrigger),
            priceFilter !== "all" && themed($filterTriggerActive),
          ]}
          onPress={openPriceSheet}
        >
          <Text
            text={currentPriceLabel}
            style={[
              themed($filterTriggerText),
              priceFilter !== "all" && themed($filterTriggerTextActive),
            ]}
          />
          <Icon
            icon="caretRight"
            size={14}
            color={
              priceFilter !== "all"
                ? theme.colors.palette.neutral100
                : theme.colors.textDim
            }
            style={themed($filterTriggerIcon)}
          />
        </Pressable>

        {/* Sort Filter */}
        <Pressable
          style={[
            themed($filterTrigger),
            sortBy !== "newest" && themed($filterTriggerActive),
          ]}
          onPress={openSortSheet}
        >
          <Text
            text={currentSortLabel}
            style={[
              themed($filterTriggerText),
              sortBy !== "newest" && themed($filterTriggerTextActive),
            ]}
          />
          <Icon
            icon="caretRight"
            size={14}
            color={
              sortBy !== "newest"
                ? theme.colors.palette.neutral100
                : theme.colors.textDim
            }
            style={themed($filterTriggerIcon)}
          />
        </Pressable>
      </ScrollView>
    </View>
  )

  // Render empty state
  const renderEmptyState = () => (
    <View style={themed($emptyContainer)}>
      {listings === undefined ? (
        <ActivityIndicator size="large" color={theme.colors.tint} />
      ) : (
        <>
          <Text text="📦" style={$emptyEmoji} />
          <Text text="No listings found" preset="subheading" style={themed($emptyText)} />
          <Text
            text={
              selectedCategory || priceFilter !== "all"
                ? "Try adjusting your filters"
                : "Be the first to list something!"
            }
            style={themed($emptySubtext)}
          />
        </>
      )}
    </View>
  )

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: ListingData) => item._id, [])

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <FlashList
        data={listings ?? []}
        renderItem={renderListingCard}
        keyExtractor={keyExtractor}
        masonry
        numColumns={2}
        contentContainerStyle={themed($listContent)}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.tint}
          />
        }
      />

      {/* Selection Sheets */}
      <SelectionSheet ref={categorySheetRef} />
      <SelectionSheet ref={priceSheetRef} />
      <SelectionSheet ref={sortSheetRef} />

      {/* AI Assistant Floating Action Button */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: theme.colors.tint },
          pressed && styles.fabPressed,
        ]}
        onPress={() => router.push("/assistant")}
      >
        <Robot size={28} color="#FFFFFF" weight="fill" />
      </Pressable>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $searchContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
})

const $searchInput: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderRadius: 20,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  fontSize: 16,
  color: colors.text,
  borderWidth: 1,
  borderColor: colors.palette.neutral300,
})

const $filterRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.sm,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $filterTrigger: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  borderRadius: 20,
  backgroundColor: colors.palette.neutral100,
  borderWidth: 1,
  borderColor: colors.palette.neutral300,
  gap: spacing.xs,
})

const $filterTriggerActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
  borderColor: colors.tint,
})

const $filterTriggerText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 14,
  fontWeight: "500",
})

const $filterTriggerTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $filterTriggerIcon: ThemedStyle<ViewStyle> = () => ({
  transform: [{ rotate: "-90deg" }],
})

const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xxl,
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
  lineHeight: 56,
  marginBottom: 16,
  includeFontPadding: false,
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

// StyleSheet for FAB (non-themed)
/* eslint-disable react-native/no-color-literals */
const styles = StyleSheet.create({
  fab: {
    alignItems: "center",
    borderRadius: 28,
    bottom: 24,
    elevation: 8,
    height: 56,
    justifyContent: "center",
    position: "absolute",
    right: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    width: 56,
  },
  fabPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.95 }],
  },
})
/* eslint-enable react-native/no-color-literals */

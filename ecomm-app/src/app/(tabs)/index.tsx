import { useState, useCallback, useMemo } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  ScrollView,
  // eslint-disable-next-line no-restricted-imports
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  StyleSheet,
} from "react-native"
import { useRouter } from "expo-router"
import { useQuery } from "convex/react"
import { Robot } from "phosphor-react-native"

import { ListingCard, ListingData } from "@/components/ListingCard"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../../convex/_generated/api"

const SCREEN_WIDTH = Dimensions.get("window").width
const COLUMN_GAP = 12
const HORIZONTAL_PADDING = 16
const COLUMN_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - COLUMN_GAP) / 2

export default function HomeScreen() {
  const { themed, theme } = useAppTheme()
  const router = useRouter()

  // State for category filter
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch categories from Convex
  const categories = useQuery(api.categories.list)

  // Fetch listings from Convex with optional category filter
  const listings = useQuery(api.listings.listForFeed, {
    category: selectedCategory ?? undefined,
    limit: 50,
  })

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

  // Handle category press
  const handleCategoryPress = useCallback((categorySlug: string | null) => {
    setSelectedCategory((prev) => (prev === categorySlug ? null : categorySlug))
  }, [])

  // Create category list with "All" option
  const categoryList = useMemo(() => {
    const allOption = { slug: null as string | null, name: "All" }
    if (!categories) return [allOption]
    return [allOption, ...categories.map((c) => ({ slug: c.slug, name: c.name }))]
  }, [categories])

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
      <View style={{ width: COLUMN_WIDTH }}>
        <ListingCard
          listing={item}
          variant={getVariant(index)}
          onPress={() => handleListingPress(item._id)}
        />
      </View>
    ),
    [getVariant, handleListingPress],
  )

  // Render header (search + categories)
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

      {/* Category Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={themed($categoriesContainer)}
      >
        {categoryList.map((category) => {
          const isActive = selectedCategory === category.slug
          return (
            <Pressable
              key={category.slug ?? "all"}
              style={[themed($categoryPill), isActive && themed($categoryPillActive)]}
              onPress={() => handleCategoryPress(category.slug)}
            >
              <Text
                text={category.name}
                style={[themed($categoryText), isActive && themed($categoryTextActive)]}
              />
            </Pressable>
          )
        })}
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
              selectedCategory
                ? "Try selecting a different category"
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
      <FlatList
        data={listings ?? []}
        renderItem={renderListingCard}
        keyExtractor={keyExtractor}
        numColumns={2}
        columnWrapperStyle={themed($columnWrapper)}
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

const $categoriesContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.md,
})

const $categoryPill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  borderRadius: 20,
  backgroundColor: colors.palette.neutral100,
  marginRight: spacing.xs,
  borderWidth: 1,
  borderColor: colors.palette.neutral300,
})

const $categoryPillActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
  borderColor: colors.tint,
})

const $categoryText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 14,
  fontWeight: "500",
})

const $categoryTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
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

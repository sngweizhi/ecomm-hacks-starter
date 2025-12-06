import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  Pressable,
  FlatList,
  ActivityIndicator,
  // eslint-disable-next-line no-restricted-imports
  TextInput,
  Dimensions,
  ScrollView,
} from "react-native"
import { router } from "expo-router"
import { useQuery } from "convex/react"

import { Icon } from "@/components/Icon"
import { ListingCard, ListingData } from "@/components/ListingCard"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { SelectionSheet, type SelectionSheetRef, type SelectionSheetConfig } from "@/components/SelectionSheet"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { load, save, remove } from "@/utils/storage"

import { api } from "../../../convex/_generated/api"

const RECENT_SEARCHES_KEY = "recent_searches"
const MAX_RECENT_SEARCHES = 10

type SortOption = "relevance" | "newest" | "price_low" | "price_high"
type CategoryFilter = string | null
type CampusFilter = string | null

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "relevance", label: "Most Relevant" },
  { value: "newest", label: "Newest First" },
  { value: "price_low", label: "Price: Low to High" },
  { value: "price_high", label: "Price: High to Low" },
]

const SCREEN_WIDTH = Dimensions.get("window").width
const COLUMN_GAP = 12
const HORIZONTAL_PADDING = 16
const COLUMN_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - COLUMN_GAP) / 2

export default function SearchScreen() {
  const { themed, theme } = useAppTheme()
  const selectionSheetRef = useRef<SelectionSheetRef>(null)
  const openSelectionSheet = useCallback(
    (config: SelectionSheetConfig) => selectionSheetRef.current?.present(config),
    [],
  )

  // Search state
  const [searchText, setSearchText] = useState("")
  const debouncedSearch = useDebouncedValue(searchText, 300)

  // Filter state
  const [sortBy, setSortBy] = useState<SortOption>("relevance")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(null)
  const [campusFilter, setCampusFilter] = useState<CampusFilter>(null)

  // Recent searches
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  // Load recent searches on mount
  useEffect(() => {
    loadRecentSearches()
  }, [])

  const loadRecentSearches = () => {
    const stored = load<string[]>(RECENT_SEARCHES_KEY)
    if (stored && Array.isArray(stored)) {
      setRecentSearches(stored)
    }
  }

  const saveRecentSearch = useCallback(
    (term: string) => {
      if (!term.trim()) return

      const updated = [term, ...recentSearches.filter((s) => s !== term)].slice(
        0,
        MAX_RECENT_SEARCHES,
      )
      setRecentSearches(updated)
      save(RECENT_SEARCHES_KEY, updated)
    },
    [recentSearches],
  )

  const clearRecentSearches = () => {
    setRecentSearches([])
    remove(RECENT_SEARCHES_KEY)
  }

  const removeRecentSearch = (term: string) => {
    const updated = recentSearches.filter((s) => s !== term)
    setRecentSearches(updated)
    save(RECENT_SEARCHES_KEY, updated)
  }

  // Fetch categories for filter
  const categories = useQuery(api.categories.list)

  // Search listings with Convex
  const searchResults = useQuery(
    api.listings.search,
    debouncedSearch.trim()
      ? {
          searchTerm: debouncedSearch.trim(),
          category: categoryFilter ?? undefined,
          campus: campusFilter ?? undefined,
          limit: 50,
        }
      : "skip",
  )

  // Sort results client-side (Convex search returns by relevance)
  const sortedResults = useMemo(() => {
    if (!searchResults) return []

    const results = [...searchResults]

    switch (sortBy) {
      case "newest":
        results.sort((a, b) => b.createdAt - a.createdAt)
        break
      case "price_low":
        results.sort((a, b) => a.price - b.price)
        break
      case "price_high":
        results.sort((a, b) => b.price - a.price)
        break
      // relevance - keep original order from search
    }

    return results
  }, [searchResults, sortBy])

  // Get unique campuses from results
  const availableCampuses = useMemo(() => {
    if (!searchResults) return []
    const campuses = new Set(searchResults.map((l) => l.campus).filter(Boolean))
    return Array.from(campuses) as string[]
  }, [searchResults])

  const handleBack = () => {
    router.back()
  }

  const handleListingPress = useCallback(
    (listingId: string) => {
      if (searchText.trim()) {
        saveRecentSearch(searchText.trim())
      }
      router.push(`/listing/${listingId}`)
    },
    [searchText, saveRecentSearch],
  )

  const handleRecentSearchPress = (term: string) => {
    setSearchText(term)
  }

  const handleSearchSubmit = () => {
    if (searchText.trim()) {
      saveRecentSearch(searchText.trim())
    }
  }

  const clearFilters = () => {
    setCategoryFilter(null)
    setCampusFilter(null)
    setSortBy("relevance")
  }

  const hasActiveFilters = categoryFilter || campusFilter || sortBy !== "relevance"

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
    [getVariant, handleListingPress],
  )

  const keyExtractor = useCallback((item: ListingData) => item._id, [])

  const renderRecentSearches = () => {
    if (searchText.trim() || recentSearches.length === 0) return null

    return (
      <View style={themed($recentContainer)}>
        <View style={themed($recentHeader)}>
          <Text text="Recent Searches" preset="formLabel" style={themed($recentTitle)} />
          <Pressable onPress={clearRecentSearches}>
            <Text text="Clear All" style={themed($clearButton)} />
          </Pressable>
        </View>
        {recentSearches.map((term) => (
          <Pressable
            key={term}
            style={themed($recentItem)}
            onPress={() => handleRecentSearchPress(term)}
          >
            <Icon icon="clock" size={18} color={theme.colors.textDim} />
            <Text text={term} style={themed($recentItemText)} numberOfLines={1} />
            <Pressable
              onPress={() => removeRecentSearch(term)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon icon="x" size={18} color={theme.colors.textDim} />
            </Pressable>
          </Pressable>
        ))}
      </View>
    )
  }

  const renderFilters = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={themed($filterContainer)}
    >
      {/* Sort Filter */}
      <Pressable
        style={themed($filterChip)}
        onPress={() =>
          openSelectionSheet({
            title: "Sort By",
            options: SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
            selectedValue: sortBy,
            onSelect: (value) => setSortBy((value as SortOption) || "relevance"),
          })
        }
      >
        <Text
          text={SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Sort"}
          style={themed($filterChipText)}
          numberOfLines={1}
        />
        <Icon
          icon="caretRight"
          size={14}
          color={theme.colors.textDim}
          style={{ transform: [{ rotate: "90deg" }] }}
        />
      </Pressable>

      {/* Category Filter */}
      <Pressable
        style={[themed($filterChip), categoryFilter && themed($filterChipActive)]}
        onPress={() =>
          openSelectionSheet({
            title: "Category",
            options: [
              { value: null, label: "All Categories" },
              ...(categories?.map((c) => ({ value: c.slug, label: c.name })) ?? []),
            ],
            selectedValue: categoryFilter,
            onSelect: (value) => setCategoryFilter((value as CategoryFilter) ?? null),
          })
        }
      >
        <Text
          text={
            categoryFilter
              ? (categories?.find((c) => c.slug === categoryFilter)?.name ?? "Category")
              : "Category"
          }
          style={[themed($filterChipText), categoryFilter && themed($filterChipTextActive)]}
          numberOfLines={1}
        />
        <Icon
          icon="caretRight"
          size={14}
          color={categoryFilter ? theme.colors.palette.neutral100 : theme.colors.textDim}
          style={{ transform: [{ rotate: "90deg" }] }}
        />
      </Pressable>

      {/* Campus Filter */}
      {availableCampuses.length > 0 && (
        <Pressable
          style={[themed($filterChip), campusFilter && themed($filterChipActive)]}
          onPress={() =>
            openSelectionSheet({
              title: "Campus",
              options: [
                { value: null, label: "All Campuses" },
                ...availableCampuses.map((campus) => ({ value: campus, label: campus })),
              ],
              selectedValue: campusFilter,
              onSelect: (value) => setCampusFilter((value as CampusFilter) ?? null),
            })
          }
        >
          <Text
            text={campusFilter ?? "Campus"}
            style={[themed($filterChipText), campusFilter && themed($filterChipTextActive)]}
            numberOfLines={1}
          />
          <Icon
            icon="caretRight"
            size={14}
            color={campusFilter ? theme.colors.palette.neutral100 : theme.colors.textDim}
            style={{ transform: [{ rotate: "90deg" }] }}
          />
        </Pressable>
      )}

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Pressable style={themed($clearFiltersChip)} onPress={clearFilters}>
          <Icon icon="x" size={14} color={theme.colors.error} />
          <Text text="Clear" style={themed($clearFiltersText)} />
        </Pressable>
      )}
    </ScrollView>
  )

  const renderEmpty = () => {
    if (!searchText.trim()) {
      return renderRecentSearches()
    }

    if (searchResults === undefined) {
      return (
        <View style={themed($emptyContainer)}>
          <ActivityIndicator size="large" color={theme.colors.tint} />
          <Text text="Searching..." style={themed($emptyText)} />
        </View>
      )
    }

    return (
      <View style={themed($emptyContainer)}>
        <Text text="🔍" style={$emptyEmoji} />
        <Text text="No results found" preset="subheading" style={themed($emptyText)} />
        <Text
          text={`Try different keywords or remove some filters`}
          style={themed($emptySubtext)}
        />
      </View>
    )
  }

  const renderHeader = () => {
    if (!searchText.trim()) return null

    return (
      <View>
        {renderFilters()}
        {sortedResults.length > 0 && (
          <Text
            text={`${sortedResults.length} result${sortedResults.length === 1 ? "" : "s"}`}
            style={themed($resultCount)}
          />
        )}
      </View>
    )
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      {/* Header with Search */}
      <View style={themed($header)}>
        <Pressable onPress={handleBack} style={themed($backButton)}>
          <Icon icon="back" size={24} color={theme.colors.text} />
        </Pressable>
        <View style={themed($searchInputContainer)}>
          <Icon icon="magnifyingGlass" size={20} color={theme.colors.textDim} />
          <TextInput
            style={themed($searchInput)}
            placeholder="Search listings..."
            placeholderTextColor={theme.colors.textDim}
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            autoFocus
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText("")}>
              <Icon icon="x" size={20} color={theme.colors.textDim} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Results or Empty State */}
      {searchText.trim() ? (
        <FlatList
          data={sortedResults}
          renderItem={renderListingCard}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={sortedResults.length > 0 ? themed($columnWrapper) : undefined}
          contentContainerStyle={themed($listContent)}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        renderRecentSearches()
      )}
      <SelectionSheet ref={selectionSheetRef} />
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
  gap: spacing.sm,
})

const $backButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.palette.neutral100,
  justifyContent: "center",
  alignItems: "center",
})

const $searchInputContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 20,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  borderWidth: 1,
  borderColor: colors.palette.neutral300,
  gap: spacing.sm,
})

const $searchInput: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  fontSize: 16,
  color: colors.text,
  paddingVertical: 8,
})

const $filterContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.sm,
  gap: spacing.xs,
})

const $filterChip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: 16,
  gap: spacing.xxs,
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

const $clearFiltersChip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.errorBackground,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: 16,
  gap: spacing.xxs,
})

const $clearFiltersText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.error,
})

const $resultCount: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  fontSize: 14,
  marginBottom: spacing.sm,
})

const $listContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xxl,
})

const $columnWrapper: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "space-between",
})

const $recentContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  paddingHorizontal: spacing.md,
})

const $recentHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: spacing.sm,
})

const $recentTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
})

const $clearButton: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  fontSize: 14,
})

const $recentItem: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: 8,
  marginBottom: spacing.xs,
  gap: spacing.sm,
})

const $recentItemText: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.text,
  fontSize: 15,
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

const $emptyText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.text,
  textAlign: "center",
  marginTop: spacing.sm,
})

const $emptySubtext: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
  marginTop: 8,
})

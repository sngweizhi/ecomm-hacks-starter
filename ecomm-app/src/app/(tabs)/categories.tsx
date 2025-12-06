import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { View, ViewStyle, TextStyle, ScrollView, Pressable, ActivityIndicator } from "react-native"
import { router } from "expo-router"
import { useQuery } from "convex/react"

import { Icon, IconTypes } from "@/components/Icon"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { Button } from "@/components/Button"
import { SelectionSheet, type SelectionSheetRef, type SelectionSheetConfig } from "@/components/SelectionSheet"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../../convex/_generated/api"

// Icon mapping for categories (using Phosphor icons)
const CATEGORY_ICONS: Record<string, IconTypes> = {
  "electronics": "desktop",
  "textbooks": "book",
  "furniture": "couch",
  "clothing": "tShirt",
  "dorm-essentials": "bed",
  "sports-outdoors": "basketball",
  "tickets-events": "ticket",
  "free-stuff": "gift",
  "services": "wrench",
  "other": "dotsThreeCircle",
}

type Category = {
  _id: string
  _creationTime: number
  name: string
  slug: string
  icon?: string
  displayOrder: number
  isActive: boolean
}

export default function CategoriesScreen() {
  const { themed, theme } = useAppTheme()
  const selectionSheetRef = useRef<SelectionSheetRef>(null)
  const openSelectionSheet = useCallback(
    (config: SelectionSheetConfig) => selectionSheetRef.current?.present(config),
    [],
  )

  // Fetch categories from Convex
  const categories = useQuery(api.categories.list)

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Filter categories based on search query and selected category
  const filteredCategories = useMemo(() => {
    if (!categories) return []

    let filtered = categories

    // Filter by selected category
    if (selectedCategory) {
      filtered = filtered.filter((cat) => cat.slug === selectedCategory)
    }

    // Filter by search query
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (cat) =>
          cat.name.toLowerCase().includes(query) || cat.slug.toLowerCase().includes(query),
      )
    }

    return filtered
  }, [categories, debouncedSearchQuery, selectedCategory])

  const handleCategoryPress = (slug: string) => {
    router.push(`/category/${slug}`)
  }

  const handleSearchPress = () => {
    router.push("/search")
  }

  const handleClearSearch = () => {
    setSearchQuery("")
    setDebouncedSearchQuery("")
  }

  const handleClearFilters = () => {
    setSelectedCategory(null)
    setSearchQuery("")
    setDebouncedSearchQuery("")
  }

  const hasActiveFilters = selectedCategory !== null || debouncedSearchQuery.trim() !== ""

  const renderCategory = (item: Category) => {
    const iconName = CATEGORY_ICONS[item.slug] ?? "dotsThreeCircle"

    return (
      <Pressable
        key={item._id}
        style={({ pressed }) => [
          themed($categoryCard),
          pressed && themed($categoryCardPressed),
        ]}
        onPress={() => handleCategoryPress(item.slug)}
      >
        <View style={themed($iconContainer)}>
          <Icon icon={iconName} size={32} color={theme.colors.tint} />
        </View>
        <Text text={item.name} style={themed($categoryName)} numberOfLines={2} />
        <CategoryListingCount category={item.slug} />
      </Pressable>
    )
  }

  const renderFilters = () => (
    <View style={themed($filterRowContainer)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={themed($filterRow)}
        style={themed($filterScrollView)}
      >
      {/* Search Input */}
      <View style={themed($searchInputWrapper)}>
        <Icon icon="magnifyingGlass" size={16} color={theme.colors.textDim} />
        <TextField
          placeholder="Search..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={themed($searchInputContainer)}
          inputWrapperStyle={themed($searchInputField)}
          style={themed($searchInput)}
          RightAccessory={
            searchQuery
              ? (props) => (
                  <Pressable onPress={handleClearSearch}>
                    <Icon icon="x" size={14} color={theme.colors.textDim} />
                  </Pressable>
                )
              : undefined
          }
        />
      </View>

        {/* Category Filter */}
        <Pressable
          style={[
            themed($filterChip),
            selectedCategory && themed($filterChipActive),
          ]}
          onPress={() =>
            openSelectionSheet({
              title: "Category",
              options: [
                { value: null, label: "All Categories" },
                ...(categories?.map((c) => ({ value: c.slug, label: c.name })) ?? []),
              ],
              selectedValue: selectedCategory,
              onSelect: (value) => setSelectedCategory((value as string) ?? null),
            })
          }
        >
          <Text
            text={
              selectedCategory
                ? (categories?.find((c) => c.slug === selectedCategory)?.name ?? "Category")
                : "Category"
            }
            style={[
              themed($filterChipText),
              selectedCategory && themed($filterChipTextActive),
            ]}
            numberOfLines={1}
          />
          <Icon
            icon="caretRight"
            size={12}
            color={selectedCategory ? theme.colors.palette.neutral100 : theme.colors.textDim}
            style={{ transform: [{ rotate: "90deg" }] }}
          />
        </Pressable>

        {/* Advanced Search */}
        <Pressable style={themed($filterChip)} onPress={handleSearchPress}>
          <Text text="Advanced" style={themed($filterChipText)} numberOfLines={1} />
          <Icon icon="magnifyingGlass" size={14} color={theme.colors.textDim} />
        </Pressable>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Pressable style={themed($clearFiltersChip)} onPress={handleClearFilters}>
            <Icon icon="x" size={14} color={theme.colors.error} />
            <Text text="Clear" style={themed($clearFiltersText)} />
          </Pressable>
        )}
      </ScrollView>
    </View>
  )

  const renderHeader = () => (
    <View>
      <View style={themed($header)}>
        <Text text="Categories" preset="heading" />
      </View>
      {renderFilters()}
    </View>
  )

  const renderEmpty = () => {
    if (categories === undefined) {
      return (
        <View style={themed($emptyContainer)}>
          <ActivityIndicator size="large" color={theme.colors.tint} />
          <Text text="Loading categories..." style={themed($emptyText)} />
        </View>
      )
    }

    if (debouncedSearchQuery.trim() || selectedCategory) {
      return (
        <View style={themed($emptyContainer)}>
          <Icon icon="magnifyingGlass" size={48} color={theme.colors.textDim} />
          <Text text="No categories found" style={themed($emptyTitle)} />
          <Text
            text={
              debouncedSearchQuery.trim() && selectedCategory
                ? `No categories match "${debouncedSearchQuery}" in selected category`
                : debouncedSearchQuery.trim()
                  ? `No categories match "${debouncedSearchQuery}"`
                  : "No categories in selected filter"
            }
            style={themed($emptyText)}
          />
          <View style={themed($emptyActions)}>
            <Button text="Clear Filters" onPress={handleClearFilters} preset="default" />
            <Button
              text="Advanced Search"
              onPress={handleSearchPress}
              preset="filled"
              style={themed($emptyButton)}
            />
          </View>
        </View>
      )
    }

    return (
      <View style={themed($emptyContainer)}>
        <Icon icon="package" size={48} color={theme.colors.textDim} />
        <Text text="No categories available" style={themed($emptyTitle)} />
        <Text text="Check back later for new categories" style={themed($emptyText)} />
        <Button
          text="Browse All Listings"
          onPress={handleSearchPress}
          preset="filled"
          style={themed($emptyButton)}
        />
      </View>
    )
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <ScrollView
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        {renderHeader()}
        {filteredCategories.length === 0 ? (
          renderEmpty()
        ) : (
          <View style={themed($categoriesGrid)}>
            {filteredCategories.map((category) => renderCategory(category))}
          </View>
        )}
      </ScrollView>
      <SelectionSheet ref={selectionSheetRef} />
    </Screen>
  )
}

// Separate component to show listing count per category
function CategoryListingCount({ category }: { category: string }) {
  const { themed } = useAppTheme()
  const count = useQuery(api.categories.getListingCount, { category })

  if (count === undefined) {
    return <Text text="Loading..." style={themed($categoryCount)} />
  }

  return (
    <Text text={count === 1 ? "1 listing" : `${count} listings`} style={themed($categoryCount)} />
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.sm,
})

const $filterRowContainer: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

const $filterScrollView: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

const $filterRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.md,
  paddingRight: spacing.lg,
  gap: spacing.xs,
  alignItems: "center",
  flexDirection: "row",
})

const $searchInputWrapper: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: colors.palette.neutral300,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  minHeight: 36,
  gap: spacing.xxs,
  flexShrink: 0,
  width: 130,
})

const $searchInputContainer: ThemedStyle<ViewStyle> = () => ({
  marginBottom: 0,
  flex: 1,
})

const $searchInputField: ThemedStyle<ViewStyle> = () => ({
  borderWidth: 0,
  backgroundColor: "transparent",
  paddingHorizontal: 0,
  paddingVertical: 0,
  minHeight: 0,
})

const $searchInput: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginHorizontal: 0,
  fontSize: 13,
  paddingVertical: 0,
  paddingHorizontal: spacing.xxs,
})

const $filterChip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: 16,
  gap: spacing.xxs,
  minHeight: 36,
  flexShrink: 0,
})

const $filterChipActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
})

const $filterChipText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.text,
  fontWeight: "500",
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
  minHeight: 36,
  flexShrink: 0,
})

const $clearFiltersText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.error,
  fontWeight: "500",
})

const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.lg,
})

const $categoriesGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  paddingHorizontal: spacing.md,
  gap: spacing.sm,
  justifyContent: "space-between",
})

const $categoryCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: "48%",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
  padding: spacing.md,
  minHeight: 140,
  justifyContent: "center",
})

const $categoryCardPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
})

const $iconContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 56,
  height: 56,
  borderRadius: 28,
  backgroundColor: colors.palette.primary100,
  justifyContent: "center",
  alignItems: "center",
  marginBottom: spacing.sm,
})

const $categoryName: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 14,
  fontWeight: "600",
  color: colors.text,
  textAlign: "center",
  marginBottom: spacing.xs,
})

const $categoryCount: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 12,
  color: colors.textDim,
  textAlign: "center",
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xxxl,
  paddingHorizontal: spacing.lg,
  minHeight: 400,
})

const $emptyTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.text,
  fontSize: 18,
  fontWeight: "600",
  marginTop: spacing.md,
  marginBottom: spacing.xs,
})

const $emptyText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  fontSize: 14,
  textAlign: "center",
  marginBottom: spacing.lg,
})

const $emptyActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  width: "100%",
  justifyContent: "center",
})

const $emptyButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  maxWidth: 200,
})

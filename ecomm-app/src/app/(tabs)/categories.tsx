import { View, ViewStyle, TextStyle, FlatList, Pressable, ActivityIndicator } from "react-native"
import { router } from "expo-router"
import { useQuery } from "convex/react"

import { api } from "../../../convex/_generated/api"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Icon, IconTypes } from "@/components/Icon"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

// Icon mapping for categories (using Phosphor icons)
const CATEGORY_ICONS: Record<string, IconTypes> = {
  electronics: "desktop",
  textbooks: "book",
  furniture: "couch",
  clothing: "tShirt",
  "dorm-essentials": "bed",
  "sports-outdoors": "basketball",
  "tickets-events": "ticket",
  "free-stuff": "gift",
  services: "wrench",
  other: "dotsThreeCircle",
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

  // Fetch categories from Convex
  const categories = useQuery(api.categories.list)

  const handleCategoryPress = (slug: string) => {
    router.push(`/category/${slug}`)
  }

  const handleSearchPress = () => {
    router.push("/search")
  }

  const renderCategory = ({ item }: { item: Category }) => {
    const iconName = CATEGORY_ICONS[item.slug] ?? "dotsThreeCircle"

    return (
      <Pressable
        style={({ pressed }) => [themed($categoryCard), pressed && themed($categoryCardPressed)]}
        onPress={() => handleCategoryPress(item.slug)}
      >
        <View style={themed($iconContainer)}>
          <Icon icon={iconName} size={28} color={theme.colors.tint} />
        </View>
        <View style={themed($categoryContent)}>
          <Text text={item.name} style={themed($categoryName)} />
          <CategoryListingCount category={item.slug} />
        </View>
        <Icon icon="caretRight" size={20} color={theme.colors.textDim} />
      </Pressable>
    )
  }

  const renderHeader = () => (
    <View>
      <View style={themed($header)}>
        <Text text="Categories" preset="heading" />
      </View>

      {/* Search Button */}
      <Pressable style={themed($searchButton)} onPress={handleSearchPress}>
        <Icon icon="magnifyingGlass" size={20} color={theme.colors.textDim} />
        <Text text="Search all listings..." style={themed($searchButtonText)} />
      </Pressable>
    </View>
  )

  const renderEmpty = () => (
    <View style={themed($emptyContainer)}>
      {categories === undefined ? (
        <ActivityIndicator size="large" color={theme.colors.tint} />
      ) : (
        <>
          <Text text="📂" style={$emptyEmoji} />
          <Text text="No categories found" style={themed($emptyText)} />
        </>
      )}
    </View>
  )

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <FlatList
        data={categories ?? []}
        renderItem={renderCategory}
        keyExtractor={(item) => item._id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={themed($listContainer)}
        showsVerticalScrollIndicator={false}
      />
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
    <Text
      text={count === 1 ? "1 listing" : `${count} listings`}
      style={themed($categoryCount)}
    />
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

const $searchButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  marginHorizontal: spacing.md,
  marginBottom: spacing.md,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: colors.palette.neutral300,
  gap: spacing.sm,
})

const $searchButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.textDim,
  fontSize: 16,
})

const $listContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.lg,
})

const $categoryCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
  padding: spacing.md,
  marginBottom: spacing.sm,
})

const $categoryCardPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
})

const $iconContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: colors.palette.primary100,
  justifyContent: "center",
  alignItems: "center",
  marginRight: spacing.md,
})

const $categoryContent: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $categoryName: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.text,
})

const $categoryCount: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.textDim,
  marginTop: 2,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xxxl,
})

const $emptyEmoji: TextStyle = {
  fontSize: 48,
  marginBottom: 16,
}

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 16,
})

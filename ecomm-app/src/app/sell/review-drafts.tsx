import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  Pressable,
  ScrollView,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native"
import { router } from "expo-router"
import { useMutation, useQuery } from "convex/react"
import Carousel, { ICarouselInstance } from "react-native-reanimated-carousel"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { ActionSheet, type ActionSheetConfig, type ActionSheetRef } from "@/components/ActionSheet"
import { useAuth } from "@/context/AuthContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { showErrorToast, showSuccessToast } from "@/utils/toast"

type ListingCarouselItemProps = {
  listingId: Id<"listings">
  index: number
  total: number
  categories: { _id: Id<"categories">; name: string; slug: string }[]
  width: number
  isAuthenticated: boolean
  onRequireSignIn: () => void
  showSheet: (config: ActionSheetConfig) => void
  updateListing: ReturnType<typeof useMutation<typeof api.listings.update>>
  publishListing: ReturnType<typeof useMutation<typeof api.listings.publish>>
  onPublishSuccess: () => void
}

function ListingCarouselItem({
  listingId,
  index,
  total,
  categories,
  width,
  isAuthenticated,
  onRequireSignIn,
  showSheet,
  updateListing,
  publishListing,
  onPublishSuccess,
}: ListingCarouselItemProps) {
  const { themed, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const listing = useQuery(api.listings.getById, { id: listingId })
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("other")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    if (!listing || isInitialized) return
    setTitle(listing.title || "")
    setDescription(listing.description || "")
    setPrice(listing.price ? listing.price.toString() : "")
    setSelectedCategory(listing.category || "other")
    setIsInitialized(true)
  }, [isInitialized, listing])

  const imageUrl = listing?.imageUrls?.[0] || listing?.thumbnailUrl

  const ensureAuthenticated = () => {
    if (isAuthenticated) return true
    onRequireSignIn()
    return false
  }

  const handleSave = useCallback(async () => {
    if (!ensureAuthenticated()) return
    try {
      setIsSubmitting(true)
      await updateListing({
        id: listingId,
        title: title || undefined,
        description: description || undefined,
        price: price ? parseFloat(price) : undefined,
        category: selectedCategory,
      })
      showSuccessToast("Draft Updated", "Your changes have been saved.")
    } catch (error) {
      console.error("Error updating draft:", error)
      showErrorToast("Error", "Failed to update draft. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }, [ensureAuthenticated, listingId, price, selectedCategory, title, description, updateListing])

  const handlePublish = useCallback(async () => {
    if (!ensureAuthenticated()) return

    if (!title.trim()) {
      showSheet({
        title: "Missing Information",
        message: "Please enter a title for your listing.",
        actions: [{ text: "Got it", style: "primary" }],
      })
      return
    }
    if (!description.trim()) {
      showSheet({
        title: "Missing Information",
        message: "Please enter a description for your listing.",
        actions: [{ text: "Got it", style: "primary" }],
      })
      return
    }
    if (!price || parseFloat(price) <= 0) {
      showSheet({
        title: "Missing Information",
        message: "Please enter a valid price greater than $0.",
        actions: [{ text: "Got it", style: "primary" }],
      })
      return
    }

    try {
      setIsSubmitting(true)
      await updateListing({
        id: listingId,
        title,
        description,
        price: parseFloat(price),
        category: selectedCategory,
      })
      await publishListing({ id: listingId })
      showSuccessToast("Published", "Your listing is now live!")
      onPublishSuccess()
    } catch (error) {
      console.error("Error publishing listing:", error)
      showErrorToast("Error", "Failed to publish listing. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    description,
    ensureAuthenticated,
    listingId,
    price,
    publishListing,
    showSheet,
    selectedCategory,
    title,
    updateListing,
  ])

  if (!listing) {
    return (
      <View style={[themed($slide), { width }]}>
        <View style={themed($loadingContainer)}>
          <ActivityIndicator size="large" color={theme.colors.tint} />
          <Text text="Loading draft..." style={themed($loadingText)} />
        </View>
      </View>
    )
  }

  return (
    <View style={[themed($slide), { width }]}>
      <View style={themed($slideHeader)}>
        <Text text={`Draft ${index + 1} of ${total}`} style={themed($slideCounter)} />
      </View>

      <ScrollView
        style={themed($scroll)}
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        <View style={themed($imagePreviewContainer)}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={themed($imagePreview)} resizeMode="cover" />
          ) : (
            <View style={themed($imagePlaceholder)}>
              <Text text="📸" style={themed($imageIcon)} />
              <Text text="No image available" style={themed($imagePreviewText)} />
            </View>
          )}
        </View>

        <View style={themed($formContainer)}>
          <TextField
            label="Title"
            placeholder="What are you selling?"
            value={title}
            onChangeText={setTitle}
            containerStyle={themed($inputContainer)}
          />

          <TextField
            label="Description"
            placeholder="Add details to help buyers"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            containerStyle={themed($inputContainer)}
            inputWrapperStyle={themed($multilineInput)}
          />

          <TextField
            label="Price"
            placeholder="0.00"
            value={price}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9.]/g, "")
              setPrice(cleaned)
            }}
            keyboardType="decimal-pad"
            containerStyle={themed($inputContainer)}
            LeftAccessory={() => (
              <View style={themed($pricePrefix)}>
                <Text text="$" style={themed($pricePrefixText)} />
              </View>
            )}
          />

          <View style={themed($categorySection)}>
            <Text text="Category" style={themed($categoryLabel)} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={themed($categoryScroll)}
            >
              {categories.map((category) => (
                <Pressable
                  key={category._id}
                  style={[
                    themed($categoryPill),
                    selectedCategory === category.slug && themed($categoryPillSelected),
                  ]}
                  onPress={() => setSelectedCategory(category.slug)}
                >
                  <Text
                    text={category.name}
                    style={[
                      themed($categoryPillText),
                      selectedCategory === category.slug && themed($categoryPillTextSelected),
                    ]}
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </ScrollView>

      <View style={[themed($bottomActions), { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          text="Save Draft"
          preset="default"
          onPress={handleSave}
          disabled={isSubmitting}
          style={themed($draftButton)}
        />
        <Button
          text={isSubmitting ? "Publishing..." : "Publish"}
          preset="reversed"
          onPress={handlePublish}
          disabled={isSubmitting}
          style={themed($publishButton)}
        />
      </View>
    </View>
  )
}

export default function ReviewDraftListingsScreen() {
  const { themed, theme } = useAppTheme()
  const { isAuthenticated } = useAuth()
  const { width, height } = useWindowDimensions()
  const carouselRef = useRef<ICarouselInstance | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  // Track if user has published at least one listing (to know we should redirect when empty)
  const hasPublishedRef = useRef(false)
  const actionSheetRef = useRef<ActionSheetRef>(null)

  const showSheet = useCallback(
    (sheetConfig: ActionSheetConfig) => actionSheetRef.current?.present(sheetConfig),
    [],
  )

  // Live query for draft listings - updates in real-time as drafts are created/published
  const draftListings = useQuery(
    api.listings.listForUser,
    isAuthenticated ? { status: "draft" } : "skip",
  )

  // Extract listing IDs from the live query
  const listingIds = useMemo<Id<"listings">[]>(() => {
    if (!draftListings) return []
    return draftListings.map((listing) => listing._id)
  }, [draftListings])

  const categories = useQuery(api.categories.list) ?? []
  const updateListing = useMutation(api.listings.update)
  const publishListing = useMutation(api.listings.publish)

  // Clamp active index when drafts array changes (e.g., after publishing)
  useEffect(() => {
    if (listingIds.length === 0) return
    const clampedIndex = Math.min(activeIndex, listingIds.length - 1)
    if (clampedIndex !== activeIndex) {
      setActiveIndex(clampedIndex)
      carouselRef.current?.scrollTo({ index: clampedIndex, animated: true })
    }
  }, [listingIds.length, activeIndex])

  // Redirect to listings page when all drafts have been published
  useEffect(() => {
    // Only redirect if user has published at least one listing and drafts are now empty
    if (hasPublishedRef.current && draftListings && draftListings.length === 0) {
      router.replace("/me/listings")
    }
  }, [draftListings])

  const handleRequireSignIn = useCallback(() => {
    showSheet({
      title: "Sign In Required",
      message: "Please sign in to edit or publish.",
      actions: [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", style: "primary", onPress: () => router.push("/sign-in") },
      ],
    })
  }, [showSheet])

  const handleClose = () => {
    router.replace("/me/listings")
  }

  // Handle publish success - mark that user has published, carousel will auto-advance via live query
  const handlePublishSuccess = useCallback(() => {
    hasPublishedRef.current = true
    // The live query will automatically remove the published listing from draftListings
    // and the useEffect above will clamp the index appropriately
  }, [])

  const horizontalPeek = 16
  const cardWidth = Math.max(280, width - horizontalPeek * 2)
  const carouselHeight = Math.max(500, height - 180)

  // Loading state while query is pending
  if (draftListings === undefined) {
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
        <Header title="Review Drafts" leftIcon="x" onLeftPress={handleClose} />
        <View style={themed($loadingContainer)}>
          <ActivityIndicator size="large" color={theme.colors.tint} />
          <Text text="Loading drafts..." style={themed($loadingText)} />
        </View>
      </Screen>
    )
  }

  // Empty state - no drafts to review
  if (!listingIds.length) {
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
        <Header title="Review Drafts" leftIcon="x" onLeftPress={handleClose} />
        <View style={themed($emptyState)}>
          <Text text="No drafts to review" style={themed($emptyTitle)} />
          <Text text="Create a listing to review it here." style={themed($emptySubtitle)} />
          <Button text="View My Listings" onPress={() => router.replace("/me/listings")} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <Header title="Review Drafts" leftIcon="x" onLeftPress={handleClose} />

      <Carousel
        ref={carouselRef}
        data={listingIds}
        width={width}
        height={carouselHeight}
        pagingEnabled
        loop={false}
        snapEnabled
        mode="parallax"
        modeConfig={{
          parallaxScrollingScale: 0.88,
          parallaxScrollingOffset: 50,
          parallaxAdjacentItemScale: 0.9,
        }}
        onSnapToItem={setActiveIndex}
        withAnimation={{
          type: "spring",
          config: { damping: 32, stiffness: 350, mass: 0.8 },
        }}
        scrollAnimationDuration={400}
        renderItem={({ item, index }) => (
          <ListingCarouselItem
            listingId={item}
            index={index}
            total={listingIds.length}
            categories={categories}
            width={cardWidth}
            isAuthenticated={isAuthenticated}
            onRequireSignIn={handleRequireSignIn}
            showSheet={showSheet}
            updateListing={updateListing}
            publishListing={publishListing}
            onPublishSuccess={handlePublishSuccess}
          />
        )}
        style={themed($carouselStyle)}
      />

      <View style={themed($carouselIndicatorContainer)}>
        <Text
          text="Swipe to review each draft"
          style={themed($carouselIndicatorText)}
        />
      </View>
      <ActionSheet ref={actionSheetRef} />
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $carouselStyle: ThemedStyle<ViewStyle> = () => ({
  flexGrow: 1,
})

const $carouselIndicatorContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingVertical: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
  alignItems: "center",
  backgroundColor: colors.background,
})

const $carouselIndicatorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 12,
})

const $emptyState: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.lg,
})

const $emptyTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 18,
  fontWeight: "700",
  color: colors.text,
})

const $emptySubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 14,
  color: colors.textDim,
  textAlign: "center",
})

const $slide: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
})

const $slideHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.xs,
  alignItems: "center",
})

const $slideCounter: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 14,
  fontWeight: "600",
})

const $scroll: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.lg * 3,
})

const $imagePreviewContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingBottom: spacing.md,
})

const $imagePreview: ThemedStyle<ImageStyle> = ({ colors }) => ({
  height: 240,
  borderRadius: 12,
  backgroundColor: colors.palette.neutral800,
})

const $imagePlaceholder: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: 200,
  backgroundColor: colors.palette.neutral800,
  borderRadius: 12,
  justifyContent: "center",
  alignItems: "center",
  gap: spacing.sm,
})

const $imageIcon: ThemedStyle<TextStyle> = () => ({
  fontSize: 42,
  lineHeight: 50,
  includeFontPadding: false,
})

const $imagePreviewText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 15,
  fontWeight: "600",
})

const $formContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.sm,
  gap: spacing.md,
})

const $inputContainer: ThemedStyle<ViewStyle> = () => ({})

const $multilineInput: ThemedStyle<ViewStyle> = () => ({
  minHeight: 100,
  alignItems: "flex-start",
})

const $pricePrefix: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingLeft: spacing.sm,
  justifyContent: "center",
})

const $pricePrefixText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 16,
  fontWeight: "600",
})

const $categorySection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $categoryLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 14,
  fontWeight: "500",
  color: colors.text,
})

const $categoryScroll: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  paddingVertical: spacing.xs,
})

const $categoryPill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: 20,
  backgroundColor: colors.palette.neutral200,
  borderWidth: 1,
  borderColor: colors.palette.neutral400,
})

const $categoryPillSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
  borderColor: colors.tint,
})

const $categoryPillText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 14,
})

const $categoryPillTextSelected: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontWeight: "600",
})

const $bottomActions: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
  paddingHorizontal: spacing.md,
  paddingTop: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
  backgroundColor: colors.background,
})

const $draftButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $publishButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $loadingContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  gap: spacing.md,
})

const $loadingText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 16,
})

import { useState, useEffect } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  ImageStyle,
} from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAuth } from "@/context/AuthContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { showSuccessToast, showErrorToast } from "@/utils/toast"

/**
 * Sell Flow - Review Screen
 *
 * This screen handles both:
 * 1. AI-generated listings (loaded by listingId from Gemini flow)
 * 2. Video-based listings (legacy flow with videoUri)
 *
 * Users can edit the auto-generated metadata and publish when ready.
 */
export default function SellReviewScreen() {
  const { themed, theme } = useAppTheme()
  const { isAuthenticated } = useAuth()
  const params = useLocalSearchParams<{
    listingId?: string
    videoUri?: string
    thumbnailUri?: string
    source: string
    duration?: string
    detectedLabel?: string
  }>()

  // Form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("other")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  // If we have a listingId, load the existing listing
  const existingListing = useQuery(
    api.listings.getById,
    params.listingId ? { id: params.listingId as Id<"listings"> } : "skip",
  )

  // Queries and mutations
  const categories = useQuery(api.categories.list) ?? []
  const createFromDraft = useMutation(api.listings.createFromDraft)
  const updateListing = useMutation(api.listings.update)
  const publish = useMutation(api.listings.publish)

  // Initialize form with existing listing data or generate placeholder
  useEffect(() => {
    if (isInitialized) return

    if (params.listingId && existingListing) {
      // Load from existing listing (AI-generated)
      setTitle(existingListing.title || "")
      setDescription(existingListing.description || "")
      setPrice(existingListing.price?.toString() || "")
      setSelectedCategory(existingListing.category || "other")
      setIsInitialized(true)
    } else if (!params.listingId && params.source) {
      // Legacy flow - generate placeholder metadata
      generatePlaceholderMetadata()
      setIsInitialized(true)
    }
  }, [existingListing, params.listingId, params.source, isInitialized])

  /**
   * Generate placeholder metadata for legacy video flow
   */
  const generatePlaceholderMetadata = async () => {
    // Simulate AI processing delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    const placeholderData = {
      title: params.detectedLabel ? `Selling ${params.detectedLabel}` : "Item for Sale",
      description:
        "Great condition item available for pickup on campus. Feel free to message me with any questions!",
      suggestedPrice: "25",
      suggestedCategory: "other",
    }

    setTitle(placeholderData.title)
    setDescription(placeholderData.description)
    setPrice(placeholderData.suggestedPrice)
    setSelectedCategory(placeholderData.suggestedCategory)
  }

  const handleRetakeVideo = () => {
    router.back()
  }

  const handleSaveDraft = async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign In Required", "Please sign in to save drafts.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/sign-in") },
      ])
      return
    }

    try {
      setIsSubmitting(true)

      if (params.listingId) {
        // Update existing listing
        await updateListing({
          id: params.listingId as Id<"listings">,
          title: title || undefined,
          description: description || undefined,
          price: price ? parseFloat(price) : undefined,
          category: selectedCategory,
        })
        showSuccessToast("Draft Updated", "Your changes have been saved.")
      } else {
        // Create new draft
        await createFromDraft({
          videoUrl: params.videoUri,
          thumbnailUrl: params.thumbnailUri,
          title: title || undefined,
          description: description || undefined,
          price: price ? parseFloat(price) : undefined,
          category: selectedCategory,
          processingStatus: "completed",
        })
        showSuccessToast("Draft Saved", "Your listing has been saved as a draft.")
      }

      router.replace("/(tabs)/me")
    } catch (error) {
      console.error("Error saving draft:", error)
      showErrorToast("Error", "Failed to save draft. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePublish = async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign In Required", "Please sign in to publish listings.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/sign-in") },
      ])
      return
    }

    // Validate required fields
    if (!title.trim()) {
      Alert.alert("Missing Information", "Please enter a title for your listing.")
      return
    }
    if (!description.trim()) {
      Alert.alert("Missing Information", "Please enter a description for your listing.")
      return
    }
    if (!price || parseFloat(price) <= 0) {
      Alert.alert("Missing Information", "Please enter a valid price greater than $0.")
      return
    }

    try {
      setIsSubmitting(true)

      let listingId: Id<"listings">

      if (params.listingId) {
        // Update existing listing and publish
        listingId = params.listingId as Id<"listings">
        await updateListing({
          id: listingId,
          title,
          description,
          price: parseFloat(price),
          category: selectedCategory,
        })
      } else {
        // Create new listing as draft
        listingId = await createFromDraft({
          videoUrl: params.videoUri,
          thumbnailUrl: params.thumbnailUri,
          title,
          description,
          price: parseFloat(price),
          category: selectedCategory,
          processingStatus: "completed",
        })
      }

      // Publish the listing
      await publish({ id: listingId })

      showSuccessToast("Success!", "Your listing is now live!")

      Alert.alert("Success! 🎉", "Your listing is now live!", [
        {
          text: "View Listing",
          onPress: () => router.replace(`/listing/${listingId}`),
        },
        {
          text: "Go Home",
          onPress: () => router.replace("/(tabs)"),
        },
      ])
    } catch (error) {
      console.error("Error publishing listing:", error)
      showErrorToast("Error", "Failed to publish listing. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    Alert.alert("Discard Listing?", "Your changes will be lost.", [
      { text: "Keep Editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => router.replace("/(tabs)"),
      },
    ])
  }

  // Show loading while fetching existing listing
  if (params.listingId && !existingListing && !isInitialized) {
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
        <Header title="Review Listing" containerStyle={themed($header)} />
        <View style={themed($loadingContainer)}>
          <ActivityIndicator size="large" color={theme.colors.tint} />
          <Text text="Loading listing..." style={themed($loadingText)} />
        </View>
      </Screen>
    )
  }

  // Get image URL for preview
  const imageUrl = existingListing?.imageUrls?.[0] || existingListing?.thumbnailUrl

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <Header
        title="Review Listing"
        leftIcon="x"
        onLeftPress={handleClose}
        rightText={params.source === "gemini-live" ? undefined : "Retake"}
        onRightPress={params.source === "gemini-live" ? undefined : handleRetakeVideo}
        containerStyle={themed($header)}
      />

      <ScrollView
        style={themed($scrollView)}
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        {/* Image Preview */}
        <View style={themed($imagePreviewContainer)}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={themed($imagePreview)} resizeMode="cover" />
          ) : (
            <View style={themed($imagePlaceholder)}>
              <Text text="📸" style={themed($imageIcon)} />
              <Text text="Image Preview" style={themed($imagePreviewText)} />
              <Text
                text={params.source === "gemini-live" ? "AI-generated photo" : "From camera"}
                style={themed($imageSourceText)}
              />
            </View>
          )}
        </View>

        {/* AI Badge for Gemini-generated listings */}
        {params.source === "gemini-live" && (
          <View style={themed($aiBadgeContainer)}>
            <Text text="✨ AI-generated listing" style={themed($aiBadgeText)} />
            <Text text="Review and edit before publishing" style={themed($aiBadgeSubtext)} />
          </View>
        )}

        {/* Form Fields */}
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
            placeholder="Describe your item, condition, and any details buyers should know..."
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

          {/* Category Selection */}
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

      {/* Bottom Actions */}
      <View style={themed($bottomActions)}>
        <Button
          text="Save Draft"
          preset="default"
          onPress={handleSaveDraft}
          disabled={isSubmitting}
          style={themed($draftButton)}
        />
        <Button
          text={isSubmitting ? "Publishing..." : "Publish Listing"}
          preset="reversed"
          onPress={handlePublish}
          disabled={isSubmitting}
          style={themed($publishButton)}
        />
      </View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $header: ThemedStyle<ViewStyle> = () => ({})

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

const $scrollView: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.xl,
})

const $imagePreviewContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
})

const $imagePreview: ThemedStyle<ImageStyle> = ({ colors }) => ({
  height: 250,
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
  fontSize: 48,
})

const $imagePreviewText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 16,
  fontWeight: "600",
})

const $imageSourceText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral500,
  fontSize: 13,
})

const $aiBadgeContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs,
  paddingVertical: spacing.md,
  marginHorizontal: spacing.md,
  marginTop: spacing.sm,
  backgroundColor: colors.palette.primary100,
  borderRadius: 8,
})

const $aiBadgeText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  fontSize: 14,
  fontWeight: "600",
})

const $aiBadgeSubtext: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 12,
})

const $formContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingTop: spacing.lg,
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
  paddingVertical: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
  backgroundColor: colors.background,
})

const $draftButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $publishButton: ThemedStyle<ViewStyle> = () => ({
  flex: 2,
})

import { useState, useEffect } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { api } from "@/../convex/_generated/api"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Header } from "@/components/Header"
import { Button } from "@/components/Button"
import { TextField } from "@/components/TextField"
import { useAppTheme } from "@/theme/context"
import { useAuth } from "@/context/AuthContext"
import type { ThemedStyle } from "@/theme/types"

type Category = {
  _id: string
  name: string
  slug: string
}

/**
 * Sell Flow - Review Screen
 *
 * After capturing/selecting a video, users land here to:
 * 1. Preview the video thumbnail
 * 2. Edit auto-generated (or placeholder) metadata
 * 3. Set price and category
 * 4. Publish the listing
 *
 * The AI integration hook is stubbed - in production, this would call
 * an AI service to analyze the video and pre-fill the fields.
 */
export default function SellReviewScreen() {
  const { themed, theme } = useAppTheme()
  const { isAuthenticated, userId } = useAuth()
  const params = useLocalSearchParams<{
    videoUri: string
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
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false)

  // Queries and mutations
  const categories = useQuery(api.categories.list) ?? []
  const createFromDraft = useMutation(api.listings.createFromDraft)
  const publish = useMutation(api.listings.publish)

  // Simulate AI metadata generation on mount
  useEffect(() => {
    generateAIMetadata()
  }, [])

  /**
   * Stubbed AI metadata generation
   * In production, this would call listings.generateMetadataFromVideo
   * to analyze the video and return suggested title, description, price, and category
   */
  const generateAIMetadata = async () => {
    setIsGeneratingMetadata(true)

    // Simulate AI processing delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Generate placeholder metadata
    // In production, this would come from AI analysis
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
    setIsGeneratingMetadata(false)
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

      const listingId = await createFromDraft({
        videoUrl: params.videoUri,
        thumbnailUrl: params.thumbnailUri,
        title: title || undefined,
        description: description || undefined,
        price: price ? parseFloat(price) : undefined,
        category: selectedCategory,
        processingStatus: "completed",
      })

      Alert.alert("Draft Saved", "Your listing has been saved as a draft.", [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/me"),
        },
      ])
    } catch (error) {
      console.error("Error saving draft:", error)
      Alert.alert("Error", "Failed to save draft. Please try again.")
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

      // Create the listing as a draft first
      const listingId = await createFromDraft({
        videoUrl: params.videoUri,
        thumbnailUrl: params.thumbnailUri,
        title,
        description,
        price: parseFloat(price),
        category: selectedCategory,
        processingStatus: "completed",
      })

      // Then publish it
      await publish({ id: listingId })

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
      Alert.alert("Error", "Failed to publish listing. Please try again.")
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

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <Header
        title="Review Listing"
        leftIcon="x"
        onLeftPress={handleClose}
        rightText="Retake"
        onRightPress={handleRetakeVideo}
        containerStyle={themed($header)}
      />

      <ScrollView
        style={themed($scrollView)}
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        {/* Video Preview */}
        <View style={themed($videoPreviewContainer)}>
          <View style={themed($videoPreview)}>
            <Text text="📹" style={themed($videoIcon)} />
            <Text text="Video Preview" style={themed($videoPreviewText)} />
            <Text
              text={params.source === "camera" ? "Recorded video" : "Selected from gallery"}
              style={themed($videoSourceText)}
            />
          </View>
        </View>

        {/* AI Generation Status */}
        {isGeneratingMetadata && (
          <View style={themed($aiStatusContainer)}>
            <ActivityIndicator size="small" color={theme.colors.tint} />
            <Text text="✨ Analyzing video..." style={themed($aiStatusText)} />
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
              // Only allow numbers and decimals
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
          disabled={isSubmitting || isGeneratingMetadata}
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

const $scrollView: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.xl,
})

const $videoPreviewContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
})

const $videoPreview: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: 200,
  backgroundColor: colors.palette.neutral800,
  borderRadius: 12,
  justifyContent: "center",
  alignItems: "center",
  gap: spacing.sm,
})

const $videoIcon: ThemedStyle<TextStyle> = () => ({
  fontSize: 48,
})

const $videoPreviewText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 16,
  fontWeight: "600",
})

const $videoSourceText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral500,
  fontSize: 13,
})

const $aiStatusContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.sm,
  paddingVertical: spacing.md,
  marginHorizontal: spacing.md,
  marginTop: spacing.sm,
  backgroundColor: colors.palette.neutral200,
  borderRadius: 8,
})

const $aiStatusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 14,
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

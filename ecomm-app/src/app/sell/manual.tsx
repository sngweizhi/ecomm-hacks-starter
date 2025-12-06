import { useState, useCallback, useRef } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  ScrollView,
  Pressable,
  Image,
  ImageStyle,
  ActivityIndicator,
} from "react-native"
import * as ImagePicker from "expo-image-picker"
import * as FileSystem from "expo-file-system/legacy"
import { router } from "expo-router"
import { useMutation, useQuery, useAction } from "convex/react"
import { X, Plus, Trash, Camera } from "phosphor-react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { api } from "@/../convex/_generated/api"
import type { Id } from "@/../convex/_generated/dataModel"

import { Button } from "@/components/Button"
import { Spinner } from "@/components/Spinner"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { ActionSheet, type ActionSheetRef, type ActionSheetConfig } from "@/components/ActionSheet"
import { MultiPhotoCamera } from "@/components/MultiPhotoCamera"
import { useAuth } from "@/context/AuthContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { showSuccessToast, showErrorToast } from "@/utils/toast"

const MAX_PHOTOS = 9

type Photo = {
  uri: string
  id: string
}

/**
 * Manual Listing Entry Screen
 *
 * Allows users to manually enter listing details and upload multiple photos.
 * Photos are then sent to Gemini to generate a 3x3 collage.
 */
export default function ManualListingScreen() {
  const { themed, theme } = useAppTheme()
  const { isAuthenticated } = useAuth()
  const actionSheetRef = useRef<ActionSheetRef>(null)
  const insets = useSafeAreaInsets()

  // Form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("other")
  const [condition, setCondition] = useState<string>("good")
  const [photos, setPhotos] = useState<Photo[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isAnalyzingPhotos, setIsAnalyzingPhotos] = useState(false)

  // Queries and mutations
  const categories = useQuery(api.categories.list) ?? []
  const createManualListing = useAction(api.listings.createManualListing)
  const analyzeProductPhotos = useAction(api.analyzeProductPhotos.analyzeProductPhotos)

  const showSheet = useCallback(
    (sheetConfig: ActionSheetConfig) => actionSheetRef.current?.present(sheetConfig),
    [],
  )

  const handlePickPhotos = () => {
    const remainingSlots = MAX_PHOTOS - photos.length
    if (remainingSlots <= 0) {
      showSheet({
        title: "Maximum Photos Reached",
        message: `You can upload up to ${MAX_PHOTOS} photos.`,
        actions: [{ text: "OK", style: "primary" }],
      })
      return
    }

    showSheet({
      title: "Add Photo",
      message: "Choose how you want to add a photo",
      actions: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Take Photo",
          style: "default",
          onPress: handleTakePhoto,
        },
        {
          text: "Choose from Gallery",
          style: "default",
          onPress: handlePickFromGallery,
        },
      ],
    })
  }

  const handleTakePhoto = () => {
    const remainingSlots = MAX_PHOTOS - photos.length
    if (remainingSlots <= 0) {
      showSheet({
        title: "Maximum Photos Reached",
        message: `You can upload up to ${MAX_PHOTOS} photos.`,
        actions: [{ text: "OK", style: "primary" }],
      })
      return
    }
    setIsCameraOpen(true)
  }

  const handleCameraDone = async (capturedPhotos: Photo[]) => {
    const remainingSlots = MAX_PHOTOS - photos.length
    const photosToAdd = capturedPhotos.slice(0, remainingSlots)
    setPhotos((prev) => [...prev, ...photosToAdd])
    setIsCameraOpen(false)

    // Analyze photos and auto-fill form
    if (photosToAdd.length > 0) {
      setIsAnalyzingPhotos(true)
      try {
        // Convert photos to base64
        const photoBase64s: string[] = []
        for (const photo of photosToAdd) {
          try {
            const base64 = await FileSystem.readAsStringAsync(photo.uri, {
              encoding: FileSystem.EncodingType.Base64,
            })
            photoBase64s.push(base64)
          } catch (error) {
            console.error("Error converting photo to base64:", error)
          }
        }

        if (photoBase64s.length > 0) {
          const result = await analyzeProductPhotos({
            photos: photoBase64s,
          })

          if (result.success && result.listingDetails) {
            const details = result.listingDetails
            // Auto-fill form fields
            if (details.title && !title) {
              setTitle(details.title)
            }
            if (details.description && !description) {
              setDescription(details.description)
            }
            if (details.price > 0 && !price) {
              setPrice(details.price.toString())
            }
            if (details.condition && condition === "good") {
              // Only update if still default
              setCondition(details.condition)
            }
            if (details.category && selectedCategory === "other") {
              // Only update if still default
              setSelectedCategory(details.category)
            }
            showSuccessToast("Success!", "Listing details generated from photos!")
          } else {
            console.warn("Photo analysis failed:", result.error)
            showErrorToast("Analysis Failed", result.error || "Could not analyze photos")
          }
        }
      } catch (error) {
        console.error("Error analyzing photos:", error)
        showErrorToast("Error", "Failed to analyze photos. Please fill in details manually.")
      } finally {
        setIsAnalyzingPhotos(false)
      }
    }
  }

  const handleCameraClose = () => {
    setIsCameraOpen(false)
  }

  const handlePickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== "granted") {
        showSheet({
          title: "Permission Required",
          message: "Please grant photo library access to upload photos.",
          actions: [{ text: "OK", style: "primary" }],
        })
        return
      }

      const remainingSlots = MAX_PHOTOS - photos.length
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: remainingSlots,
      })

      if (!result.canceled && result.assets.length > 0) {
        const newPhotos: Photo[] = result.assets.map((asset, index) => ({
          uri: asset.uri,
          id: `${Date.now()}-gallery-${index}`,
        }))
        setPhotos((prev) => [...prev, ...newPhotos])
      }
    } catch (error) {
      console.error("Error picking photos:", error)
      showErrorToast("Error", "Failed to pick photos. Please try again.")
    }
  }

  const handleRemovePhoto = (photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId))
  }

  const handleClose = () => {
    if (title || description || price || photos.length > 0) {
      showSheet({
        title: "Discard Listing?",
        message: "Your changes will be lost.",
        actions: [
          { text: "Keep Editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => router.back() },
        ],
      })
    } else {
      router.back()
    }
  }

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      showSheet({
        title: "Sign In Required",
        message: "Please sign in to create a listing.",
        actions: [
          { text: "Cancel", style: "cancel" },
          { text: "Sign In", style: "primary", onPress: () => router.push("/sign-in") },
        ],
      })
      return
    }

    // Validate required fields
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
    if (photos.length === 0) {
      showSheet({
        title: "Missing Photos",
        message: "Please upload at least one photo for your listing.",
        actions: [{ text: "Got it", style: "primary" }],
      })
      return
    }

    try {
      setIsSubmitting(true)

      // Convert photos to base64
      const photoBase64s: string[] = []
      for (const photo of photos) {
        try {
          const base64 = await FileSystem.readAsStringAsync(photo.uri, {
            encoding: FileSystem.EncodingType.Base64,
          })
          photoBase64s.push(base64)
        } catch (error) {
          console.error("Error converting photo to base64:", error)
          throw new Error(`Failed to process photo: ${error}`)
        }
      }

      const result = await createManualListing({
        title: title.trim(),
        description: description.trim(),
        price: parseFloat(price),
        category: selectedCategory,
        condition: condition as "new" | "like_new" | "good" | "fair" | "poor",
        photos: photoBase64s,
      })

      if (result.success && result.listingId) {
        showSuccessToast("Success!", "Listing created! AI collage processing in background...")
        // Navigate to home feed so user can see their listing immediately
        router.replace("/(tabs)")
      } else {
        throw new Error(result.error || "Failed to create listing")
      }
    } catch (error) {
      console.error("Error creating manual listing:", error)
      showErrorToast("Error", "Failed to create listing. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <Header
        title="Manual Listing"
        leftIcon="x"
        onLeftPress={handleClose}
        containerStyle={themed($header)}
      />

      <ScrollView
        style={themed($scrollView)}
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo Upload Section */}
        <View style={themed($photoSection)}>
          <View style={themed($photoSectionHeader)}>
            <View>
              <Text text="Photos" style={themed($sectionTitle)} />
              <Text
                text={`Upload up to ${MAX_PHOTOS} photos (${photos.length}/${MAX_PHOTOS})`}
                style={themed($sectionSubtitle)}
              />
            </View>
            {isAnalyzingPhotos && (
              <View style={themed($analyzingIndicator)}>
                <Spinner size={16} />
                <Text text="Analyzing..." style={themed($analyzingText)} />
              </View>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={themed($photoScroll)}
          >
            {photos.map((photo) => (
              <View key={photo.id} style={themed($photoContainer)}>
                <Image source={{ uri: photo.uri }} style={themed($photoPreview)} />
                <Pressable
                  style={themed($removePhotoButton)}
                  onPress={() => handleRemovePhoto(photo.id)}
                >
                  <Trash size={16} color={theme.colors.palette.neutral100} weight="fill" />
                </Pressable>
              </View>
            ))}

            {photos.length < MAX_PHOTOS && (
              <Pressable
                style={({ pressed }) => [
                  themed($addPhotoButton),
                  pressed && { opacity: 0.7 },
                ]}
                onPress={handlePickPhotos}
              >
                <Plus size={32} color={theme.colors.palette.neutral500} weight="bold" />
                <Text text="Add Photo" style={themed($addPhotoText)} />
              </Pressable>
            )}
          </ScrollView>

          {/* Quick action buttons for camera and gallery */}
          {photos.length < MAX_PHOTOS && (
            <View style={themed($quickActions)}>
              <Pressable
                style={({ pressed }) => [
                  themed($quickActionButton),
                  pressed && { opacity: 0.7 },
                ]}
                onPress={handleTakePhoto}
              >
                <Camera size={20} color={theme.colors.tint} weight="fill" />
                <Text text="Camera" style={themed($quickActionText)} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  themed($quickActionButton),
                  pressed && { opacity: 0.7 },
                ]}
                onPress={handlePickFromGallery}
              >
                <Plus size={20} color={theme.colors.tint} weight="fill" />
                <Text text="Gallery" style={themed($quickActionText)} />
              </Pressable>
            </View>
          )}
        </View>

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

          {/* Condition Selection */}
          <View style={themed($categorySection)}>
            <Text text="Condition" style={themed($categoryLabel)} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={themed($categoryScroll)}
            >
              {[
                { value: "new", label: "New" },
                { value: "like_new", label: "Like New" },
                { value: "good", label: "Good" },
                { value: "fair", label: "Fair" },
                { value: "poor", label: "Poor" },
              ].map((cond) => (
                <Pressable
                  key={cond.value}
                  style={[
                    themed($categoryPill),
                    condition === cond.value && themed($categoryPillSelected),
                  ]}
                  onPress={() => setCondition(cond.value)}
                >
                  <Text
                    text={cond.label}
                    style={[
                      themed($categoryPillText),
                      condition === cond.value && themed($categoryPillTextSelected),
                    ]}
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={[themed($bottomActions), { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          text={isSubmitting ? "Creating..." : "Create Listing"}
          preset="reversed"
          onPress={handleSubmit}
          disabled={isSubmitting}
          style={themed($submitButton)}
        />
      </View>
      <ActionSheet ref={actionSheetRef} />
      <MultiPhotoCamera
        visible={isCameraOpen}
        maxPhotos={MAX_PHOTOS - photos.length}
        onClose={handleCameraClose}
        onDone={handleCameraDone}
      />
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

const $photoSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingTop: spacing.md,
  gap: spacing.xs,
})

const $photoSectionHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
})

const $analyzingIndicator: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $analyzingText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 12,
  color: colors.tint,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.text,
})

const $sectionSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.textDim,
})

const $photoScroll: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  paddingVertical: spacing.sm,
})

const $photoContainer: ThemedStyle<ViewStyle> = () => ({
  position: "relative",
})

const $photoPreview: ThemedStyle<ImageStyle> = ({ colors }) => ({
  width: 120,
  height: 120,
  borderRadius: 12,
  backgroundColor: colors.palette.neutral800,
})

const $removePhotoButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  position: "absolute",
  top: 4,
  right: 4,
  width: 24,
  height: 24,
  borderRadius: 12,
  backgroundColor: colors.error,
  justifyContent: "center",
  alignItems: "center",
  padding: spacing.xxs,
})

const $addPhotoButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 120,
  height: 120,
  borderRadius: 12,
  borderWidth: 2,
  borderColor: colors.palette.neutral400,
  borderStyle: "dashed",
  backgroundColor: colors.palette.neutral200,
  justifyContent: "center",
  alignItems: "center",
  gap: spacing.xs,
})

const $addPhotoText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 12,
  color: colors.textDim,
})

const $quickActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  marginTop: spacing.xs,
})

const $quickActionButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  borderRadius: 8,
  backgroundColor: colors.palette.neutral200,
  borderWidth: 1,
  borderColor: colors.palette.neutral400,
})

const $quickActionText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 14,
  fontWeight: "500",
  color: colors.tint,
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
  paddingHorizontal: spacing.md,
  paddingTop: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
  backgroundColor: colors.background,
})

const $submitButton: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

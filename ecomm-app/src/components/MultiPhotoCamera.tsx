import { useCallback, useEffect, useRef, useState } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  Modal,
  Pressable,
  Image,
  ImageStyle,
  ActivityIndicator,
  ScrollView,
} from "react-native"
import * as FileSystem from "expo-file-system/legacy"
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera"
import { X, Check } from "phosphor-react-native"

import { Text } from "@/components/Text"
import { Button } from "@/components/Button"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type Photo = {
  uri: string
  id: string
}

type MultiPhotoCameraProps = {
  visible: boolean
  maxPhotos?: number
  onClose: () => void
  onDone: (photos: Photo[]) => void
}

/**
 * Multi-photo camera component that allows users to capture multiple photos
 * in one session without closing the camera between shots.
 */
export function MultiPhotoCamera({
  visible,
  maxPhotos = 9,
  onClose,
  onDone,
}: MultiPhotoCameraProps) {
  const { themed, theme } = useAppTheme()
  const cameraRef = useRef<Camera>(null)
  const [capturedPhotos, setCapturedPhotos] = useState<Photo[]>([])
  const [isCapturing, setIsCapturing] = useState(false)

  const device = useCameraDevice("back")
  const { hasPermission, requestPermission } = useCameraPermission()

  // Request permission when modal opens
  useEffect(() => {
    if (visible && !hasPermission) {
      requestPermission()
    }
  }, [visible, hasPermission, requestPermission])

  // Reset photos when modal closes
  useEffect(() => {
    if (!visible) {
      setCapturedPhotos([])
    }
  }, [visible])

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing || capturedPhotos.length >= maxPhotos) {
      return
    }

    setIsCapturing(true)
    try {
      let snapshot
      try {
        // Try takeSnapshot() first - it captures from the preview buffer
        snapshot = await cameraRef.current.takeSnapshot({
          quality: 80,
        })
      } catch (snapshotError: any) {
        // Fallback to takePhoto() if takeSnapshot fails
        console.warn("[MultiPhotoCamera] takeSnapshot failed, falling back to takePhoto:", snapshotError?.message)
        const photo = await cameraRef.current.takePhoto({
          flash: "off",
        })
        snapshot = photo
      }

      const path = snapshot.path.startsWith("file://") ? snapshot.path : `file://${snapshot.path}`
      
      const newPhoto: Photo = {
        uri: path,
        id: `photo-${Date.now()}-${capturedPhotos.length}`,
      }

      setCapturedPhotos((prev) => [...prev, newPhoto])
    } catch (error) {
      console.error("[MultiPhotoCamera] Capture error:", error)
    } finally {
      setIsCapturing(false)
    }
  }, [cameraRef, isCapturing, capturedPhotos.length, maxPhotos])

  const handleRemovePhoto = useCallback((photoId: string) => {
    setCapturedPhotos((prev) => prev.filter((p) => p.id !== photoId))
  }, [])

  const handleDone = useCallback(() => {
    if (capturedPhotos.length > 0) {
      onDone(capturedPhotos)
    }
    setCapturedPhotos([])
  }, [capturedPhotos, onDone])

  const handleCancel = useCallback(() => {
    setCapturedPhotos([])
    onClose()
  }, [onClose])

  if (!visible) {
    return null
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <View style={themed($container)}>
        {/* Header */}
        <View style={themed($header)}>
          <Pressable onPress={handleCancel} style={themed($closeButton)}>
            <X size={24} color={theme.colors.palette.neutral100} weight="bold" />
          </Pressable>
          <Text text={`${capturedPhotos.length}/${maxPhotos}`} style={themed($headerText)} />
          <View style={themed($headerSpacer)} />
        </View>

        {/* Camera View */}
        {device && hasPermission ? (
          <View style={themed($cameraContainer)}>
            <Camera
              ref={cameraRef}
              style={themed($camera)}
              device={device}
              isActive={visible}
              photo={true}
            />
          </View>
        ) : (
          <View style={themed($cameraPlaceholder)}>
            {!hasPermission ? (
              <>
                <Text text="Camera permission required" style={themed($placeholderText)} />
                <Button text="Grant Permission" onPress={requestPermission} preset="reversed" />
              </>
            ) : (
              <Text text="Camera not available" style={themed($placeholderText)} />
            )}
          </View>
        )}

        {/* Captured Photos Preview */}
        {capturedPhotos.length > 0 && (
          <View style={themed($previewContainer)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={themed($previewScroll)}
            >
              {capturedPhotos.map((photo, index) => (
                <View key={photo.id} style={themed($previewItem)}>
                  <Image source={{ uri: photo.uri }} style={themed($previewImage)} />
                  <Pressable
                    style={themed($removePreviewButton)}
                    onPress={() => handleRemovePhoto(photo.id)}
                  >
                    <X size={14} color={theme.colors.palette.neutral100} weight="bold" />
                  </Pressable>
                  <View style={themed($previewNumber)}>
                    <Text text={`${index + 1}`} style={themed($previewNumberText)} />
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Bottom Controls */}
        <View style={themed($controls)}>
          {capturedPhotos.length > 0 && (
            <Button
              text="Done"
              preset="reversed"
              onPress={handleDone}
              style={themed($doneButton)}
            />
          )}
          <View style={themed($captureControls)}>
            <Pressable
              style={({ pressed }) => [
                themed($captureButton),
                pressed && { opacity: 0.8 },
                capturedPhotos.length >= maxPhotos && themed($captureButtonDisabled),
              ]}
              onPress={handleCapture}
              disabled={isCapturing || capturedPhotos.length >= maxPhotos || !hasPermission}
            >
              {isCapturing ? (
                <ActivityIndicator color={theme.colors.palette.neutral100} />
              ) : (
                <View style={themed($captureButtonInner)} />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.palette.neutral900,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: spacing.md,
  paddingTop: spacing.lg,
  paddingBottom: spacing.sm,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  zIndex: 10,
})

const $closeButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  justifyContent: "center",
  alignItems: "center",
})

const $headerText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.palette.neutral100,
})

const $headerSpacer: ThemedStyle<ViewStyle> = () => ({
  width: 40,
})

const $cameraContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  overflow: "hidden",
})

const $camera: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $cameraPlaceholder: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: colors.palette.neutral800,
  gap: spacing.md,
})

const $placeholderText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  color: colors.palette.neutral400,
  textAlign: "center",
})

const $previewContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: 100,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  paddingVertical: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: colors.palette.neutral700,
})

const $previewScroll: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  gap: spacing.sm,
})

const $previewItem: ThemedStyle<ViewStyle> = () => ({
  position: "relative",
})

const $previewImage: ThemedStyle<ImageStyle> = () => ({
  width: 80,
  height: 80,
  borderRadius: 8,
})

const $removePreviewButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: -4,
  right: -4,
  width: 24,
  height: 24,
  borderRadius: 12,
  backgroundColor: colors.error,
  justifyContent: "center",
  alignItems: "center",
})

const $previewNumber: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  bottom: 4,
  left: 4,
  width: 20,
  height: 20,
  borderRadius: 10,
  backgroundColor: colors.tint,
  justifyContent: "center",
  alignItems: "center",
})

const $previewNumberText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 10,
  fontWeight: "600",
  color: colors.palette.neutral100,
})

const $controls: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.lg,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  gap: spacing.md,
})

const $doneButton: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

const $captureControls: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
})

const $captureButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 72,
  height: 72,
  borderRadius: 36,
  backgroundColor: colors.palette.neutral100,
  justifyContent: "center",
  alignItems: "center",
  borderWidth: 4,
  borderColor: colors.palette.neutral300,
})

const $captureButtonDisabled: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral500,
  borderColor: colors.palette.neutral600,
})

const $captureButtonInner: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 56,
  height: 56,
  borderRadius: 28,
  backgroundColor: colors.palette.neutral900,
})


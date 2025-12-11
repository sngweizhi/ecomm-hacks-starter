import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  Pressable,
  View,
  ViewStyle,
  TextStyle,
  StyleSheet,
  ActivityIndicator,
  Text as RNText,
} from "react-native"
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
} from "@gorhom/bottom-sheet"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export type ActionSheetActionStyle = "default" | "destructive" | "cancel" | "primary"

export interface ActionSheetAction {
  text: string
  onPress?: () => void | Promise<void>
  style?: ActionSheetActionStyle
  loading?: boolean
}

export interface ActionSheetConfig {
  title?: string
  message?: string
  actions: ActionSheetAction[]
}

export interface ActionSheetRef {
  present: (config: ActionSheetConfig) => void
  dismiss: () => void
  isPresenting: () => boolean
}

export const ActionSheet = forwardRef<ActionSheetRef>(function ActionSheet(_, ref) {
  const bottomSheetRef = useRef<BottomSheetModal>(null)
  const isPresentingRef = useRef(false)
  const isAnimatingRef = useRef(false)
  const { themed, theme } = useAppTheme()
  const insets = useSafeAreaInsets()

  const [config, setConfig] = useState<ActionSheetConfig | null>(null)

  const styles = useMemo(
    () => ({
      container: themed($container),
      handleIndicator: themed($handleIndicator),
      header: themed($header),
      title: themed($title),
      message: themed($message),
      action: themed($action),
      actionDestructive: themed($actionDestructive),
      actionPrimary: themed($actionPrimary),
      actionCancel: themed($actionCancel),
      actionText: themed($actionText),
      actionTextDestructive: themed($actionTextDestructive),
      actionTextPrimary: themed($actionTextPrimary),
      actionTextCancel: themed($actionTextCancel),
      separator: themed($separator),
    }),
    [themed],
  )

  const present = useCallback((nextConfig: ActionSheetConfig) => {
    setConfig(nextConfig)
    isPresentingRef.current = true
    isAnimatingRef.current = true
    bottomSheetRef.current?.present()
  }, [])

  const dismiss = useCallback(() => {
    isPresentingRef.current = false
    isAnimatingRef.current = false
    bottomSheetRef.current?.dismiss()
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      present,
      dismiss,
      isPresenting: () => isPresentingRef.current || isAnimatingRef.current,
    }),
    [dismiss, present],
  )

  const handleDismiss = useCallback(() => {
    isPresentingRef.current = false
    isAnimatingRef.current = false
  }, [])

  const handleAnimate = useCallback((_: number, toIndex: number) => {
    if (toIndex >= 0) {
      isAnimatingRef.current = true
    } else {
      isAnimatingRef.current = false
      isPresentingRef.current = false
    }
  }, [])

  const handleChange = useCallback((index: number) => {
    if (index < 0) {
      isPresentingRef.current = false
      isAnimatingRef.current = false
    } else {
      isPresentingRef.current = true
      isAnimatingRef.current = false
    }
  }, [])

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  )

  const handleActionPress = useCallback(
    async (action: ActionSheetAction) => {
      try {
        await action.onPress?.()
      } catch (error) {
        console.error("[ActionSheet] action failed", error)
      } finally {
        bottomSheetRef.current?.dismiss()
      }
    },
    [],
  )

  const getActionStyle = (action: ActionSheetAction) => {
    switch (action.style) {
      case "destructive":
        return { container: styles.actionDestructive, text: styles.actionTextDestructive }
      case "primary":
        return { container: styles.actionPrimary, text: styles.actionTextPrimary }
      case "cancel":
        return { container: styles.actionCancel, text: styles.actionTextCancel }
      default:
        return { container: styles.action, text: styles.actionText }
    }
  }

  const paddingBottom = useMemo(() => Math.max(insets.bottom, 16), [insets.bottom])

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onDismiss={handleDismiss}
      onAnimate={handleAnimate}
      onChange={handleChange}
      backgroundStyle={styles.container}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <View style={[styles.header, { paddingBottom }]}>
        {config?.title ? <RNText style={styles.title}>{config.title}</RNText> : null}
        {config?.message ? <RNText style={styles.message}>{config.message}</RNText> : null}

        {config?.actions?.length ? <View style={styles.separator} /> : null}

        {config?.actions?.map((action, idx) => {
          const actionStyles = getActionStyle(action)
          const showTopGap = idx > 0
          return (
            <Pressable
              key={`${action.text}-${idx}`}
              style={({ pressed }) => [
                actionStyles.container,
                showTopGap && { marginTop: 8 },
                pressed && { opacity: 0.9 },
              ]}
              onPress={() => handleActionPress(action)}
              accessibilityRole="button"
            >
              {action.loading ? (
                <ActivityIndicator
                  color={
                    action.style === "primary"
                      ? theme.colors.palette.neutral100
                      : theme.colors.textDim
                  }
                />
              ) : (
                <RNText style={actionStyles.text}>{action.text}</RNText>
              )}
            </Pressable>
          )
        })}
      </View>
    </BottomSheetModal>
  )
})

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral100,
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
})

const $handleIndicator: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral400,
  width: 40,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 18,
  fontWeight: "700",
  color: colors.text,
})

const $message: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  marginTop: spacing.xs,
  fontSize: 14,
  color: colors.textDim,
  lineHeight: 20,
})

const $separator: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
})

const baseAction: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingVertical: spacing.md,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.palette.neutral200,
})

const $action: ThemedStyle<ViewStyle> = baseAction

const $actionDestructive: ThemedStyle<ViewStyle> = (theme) => ({
  ...baseAction(theme),
  backgroundColor: "#FEE2E2",
})

const $actionPrimary: ThemedStyle<ViewStyle> = (theme) => ({
  ...baseAction(theme),
  backgroundColor: theme.colors.tint,
})

const $actionCancel: ThemedStyle<ViewStyle> = (theme) => ({
  ...baseAction(theme),
  backgroundColor: theme.colors.palette.neutral300,
})

const $actionText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.text,
})

const $actionTextDestructive: ThemedStyle<TextStyle> = (theme) => ({
  ...$actionText(theme),
  color: theme.colors.error,
})

const $actionTextPrimary: ThemedStyle<TextStyle> = (theme) => ({
  ...$actionText(theme),
  color: theme.colors.palette.neutral100,
})

const $actionTextCancel: ThemedStyle<TextStyle> = (theme) => ({
  ...$actionText(theme),
  color: theme.colors.textDim,
})

// We need StyleSheet for spread usage above
StyleSheet.create({})

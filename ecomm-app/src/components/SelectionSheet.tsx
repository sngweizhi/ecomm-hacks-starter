import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { Pressable, View, ViewStyle, TextStyle } from "react-native"
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
} from "@gorhom/bottom-sheet"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Text } from "@/components/Text"
import { Icon } from "@/components/Icon"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface SelectionOption {
  value: string | null
  label: string
  description?: string
}

export interface SelectionSheetConfig {
  title: string
  message?: string
  options: SelectionOption[]
  selectedValue?: string | null
  onSelect: (value: string | null) => void
}

export interface SelectionSheetRef {
  present: (config: SelectionSheetConfig) => void
  dismiss: () => void
  isPresenting: () => boolean
}

export const SelectionSheet = forwardRef<SelectionSheetRef>(function SelectionSheet(_, ref) {
  const bottomSheetRef = useRef<BottomSheetModal>(null)
  const isPresentingRef = useRef(false)
  const isAnimatingRef = useRef(false)
  const { themed, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [config, setConfig] = useState<SelectionSheetConfig | null>(null)

  const styles = useMemo(
    () => ({
      container: themed($container),
      handleIndicator: themed($handleIndicator),
      header: themed($header),
      title: themed($title),
      message: themed($message),
      option: themed($option),
      optionSelected: themed($optionSelected),
      optionPressed: themed($optionPressed),
      optionLabel: themed($optionLabel),
      optionDescription: themed($optionDescription),
      separator: themed($separator),
    }),
    [themed],
  )

  const present = useCallback((nextConfig: SelectionSheetConfig) => {
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

  const handleSelect = useCallback(
    (value: string | null) => {
      config?.onSelect?.(value)
      bottomSheetRef.current?.dismiss()
    },
    [config],
  )

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
        <Text style={styles.title}>{config?.title ?? ""}</Text>
        {config?.message ? <Text style={styles.message}>{config.message}</Text> : null}

        {config?.options?.length ? <View style={styles.separator} /> : null}

        {config?.options?.map((option) => {
          const isSelected = option.value === config.selectedValue
          return (
            <Pressable
              key={`${option.label}-${String(option.value)}`}
              onPress={() => handleSelect(option.value)}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                {option.description ? (
                  <Text style={styles.optionDescription}>{option.description}</Text>
                ) : null}
              </View>
              {isSelected ? <Icon icon="check" size={18} color={theme.colors.tint} /> : null}
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

const $option: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.md,
  borderRadius: 12,
  backgroundColor: colors.palette.neutral200,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
  marginTop: spacing.xs,
})

const $optionSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.primary100,
})

const $optionPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral300,
})

const $optionLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.text,
})

const $optionDescription: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.textDim,
  marginTop: 2,
})


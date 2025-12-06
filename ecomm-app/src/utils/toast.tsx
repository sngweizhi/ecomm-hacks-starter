import { View, StyleSheet, ViewStyle, TextStyle } from "react-native"
// eslint-disable-next-line no-restricted-imports
import { Text } from "react-native"
import Toast, { ToastConfig } from "react-native-toast-message"

import { getTheme } from "@/theme/context.utils"

/**
 * Custom toast configuration that uses the app's theme colors
 */
export const toastConfig: ToastConfig = {
  error: ({ text1, text2 }) => {
    const theme = getTheme()
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.errorBackground }]}>
        <View style={[styles.indicator, { backgroundColor: theme.colors.error }]} />
        <View style={styles.content}>
          {text1 && (
            <Text style={[styles.title, { color: theme.colors.error }]} numberOfLines={1}>
              {text1}
            </Text>
          )}
          {text2 && (
            <Text style={[styles.message, { color: theme.colors.text }]} numberOfLines={2}>
              {text2}
            </Text>
          )}
        </View>
      </View>
    )
  },

  success: ({ text1, text2 }) => {
    const theme = getTheme()
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.palette.secondary100 }]}>
        <View style={[styles.indicator, { backgroundColor: theme.colors.palette.secondary500 }]} />
        <View style={styles.content}>
          {text1 && (
            <Text
              style={[styles.title, { color: theme.colors.palette.secondary500 }]}
              numberOfLines={1}
            >
              {text1}
            </Text>
          )}
          {text2 && (
            <Text style={[styles.message, { color: theme.colors.text }]} numberOfLines={2}>
              {text2}
            </Text>
          )}
        </View>
      </View>
    )
  },

  info: ({ text1, text2 }) => {
    const theme = getTheme()
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.palette.primary100 }]}>
        <View style={[styles.indicator, { backgroundColor: theme.colors.tint }]} />
        <View style={styles.content}>
          {text1 && (
            <Text style={[styles.title, { color: theme.colors.tint }]} numberOfLines={1}>
              {text1}
            </Text>
          )}
          {text2 && (
            <Text style={[styles.message, { color: theme.colors.text }]} numberOfLines={2}>
              {text2}
            </Text>
          )}
        </View>
      </View>
    )
  },
}

/* eslint-disable react-native/no-color-literals */
const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    width: "90%",
    minHeight: 56,
    borderRadius: 12,
    marginHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  } as ViewStyle,
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  } as ViewStyle,
  indicator: {
    width: 4,
    height: "100%",
    minHeight: 56,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  } as ViewStyle,
  message: {
    fontSize: 13,
    marginTop: 2,
  } as TextStyle,
  title: {
    fontSize: 14,
    fontWeight: "600",
  } as TextStyle,
})
/* eslint-enable react-native/no-color-literals */

/**
 * Show an error toast
 */
export function showErrorToast(title: string, message?: string) {
  Toast.show({
    type: "error",
    text1: title,
    text2: message,
    visibilityTime: 4000,
    topOffset: 60,
  })
}

/**
 * Show a success toast
 */
export function showSuccessToast(title: string, message?: string) {
  Toast.show({
    type: "success",
    text1: title,
    text2: message,
    visibilityTime: 3000,
    topOffset: 60,
  })
}

/**
 * Show an info toast
 */
export function showInfoToast(title: string, message?: string) {
  Toast.show({
    type: "info",
    text1: title,
    text2: message,
    visibilityTime: 3000,
    topOffset: 60,
  })
}

/**
 * Re-export Toast component for use in layout
 */
export { Toast }

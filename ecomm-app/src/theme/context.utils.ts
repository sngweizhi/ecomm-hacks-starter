import { Appearance } from "react-native"

import { lightTheme, darkTheme } from "./theme"
import type { Theme } from "./types"

const systemui = require("expo-system-ui")

/**
 * Get the current theme based on the color scheme.
 * This is a non-hook version for use outside of React components (e.g., toasts).
 */
export function getTheme(): Theme {
  const colorScheme = Appearance.getColorScheme()
  return colorScheme === "dark" ? darkTheme : lightTheme
}

/**
 * Set the system UI background color to the given color. This is only available if the app has
 * installed expo-system-ui.
 *
 * @param color The color to set the system UI background to
 */
export const setSystemUIBackgroundColor = (color: string) => {
  if (systemui) {
    systemui.setBackgroundColorAsync(color)
  }
}

/**
 * Set the app's native background color to match the theme.
 * This is only available if the app has installed expo-system-ui
 *
 * @param theme The theme object to use for the background color
 */
export const setImperativeTheming = (theme: Theme) => {
  setSystemUIBackgroundColor(theme.colors.background)
}

const palette = {
  neutral100: "#FFFFFF",
  neutral200: "#FAFAFA",
  neutral300: "#E5E5E5",
  neutral400: "#D4D4D4",
  neutral500: "#A3A3A3",
  neutral600: "#737373",
  neutral700: "#404040",
  neutral800: "#262626",
  neutral900: "#171717",

  // Dark Blue primary scale (#003366 base)
  primary100: "#E6EEF5",
  primary200: "#B3CCDD",
  primary300: "#6699BB",
  primary400: "#335588",
  primary500: "#003366",
  primary600: "#002244",

  // Gold/Beige secondary scale (#C5B358 base)
  secondary100: "#FDF9E8",
  secondary200: "#F5EEC4",
  secondary300: "#D4C77A",
  secondary400: "#C5B358",
  secondary500: "#A89840",

  // Gold accent (complementary to primary)
  accent100: "#FDF9E8",
  accent200: "#F5EEC4",
  accent300: "#D4C77A",
  accent400: "#C5B358",
  accent500: "#A89840",

  angry100: "#FEE2E2",
  angry500: "#EF4444",

  overlay20: "rgba(0, 51, 102, 0.2)",
  overlay50: "rgba(0, 51, 102, 0.5)",
} as const

export const colors = {
  /**
   * The palette is available to use, but prefer using the name.
   * This is only included for rare, one-off cases. Try to use
   * semantic names as much as possible.
   */
  palette,
  /**
   * A helper for making something see-thru.
   */
  transparent: "rgba(0, 0, 0, 0)",
  /**
   * The default text color in many components.
   */
  text: palette.neutral800,
  /**
   * Secondary text information.
   */
  textDim: palette.neutral600,
  /**
   * The default color of the screen background.
   */
  background: palette.neutral200,
  /**
   * The default border color.
   */
  border: palette.neutral400,
  /**
   * The main tinting color.
   */
  tint: palette.primary500,
  /**
   * The inactive tinting color.
   */
  tintInactive: palette.neutral300,
  /**
   * A subtle color used for lines.
   */
  separator: palette.neutral300,
  /**
   * Error messages.
   */
  error: palette.angry500,
  /**
   * Error Background.
   */
  errorBackground: palette.angry100,
} as const

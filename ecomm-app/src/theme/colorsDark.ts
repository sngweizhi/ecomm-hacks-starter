const palette = {
  neutral100: "#0A0A0A",
  neutral200: "#171717",
  neutral300: "#262626",
  neutral400: "#404040",
  neutral500: "#525252",
  neutral600: "#A3A3A3",
  neutral700: "#D4D4D4",
  neutral800: "#F5F5F5",
  neutral900: "#FAFAFA",

  // Dark Blue primary scale (inverted for dark mode)
  primary100: "#001122",
  primary200: "#002244",
  primary300: "#335588",
  primary400: "#6699BB",
  primary500: "#88AACC",
  primary600: "#B3CCDD",

  // Gold/Beige secondary scale (adjusted for dark mode)
  secondary100: "#3D3820",
  secondary200: "#5C5430",
  secondary300: "#A89840",
  secondary400: "#C5B358",
  secondary500: "#D4C77A",

  // Gold accent (adjusted for dark mode)
  accent100: "#3D3820",
  accent200: "#5C5430",
  accent300: "#A89840",
  accent400: "#C5B358",
  accent500: "#D4C77A",

  angry100: "#450A0A",
  angry500: "#F87171",

  overlay20: "rgba(250, 250, 250, 0.2)",
  overlay50: "rgba(250, 250, 250, 0.5)",
} as const

export const colors = {
  palette,
  transparent: "rgba(0, 0, 0, 0)",
  text: palette.neutral800,
  textDim: palette.neutral600,
  background: palette.neutral200,
  border: palette.neutral400,
  tint: palette.primary500,
  tintInactive: palette.neutral300,
  separator: palette.neutral300,
  error: palette.angry500,
  errorBackground: palette.angry100,
} as const

// TODO: write documentation about fonts and typography along with guides on how to add custom fonts in own
// markdown file and add links from here

import { Platform } from "react-native"
import {
  DMSans_400Regular as dmSansRegular,
  DMSans_500Medium as dmSansMedium,
  DMSans_700Bold as dmSansBold,
} from "@expo-google-fonts/dm-sans"
import {
  Sora_400Regular as soraRegular,
  Sora_500Medium as soraMedium,
  Sora_600SemiBold as soraSemiBold,
  Sora_700Bold as soraBold,
} from "@expo-google-fonts/sora"

export const customFontsToLoad = {
  dmSansRegular,
  dmSansMedium,
  dmSansBold,
  soraRegular,
  soraMedium,
  soraSemiBold,
  soraBold,
}

const fonts = {
  sora: {
    // Primary display/headline font.
    light: "soraRegular",
    normal: "soraRegular",
    medium: "soraMedium",
    semiBold: "soraSemiBold",
    bold: "soraBold",
  },
  dmSans: {
    // Primary body/UI font.
    light: "dmSansRegular",
    normal: "dmSansRegular",
    medium: "dmSansMedium",
    semiBold: "dmSansBold",
    bold: "dmSansBold",
  },
  helveticaNeue: {
    // iOS only font.
    thin: "HelveticaNeue-Thin",
    light: "HelveticaNeue-Light",
    normal: "Helvetica Neue",
    medium: "HelveticaNeue-Medium",
  },
  courier: {
    // iOS only font.
    normal: "Courier",
  },
  sansSerif: {
    // Android only font.
    thin: "sans-serif-thin",
    light: "sans-serif-light",
    normal: "sans-serif",
    medium: "sans-serif-medium",
  },
  monospace: {
    // Android only font.
    normal: "monospace",
  },
}

export const typography = {
  /**
   * The fonts are available to use, but prefer using the semantic name.
   */
  fonts,
  /**
   * The primary font. Used in most places.
   */
  primary: fonts.sora,
  /**
   * An alternate font used for perhaps titles and stuff.
   */
  secondary: Platform.select(
    {
      ios: { ...fonts.dmSans, ...fonts.helveticaNeue },
      android: { ...fonts.dmSans, ...fonts.sansSerif },
    },
    // fallback for web/native
  ) ?? fonts.dmSans,
  /**
   * Lets get fancy with a monospace font!
   */
  code: Platform.select({ ios: fonts.courier, android: fonts.monospace }),
}

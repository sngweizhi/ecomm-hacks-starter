/* eslint-disable react-native/no-unused-styles */
import { useMemo } from "react"
import { StyleSheet, TextStyle, ViewStyle } from "react-native"
import Markdown from "react-native-markdown-display"

import { useAppTheme } from "@/theme/context"

interface MarkdownContentProps {
  content: string
}

/**
 * Renders markdown content with proper styling
 * Used for AI assistant responses in the chat
 */
export function MarkdownContent({ content }: MarkdownContentProps) {
  const {
    theme: { colors, typography },
  } = useAppTheme()

  const markdownStyles = useMemo(
    () =>
      StyleSheet.create({
        blockquote: {
          backgroundColor: colors.palette.neutral200,
          borderLeftWidth: 4,
          borderLeftColor: colors.tint,
          paddingLeft: 12,
          paddingVertical: 8,
          marginVertical: 8,
        } as ViewStyle,
        body: {
          color: colors.text,
          fontSize: 15,
          lineHeight: 22,
          fontFamily: typography.primary.normal,
        } as TextStyle,
        bullet_list: {
          marginVertical: 8,
        } as ViewStyle,
        bullet_list_icon: {
          color: colors.text,
          fontSize: 15,
          marginRight: 8,
        } as TextStyle,
        code_block: {
          backgroundColor: colors.palette.neutral800,
          color: colors.palette.neutral100,
          fontFamily: typography.code?.normal || "monospace",
          fontSize: 13,
          padding: 12,
          borderRadius: 8,
          marginVertical: 8,
          overflow: "hidden",
        } as TextStyle,
        code_inline: {
          backgroundColor: colors.palette.neutral200,
          color: colors.text,
          fontFamily: typography.code?.normal || "monospace",
          fontSize: 13,
          paddingHorizontal: 4,
          paddingVertical: 2,
          borderRadius: 4,
        } as TextStyle,
        em: {
          fontStyle: "italic",
        } as TextStyle,
        fence: {
          backgroundColor: colors.palette.neutral800,
          color: colors.palette.neutral100,
          fontFamily: typography.code?.normal || "monospace",
          fontSize: 13,
          padding: 12,
          borderRadius: 8,
          marginVertical: 8,
          overflow: "hidden",
        } as TextStyle,
        heading1: {
          fontSize: 22,
          fontWeight: "700",
          color: colors.text,
          marginTop: 16,
          marginBottom: 8,
          fontFamily: typography.primary.bold,
        } as TextStyle,
        heading2: {
          fontSize: 18,
          fontWeight: "600",
          color: colors.text,
          marginTop: 12,
          marginBottom: 6,
          fontFamily: typography.primary.semiBold,
        } as TextStyle,
        heading3: {
          fontSize: 16,
          fontWeight: "600",
          color: colors.text,
          marginTop: 10,
          marginBottom: 4,
          fontFamily: typography.primary.semiBold,
        } as TextStyle,
        hr: {
          backgroundColor: colors.separator,
          height: 1,
          marginVertical: 12,
        } as ViewStyle,
        link: {
          color: colors.tint,
          textDecorationLine: "underline",
        } as TextStyle,
        list_item: {
          flexDirection: "row",
          marginBottom: 4,
        } as ViewStyle,
        ordered_list: {
          marginVertical: 8,
        } as ViewStyle,
        ordered_list_icon: {
          color: colors.text,
          fontSize: 15,
          marginRight: 8,
        } as TextStyle,
        paragraph: {
          marginTop: 0,
          marginBottom: 8,
        } as ViewStyle,
        strong: {
          fontWeight: "700",
          fontFamily: typography.primary.bold,
        } as TextStyle,
        table: {
          borderWidth: 1,
          borderColor: colors.separator,
          borderRadius: 4,
          marginVertical: 8,
        } as ViewStyle,
        td: {
          padding: 8,
          borderTopWidth: 1,
          borderTopColor: colors.separator,
        } as ViewStyle,
        th: {
          padding: 8,
          fontWeight: "600",
        } as TextStyle,
        thead: {
          backgroundColor: colors.palette.neutral200,
        } as ViewStyle,
      }),
    [colors, typography],
  )

  return <Markdown style={markdownStyles}>{content}</Markdown>
}

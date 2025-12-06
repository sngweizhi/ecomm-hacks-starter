import { useMemo, useState } from "react"
import { LayoutChangeEvent, StyleSheet, View } from "react-native"
import Svg, { Rect, Text as SvgText } from "react-native-svg"

import type { NormalizedBoundingBox } from "@/lib/geminiLive"

type BoundingBoxOverlayProps = {
  box?: NormalizedBoundingBox
  label?: string
  confidence?: number
  /**
   * Optional flag to show active color when streaming.
   */
  isActive?: boolean
}

export function BoundingBoxOverlay({ box, label, confidence, isActive }: BoundingBoxOverlayProps) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  const absoluteBox = useMemo(() => {
    if (!box || size.width === 0 || size.height === 0) return null
    return {
      x: box.x * size.width,
      y: box.y * size.height,
      width: box.width * size.width,
      height: box.height * size.height,
    }
  }, [box, size.height, size.width])

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize({ width, height })
  }

  if (!absoluteBox) {
    return <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={handleLayout} />
  }

  const badgeText = label
    ? `${label}${confidence ? ` (${Math.round(confidence * 100)}%)` : ""}`
    : confidence
      ? `${Math.round(confidence * 100)}%`
      : "Detected"

  const strokeColor = isActive ? "#5AC8FA" : "#4ade80"
  const fillColor = isActive ? "rgba(90,200,250,0.12)" : "rgba(74,222,128,0.12)"

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={handleLayout}>
      <Svg width="100%" height="100%">
        <Rect
          x={absoluteBox.x}
          y={absoluteBox.y}
          width={absoluteBox.width}
          height={absoluteBox.height}
          stroke={strokeColor}
          strokeWidth={3}
          fill={fillColor}
          rx={8}
        />
        <Rect
          x={absoluteBox.x}
          y={Math.max(absoluteBox.y - 28, 0)}
          width={Math.max(120, badgeText.length * 7)}
          height={24}
          rx={6}
          fill={strokeColor}
          opacity={0.9}
        />
        <SvgText
          x={absoluteBox.x + 8}
          y={Math.max(absoluteBox.y - 10, 14)}
          fill="#0b0b0b"
          fontSize={12}
          fontWeight="600"
        >
          {badgeText}
        </SvgText>
      </Svg>
    </View>
  )
}

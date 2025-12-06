import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  // eslint-disable-next-line no-restricted-imports
  TextInput,
  // eslint-disable-next-line no-restricted-imports
  type TextInput as TextInputType,
} from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useUIMessages, useSmoothText, optimisticallySendMessage } from "@convex-dev/agent/react"
import type { UIMessage } from "@convex-dev/agent/react"
import { useMutation, useQuery } from "convex/react"
import { CaretRight, PaperPlaneTilt, Stop, ChatCircle } from "phosphor-react-native"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { MarkdownContent } from "./MarkdownContent"
import { ProductChatCard } from "./ProductChatCard"
import { Spinner } from "./Spinner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

interface ToolCallInfo {
  type: string
  toolCallId: string
  state?: string
}

const TOOL_DISPLAY_NAMES: Record<string, { pending: string; completed: string }> = {
  searchProducts: {
    pending: "Searching products",
    completed: "Searched products",
  },
  searchListingsRag: {
    pending: "Searching products",
    completed: "Searched products",
  },
}

// Local optimistic message type (before server confirms)
interface LocalMessage {
  key: string
  role: "user" | "assistant"
  text: string
  isOptimistic: true
}

/**
 * Marketplace Chat View - AI Shopping Assistant
 * Single persistent chat per user with product recommendations
 */
export function MarketplaceChatView() {
  const {
    theme: { colors },
    themed,
  } = useAppTheme()
  const insets = useSafeAreaInsets()

  // Get or create user's chat thread
  const existingThreadId = useQuery(api.chat.getUserChatThreadId)
  const createUserChat = useMutation(api.chat.createUserChat)

  // Track thread ID locally
  const [localThreadId, setLocalThreadId] = useState<string | null>(null)
  const effectiveThreadId = existingThreadId || localThreadId

  // Local optimistic messages (before thread exists)
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([])
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false)

  const [inputText, setInputText] = useState("")

  const flatListRef = useRef<FlatList<UIMessage | LocalMessage>>(null)
  const inputRef = useRef<TextInputType>(null)
  const spinnerRotation = useSharedValue(0)

  // Persistent spinner rotation for shared animation across components
  useEffect(() => {
    spinnerRotation.value = withRepeat(
      withTiming(360, { duration: 800, easing: Easing.linear }),
      -1,
      false,
    )
  }, [spinnerRotation])

  // Fetch messages with streaming support (only when we have a thread)
  const {
    results: serverMessages,
    status,
    loadMore,
  } = useUIMessages(
    api.chat.listMessages,
    effectiveThreadId ? { threadId: effectiveThreadId } : "skip",
    { initialNumItems: 50, stream: true },
  )

  // Auto-create a chat thread so users land directly in their conversation
  useEffect(() => {
    if (existingThreadId === undefined || localThreadId) return
    if (existingThreadId === null) {
      createUserChat({})
        .then((threadId) => {
          setLocalThreadId(threadId)
        })
        .catch((error) => {
          console.error("[Chat] Create thread error:", error)
        })
    }
  }, [existingThreadId, localThreadId, createUserChat])

  // Mutations
  const sendMessage = useMutation(api.chat.sendMessage).withOptimisticUpdate(
    optimisticallySendMessage(api.chat.listMessages),
  )
  const abortStreamMutation = useMutation(api.chat.abortStream)

  // Determine which messages to display
  const hasServerMessages = serverMessages && serverMessages.length > 0
  const displayMessages = hasServerMessages ? serverMessages : localMessages

  // Extract product ID mappings from search tool results
  const productIdMap = useMemo(() => {
    if (!serverMessages) return new Map<number, Id<"listings">>()
    return extractProductIdMap(serverMessages)
  }, [serverMessages])

  // Handle product press - navigate to listing
  const handleProductPress = useCallback((listingId: Id<"listings">) => {
    router.push(`/listing/${listingId}`)
  }, [])

  // Check if currently streaming or pending (for button state)
  const streamingMessage = serverMessages?.find(
    (m) => m.status === "streaming" || m.status === "pending",
  )
  const isStreaming = !!streamingMessage

  // Show stop button when waiting for agent OR actively streaming
  const showStopButton = isWaitingForAgent || isStreaming

  // Clear waiting state when agent actually responds
  useEffect(() => {
    if (streamingMessage) {
      setIsWaitingForAgent(false)
    }
  }, [streamingMessage])

  // Clear local messages once server messages arrive
  useEffect(() => {
    if (hasServerMessages && localMessages.length > 0) {
      setLocalMessages([])
    }
  }, [hasServerMessages, localMessages.length])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (displayMessages && displayMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [displayMessages])

  // Handle sending a message
  const handleSend = useCallback(
    async (prompt?: string) => {
      const messageText = prompt || inputText.trim()
      if (!messageText || isWaitingForAgent || isStreaming) return

      // Clear input immediately
      setInputText("")
      Keyboard.dismiss()

      // Add optimistic user message to local state
      const tempUserMessage: LocalMessage = {
        key: `temp-user-${Date.now()}`,
        role: "user",
        text: messageText,
        isOptimistic: true,
      }
      setLocalMessages((prev) => [...prev, tempUserMessage])

      // Show thinking indicator
      setIsWaitingForAgent(true)

      try {
        let targetThreadId = effectiveThreadId

        // Create thread if we don't have one
        if (!targetThreadId) {
          targetThreadId = await createUserChat({})
          setLocalThreadId(targetThreadId)
        }

        // Send message
        await sendMessage({
          threadId: targetThreadId,
          prompt: messageText,
        })
      } catch (error) {
        console.error("[Chat] Send message error:", error)
        setIsWaitingForAgent(false)
        // Restore input on error
        setInputText(messageText)
        // Remove optimistic message on error
        setLocalMessages((prev) => prev.filter((m) => m.key !== tempUserMessage.key))
      }
    },
    [inputText, effectiveThreadId, isWaitingForAgent, isStreaming, createUserChat, sendMessage],
  )

  // Handle submit from input
  const handleSubmit = useCallback(() => {
    handleSend()
  }, [handleSend])

  // Stop the streaming response
  const handleStop = useCallback(() => {
    setIsWaitingForAgent(false)

    if (!effectiveThreadId) return

    const messageToAbort = serverMessages?.find(
      (m) => m.status === "streaming" || m.status === "pending",
    )
    if (messageToAbort?.order !== undefined) {
      void abortStreamMutation({ threadId: effectiveThreadId, order: messageToAbort.order }).catch(
        console.error,
      )
    }
  }, [effectiveThreadId, serverMessages, abortStreamMutation])

  const handleLoadMore = useCallback(() => {
    if (status === "CanLoadMore") {
      loadMore(20)
    }
  }, [status, loadMore])

  // Render a server message (UIMessage)
  const renderServerMessage = useCallback(
    ({ item }: { item: UIMessage }) => {
      const isUser = item.role === "user"

      return (
        <View
          style={[
            themed($messageContainer),
            isUser ? themed($userMessageContainer) : themed($assistantMessageContainer),
          ]}
        >
          <MessageBubble
            message={item}
            isUser={isUser}
            productIdMap={productIdMap}
            onProductPress={handleProductPress}
            spinnerRotation={spinnerRotation}
          />
        </View>
      )
    },
    [themed, productIdMap, handleProductPress, spinnerRotation],
  )

  // Render a local optimistic message
  const renderLocalMessage = useCallback(
    ({ item }: { item: LocalMessage }) => {
      return (
        <View style={[themed($messageContainer), themed($userMessageContainer)]}>
          <View style={themed($userBubble)}>
            <Text style={themed($userBubbleText)}>{item.text}</Text>
          </View>
        </View>
      )
    },
    [themed],
  )

  // Unified render function for FlatList
  const renderMessage = useCallback(
    ({ item }: { item: UIMessage | LocalMessage }) => {
      if ("isOptimistic" in item) {
        return renderLocalMessage({ item })
      } else {
        return renderServerMessage({ item })
      }
    },
    [renderLocalMessage, renderServerMessage],
  )

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      {/* Header */}
      <View style={themed($header)}>
        <ChatCircle size={24} color={colors.tint} weight="fill" />
        <Text style={themed($headerTitle)}>Shopping Assistant</Text>
      </View>

      <KeyboardAvoidingView
        style={themed($keyboardAvoid)}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Messages List */}
        <FlatList<UIMessage | LocalMessage>
          ref={flatListRef}
          data={displayMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.key}
          contentContainerStyle={themed($messagesContent)}
          showsVerticalScrollIndicator={false}
          onStartReached={hasServerMessages ? handleLoadMore : undefined}
          onStartReachedThreshold={0.1}
          ListHeaderComponent={
            hasServerMessages && status === "LoadingMore" ? (
              <View style={themed($loadingMore)}>
                <Spinner size={20} color={colors.tint} sharedRotation={spinnerRotation} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={themed($emptyMessages)}>
              <Text style={themed($emptyMessagesText)}>Start a conversation...</Text>
            </View>
          }
          ListFooterComponent={
            isWaitingForAgent && !streamingMessage ? (
              <View style={[themed($messageContainer), themed($assistantMessageContainer)]}>
                <View style={themed($assistantBubble)}>
                  <Spinner size={20} color={colors.tint} sharedRotation={spinnerRotation} />
                </View>
              </View>
            ) : null
          }
        />

        {/* Input Bar */}
        <View style={[themed($inputContainer), { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TextInput
            ref={inputRef}
            style={themed($input)}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask about products..."
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={10000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSubmit}
          />
          {showStopButton ? (
            <Pressable
              onPress={handleStop}
              style={({ pressed }) => [themed($stopButton), pressed && themed($stopButtonPressed)]}
            >
              <Stop size={20} color={colors.palette.neutral100} weight="fill" />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSubmit}
              disabled={!inputText.trim()}
              style={({ pressed }) => [
                themed($sendButton),
                !inputText.trim() && themed($sendButtonDisabled),
                pressed && themed($sendButtonPressed),
              ]}
            >
              <PaperPlaneTilt size={20} color={colors.palette.neutral100} weight="fill" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

// ============================================================================
// Product ID Extraction Helpers
// ============================================================================

/**
 * Regex to extract product IDs from search tool results
 * Matches patterns like "[1] ID: abc123"
 */
const PRODUCT_ID_REGEX = /\[(\d+)\]\s*ID:\s*([^\n\s]+)/g

/**
 * Extract product ID mappings from all messages in the conversation
 */
function extractProductIdMap(messages: UIMessage[]): Map<number, Id<"listings">> {
  const productIdMap = new Map<number, Id<"listings">>()
  const toolTypes = new Set(["tool-searchProducts", "tool-searchListingsRag"])

  for (const message of messages) {
    if (!message.parts) continue

    for (const part of message.parts) {
      if (toolTypes.has(part.type as string) && "output" in part && typeof part.output === "string") {
        const output = part.output as string
        let match: RegExpExecArray | null

        PRODUCT_ID_REGEX.lastIndex = 0

        while ((match = PRODUCT_ID_REGEX.exec(output)) !== null) {
          const refNum = parseInt(match[1], 10)
          const listingId = match[2] as Id<"listings">
          productIdMap.set(refNum, listingId)
        }
      }
    }
  }

  return productIdMap
}

// ============================================================================
// Tool Call Helpers
// ============================================================================

function extractToolCalls(message: UIMessage): ToolCallInfo[] {
  if (!message.parts) return []

  const toolCalls: ToolCallInfo[] = []
  for (const part of message.parts) {
    if ("toolCallId" in part && (part.type as string).startsWith("tool-")) {
      const typedPart = part as { type: string; toolCallId: string; state?: string }
      toolCalls.push({
        type: typedPart.type,
        toolCallId: typedPart.toolCallId,
        state: typedPart.state,
      })
    }
  }
  return toolCalls
}

function getToolDisplayName(toolType: string, isCompleted: boolean): string {
  const toolName = toolType.replace("tool-", "")
  const customNames = TOOL_DISPLAY_NAMES[toolName]
  if (customNames) {
    return isCompleted ? customNames.completed : customNames.pending
  }

  const readable = toolName
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .trim()

  return readable.charAt(0).toUpperCase() + readable.slice(1)
}

interface ToolCallTextProps {
  toolCalls: ToolCallInfo[]
  isStreaming: boolean
}

function ShimmerChar({
  char,
  index,
  shimmerPosition,
  isActive,
  baseStyle,
}: {
  char: string
  index: number
  shimmerPosition: SharedValue<number>
  isActive: boolean
  baseStyle: TextStyle
}) {
  const charStyle = useAnimatedStyle(() => {
    "worklet"
    if (!isActive) {
      return { opacity: 1 }
    }
    const distance = Math.abs(shimmerPosition.value - index)
    const waveWidth = 3
    if (distance > waveWidth) {
      return { opacity: 0.4 }
    }
    const intensity = 1 - distance / waveWidth
    return { opacity: 0.4 + intensity * 0.6 }
  })

  return <Animated.Text style={[baseStyle, charStyle]}>{char}</Animated.Text>
}

function ToolCallText({ toolCalls, isStreaming }: ToolCallTextProps) {
  const { themed } = useAppTheme()
  const shimmerPosition = useSharedValue(-1)

  const hasActiveToolCall = toolCalls.some(
    (tc) => tc.state === "input-streaming" || tc.state === "input-available",
  )

  const toolsByType = toolCalls.reduce(
    (acc, tc) => {
      const type = tc.type
      if (!acc[type]) {
        acc[type] = { type, isCompleted: false }
      }
      if (tc.state === "output-available" || tc.state === "output-error") {
        acc[type].isCompleted = true
      }
      return acc
    },
    {} as Record<string, { type: string; isCompleted: boolean }>,
  )

  const uniqueTools = Object.values(toolsByType)
  const displayTool = uniqueTools.find((t) => !t.isCompleted) || uniqueTools[uniqueTools.length - 1]
  const displayText = displayTool
    ? getToolDisplayName(displayTool.type, displayTool.isCompleted)
    : ""

  const characters = displayText.split("")
  const textLength = characters.length

  useEffect(() => {
    if (!displayText) {
      shimmerPosition.value = -1
      return
    }
    const waveWidth = 3
    if (isStreaming || hasActiveToolCall) {
      shimmerPosition.value = withRepeat(
        withSequence(
          withTiming(textLength + waveWidth, {
            duration: 1500,
            easing: Easing.linear,
          }),
          withTiming(-waveWidth, { duration: 0 }),
        ),
        -1,
        false,
      )
    } else {
      shimmerPosition.value = -1
    }
  }, [displayText, textLength, isStreaming, hasActiveToolCall, shimmerPosition])

  if (!displayText) return null

  const baseStyle = themed($toolCallText)

  return (
    <Animated.Text style={baseStyle}>
      {characters.map((char, index) => (
        <ShimmerChar
          key={`${char}-${index}`}
          char={char}
          index={index}
          shimmerPosition={shimmerPosition}
          isActive={isStreaming || hasActiveToolCall}
          baseStyle={baseStyle}
        />
      ))}
    </Animated.Text>
  )
}

// ============================================================================
// Message Bubble Component
// ============================================================================

interface MessageBubbleProps {
  message: UIMessage
  isUser: boolean
  productIdMap: Map<number, Id<"listings">>
  onProductPress: (listingId: Id<"listings">) => void
  spinnerRotation?: SharedValue<number>
}

function MessageBubble({
  message,
  isUser,
  productIdMap,
  onProductPress,
  spinnerRotation,
}: MessageBubbleProps) {
  const {
    theme: { colors },
    themed,
  } = useAppTheme()
  const [showThinking, setShowThinking] = useState(false)

  const isStreaming = message.status === "streaming"
  const isPending = message.status === "pending"
  const isFailed = message.status === "failed"
  const isStreamingOrPending = isStreaming || isPending

  // Use smooth text for streaming
  const [visibleText] = useSmoothText(message.text || "", {
    startStreaming: isStreamingOrPending,
  })

  const reasoningText =
    message.parts
      ?.filter((p) => p.type === "reasoning" && "text" in p)
      .map((p) => (p as { type: "reasoning"; text: string }).text)
      .join("\n") ?? ""
  const [visibleReasoning] = useSmoothText(reasoningText, {
    startStreaming: isStreamingOrPending,
  })

  const toolCalls = extractToolCalls(message)

  const displayText = visibleText || message.text || ""

  // Extract product references from text for rendering cards
  const productRefs = useMemo(() => {
    const refs: Id<"listings">[] = []
    const regex = /\[\[product:([0-9,]+)\]\]/g
    let match

    while ((match = regex.exec(displayText)) !== null) {
      const numbers = match[1].split(",").map((n) => parseInt(n.trim(), 10))
      for (const num of numbers) {
        const listingId = productIdMap.get(num)
        if (listingId && !refs.includes(listingId)) {
          refs.push(listingId)
        }
      }
    }

    return refs
  }, [displayText, productIdMap])

  // Remove product citation markers from display text
  const cleanedText = displayText.replace(/\[\[product:[0-9,]+\]\]/g, "").trim()

  const hasThinking = !isUser && visibleReasoning.length > 0
  const hasToolCalls = !isUser && toolCalls.length > 0

  const chevronRotation = useSharedValue(0)
  useEffect(() => {
    chevronRotation.value = withTiming(showThinking ? 90 : 0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    })
  }, [showThinking, chevronRotation])

  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }))

  return (
    <View
      style={[themed(isUser ? $userBubble : $assistantBubble), isFailed && themed($failedBubble)]}
    >
      {/* Thinking/Reasoning Section */}
      {hasThinking && (
        <View style={themed($thinkingContainer)}>
          <Pressable onPress={() => setShowThinking(!showThinking)} style={themed($thinkingHeader)}>
            <Text style={themed($thinkingLabel)}>
              {isStreamingOrPending ? "Thinking..." : "Thinking"}
            </Text>
            <Animated.View style={chevronAnimatedStyle}>
              <CaretRight size={12} color={colors.textDim} />
            </Animated.View>
          </Pressable>
          {showThinking && (
            <Animated.View>
              <Text style={themed($thinkingText)}>{visibleReasoning}</Text>
            </Animated.View>
          )}
        </View>
      )}

      {/* Error State */}
      {isFailed && (
        <View style={themed($errorContainer)}>
          <Text style={themed($errorText)}>Failed to generate response</Text>
        </View>
      )}

      {/* Main Response */}
      <View style={themed($responseRow)}>
        {cleanedText ? (
          isUser ? (
            <Text style={themed($userBubbleText)}>{cleanedText}</Text>
          ) : (
            <MarkdownContent content={cleanedText} isStreaming={isStreamingOrPending} />
          )
        ) : null}
        {!isUser && isStreamingOrPending && !cleanedText && (
          <>
            <Spinner size={18} color={colors.tint} sharedRotation={spinnerRotation} />
            {hasToolCalls && (
              <ToolCallText toolCalls={toolCalls} isStreaming={isStreamingOrPending} />
            )}
          </>
        )}
      </View>

      {/* Product Cards */}
      {productRefs.length > 0 && (
        <View style={themed($productCardsContainer)}>
          {productRefs.map((listingId) => (
            <ProductChatCard
              key={listingId}
              listingId={listingId}
              onPress={() => onProductPress(listingId)}
            />
          ))}
        </View>
      )}
    </View>
  )
}

// ============================================================================
// Styles
// ============================================================================

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $header: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
  gap: spacing.sm,
})

const $headerTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 17,
  fontWeight: "600",
  color: colors.text,
  flex: 1,
})

const $keyboardAvoid: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

// Message list styles
const $messagesContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  flexGrow: 1,
})

const $loadingMore: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.md,
  alignItems: "center",
})

const $emptyMessages: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xxl,
})

const $emptyMessagesText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  color: colors.textDim,
})

const $messageContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  marginBottom: spacing.sm,
  alignItems: "flex-start",
})

const $userMessageContainer: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "flex-end",
})

const $assistantMessageContainer: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "flex-start",
})

const $userBubble: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  maxWidth: "80%",
  backgroundColor: colors.tint,
  borderRadius: 16,
  borderBottomRightRadius: 4,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
})

const $assistantBubble: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  paddingVertical: spacing.xs,
})

const $userBubbleText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 15,
  lineHeight: 22,
  color: colors.palette.neutral100,
})

const $responseRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $thinkingContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  marginBottom: spacing.xs,
  paddingBottom: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})

const $thinkingHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $thinkingLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 12,
  fontWeight: "500",
  color: colors.textDim,
  fontStyle: "italic",
})

const $thinkingText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 13,
  lineHeight: 18,
  color: colors.textDim,
  marginTop: spacing.xs,
})

const $failedBubble: ThemedStyle<ViewStyle> = () => ({})

const $errorContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  marginBottom: spacing.sm,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  backgroundColor: colors.errorBackground,
  borderWidth: 1,
  borderColor: colors.error,
  borderRadius: 8,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.error,
  fontWeight: "500",
  flex: 1,
})

const $productCardsContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.sm,
  gap: spacing.xs,
})

const $inputContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-end",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
  backgroundColor: colors.background,
})

const $input: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.palette.neutral100,
  borderRadius: 20,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  fontSize: 15,
  color: colors.text,
  maxHeight: 100,
  marginRight: spacing.sm,
})

const $sendButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.tint,
  justifyContent: "center",
  alignItems: "center",
})

const $sendButtonDisabled: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral300,
})

const $sendButtonPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint + "CC",
})

const $stopButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.error,
  justifyContent: "center",
  alignItems: "center",
})

const $stopButtonPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.error + "CC",
})

const $toolCallText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 13,
  color: colors.textDim,
  marginLeft: spacing.xs,
})

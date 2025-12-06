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
  ActivityIndicator,
} from "react-native"
import { router } from "expo-router"
import { useUIMessages, useSmoothText, optimisticallySendMessage } from "@convex-dev/agent/react"
import type { UIMessage } from "@convex-dev/agent/react"
import { useMutation, useQuery } from "convex/react"
import { CaretRight, PaperPlaneTilt, Stop, ChatCircle } from "phosphor-react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { MarkdownContent } from "./MarkdownContent"
import { ProductChatCard } from "./ProductChatCard"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

// Suggested starter questions for the shopping assistant
const STARTER_QUESTIONS = [
  "What electronics are available?",
  "Show me items under $50",
  "I&apos;m looking for textbooks",
  "What's popular right now?",
]

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

  // Get or create user's chat thread
  const existingThreadId = useQuery(api.chat.getUserChatThreadId)
  const createUserChat = useMutation(api.chat.createUserChat)

  // Track thread ID locally
  const [localThreadId, setLocalThreadId] = useState<string | null>(null)
  const effectiveThreadId = existingThreadId || localThreadId

  // Local optimistic messages (before thread exists)
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([])
  const [showStarters, setShowStarters] = useState(true)
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false)

  const [inputText, setInputText] = useState("")

  const flatListRef = useRef<FlatList<UIMessage | LocalMessage>>(null)
  const inputRef = useRef<TextInputType>(null)

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

  // Hide starters once we have messages
  useEffect(() => {
    if (hasServerMessages) {
      setShowStarters(false)
    }
  }, [hasServerMessages])

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

      // Hide starters immediately
      setShowStarters(false)

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

  // Handle starter prompt press
  const handleStarterPress = useCallback(
    (question: string) => {
      handleSend(question)
    },
    [handleSend],
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
          />
        </View>
      )
    },
    [themed, productIdMap, handleProductPress],
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
        {/* Starter Prompts */}
        {showStarters && displayMessages.length === 0 ? (
          <View style={themed($starterContainer)}>
            <View style={themed($iconContainer)}>
              <ChatCircle size={48} color={colors.tint} weight="fill" />
            </View>
            <Text style={themed($starterTitle)}>Find what you need</Text>
            <Text style={themed($starterSubtitle)}>
              Ask me about products, and I&apos;ll help you find the best deals
            </Text>

            <View style={themed($startersWrapper)}>
              {STARTER_QUESTIONS.map((question) => (
                <Pressable
                  key={question}
                  onPress={() => handleStarterPress(question)}
                  style={({ pressed }) => [
                    themed($starterButton),
                    pressed && themed($starterButtonPressed),
                  ]}
                >
                  <Text style={themed($starterText)}>{question}</Text>
                  <CaretRight size={16} color={colors.tint} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          /* Messages List */
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
                  <ActivityIndicator size="small" color={colors.tint} />
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
                    <ActivityIndicator size="small" color={colors.tint} />
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {/* Input Bar */}
        <View style={themed($inputContainer)}>
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

  for (const message of messages) {
    if (!message.parts) continue

    for (const part of message.parts) {
      if (
        part.type === "tool-searchProducts" &&
        "output" in part &&
        typeof part.output === "string"
      ) {
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
// Message Bubble Component
// ============================================================================

interface MessageBubbleProps {
  message: UIMessage
  isUser: boolean
  productIdMap: Map<number, Id<"listings">>
  onProductPress: (listingId: Id<"listings">) => void
}

function MessageBubble({ message, isUser, productIdMap, onProductPress }: MessageBubbleProps) {
  const {
    theme: { colors },
    themed,
  } = useAppTheme()

  const isStreaming = message.status === "streaming"
  const isFailed = message.status === "failed"

  // Use smooth text for streaming
  const [visibleText] = useSmoothText(message.text || "", {
    startStreaming: isStreaming,
  })

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

  return (
    <View
      style={[themed(isUser ? $userBubble : $assistantBubble), isFailed && themed($failedBubble)]}
    >
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
            <MarkdownContent content={cleanedText} />
          )
        ) : null}
        {!isUser && isStreaming && !cleanedText && (
          <ActivityIndicator size="small" color={colors.tint} />
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

// Starter styles
const $starterContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: spacing.xl,
})

const $iconContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 96,
  height: 96,
  borderRadius: 48,
  backgroundColor: colors.tint + "20",
  justifyContent: "center",
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $starterTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 24,
  fontWeight: "700",
  color: colors.text,
  textAlign: "center",
  marginBottom: spacing.xs,
})

const $starterSubtitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 15,
  color: colors.textDim,
  textAlign: "center",
  lineHeight: 22,
  marginBottom: spacing.xl,
})

const $startersWrapper: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

const $starterButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  marginBottom: spacing.xs,
})

const $starterButtonPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
})

const $starterText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 15,
  color: colors.text,
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

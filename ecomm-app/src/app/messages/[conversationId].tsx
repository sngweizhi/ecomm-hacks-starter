import { useState, useEffect, useRef } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  Pressable,
  FlatList,
  // eslint-disable-next-line no-restricted-imports
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native"
import { useLocalSearchParams, router } from "expo-router"
import { useQuery, useMutation } from "convex/react"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Icon } from "@/components/Icon"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAuth } from "@/context/AuthContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../../convex/_generated/api"
import type { Id, Doc } from "../../../convex/_generated/dataModel"

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>()
  const { themed, theme } = useAppTheme()
  const { userId, isAuthenticated } = useAuth()
  const insets = useSafeAreaInsets()
  const [message, setMessage] = useState("")
  const flatListRef = useRef<FlatList>(null)

  // Parse the conversation ID
  const parsedConversationId = conversationId as Id<"conversations">

  // Fetch conversation details
  const conversation = useQuery(
    api.conversations.get,
    isAuthenticated && conversationId ? { id: parsedConversationId } : "skip",
  )

  // Fetch messages
  const messages = useQuery(
    api.conversations.listMessages,
    isAuthenticated && conversationId ? { conversationId: parsedConversationId } : "skip",
  )

  // Mutations
  const sendMessageMutation = useMutation(api.conversations.sendMessage)
  const markAsRead = useMutation(api.conversations.markAsRead)

  // Mark messages as read when conversation is opened
  useEffect(() => {
    if (conversationId && isAuthenticated) {
      markAsRead({ conversationId: parsedConversationId }).catch(() => {
        // Silently handle error
      })
    }
  }, [conversationId, isAuthenticated, markAsRead, parsedConversationId])

  const handleBack = () => {
    router.back()
  }

  const handleSend = async () => {
    if (!message.trim() || !conversationId) return

    const messageContent = message.trim()
    setMessage("") // Clear immediately for better UX

    try {
      await sendMessageMutation({
        conversationId: parsedConversationId,
        content: messageContent,
      })
    } catch {
      // Restore message on error
      setMessage(messageContent)
    }
  }

  const handleViewListing = () => {
    if (conversation?.listingId) {
      router.push(`/listing/${conversation.listingId}`)
    }
  }

  // Format timestamp
  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
    return (
      date.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    )
  }

  const renderMessage = ({ item }: { item: Doc<"messages"> }) => {
    const isMe = item.senderId === userId

    return (
      <View
        style={[
          themed($messageContainer),
          isMe ? themed($messageContainerMe) : themed($messageContainerOther),
        ]}
      >
        <View
          style={[
            themed($messageBubble),
            isMe ? themed($messageBubbleMe) : themed($messageBubbleOther),
          ]}
        >
          <Text
            text={item.content}
            style={[themed($messageText), isMe && themed($messageTextMe)]}
          />
        </View>
        <Text text={formatMessageTime(item.createdAt)} style={themed($messageTime)} />
      </View>
    )
  }

  const renderEmptyState = () => (
    <View style={themed($emptyContainer)}>
      <Text text="No messages yet" style={themed($emptyTitle)} />
      <Text text="Send a message to start the conversation." style={themed($emptySubtitle)} />
    </View>
  )

  // Loading state
  if (conversation === undefined || messages === undefined) {
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
        <View style={themed($header)}>
          <Pressable onPress={handleBack} style={themed($backButton)}>
            <Icon icon="back" size={24} color={theme.colors.text} />
          </Pressable>
          <View style={themed($headerInfo)}>
            <Text text="Loading..." style={themed($headerTitle)} />
          </View>
        </View>
        <View style={themed($loadingContainer)}>
          <ActivityIndicator size="large" color={theme.colors.tint} />
        </View>
      </Screen>
    )
  }

  // Not found state
  if (conversation === null) {
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
        <View style={themed($header)}>
          <Pressable onPress={handleBack} style={themed($backButton)}>
            <Icon icon="back" size={24} color={theme.colors.text} />
          </Pressable>
          <View style={themed($headerInfo)}>
            <Text text="Conversation not found" style={themed($headerTitle)} />
          </View>
        </View>
        <View style={themed($emptyContainer)}>
          <Text
            text="This conversation doesn't exist or you don't have access to it."
            style={themed($emptySubtitle)}
          />
        </View>
      </Screen>
    )
  }

  // Reverse messages for inverted FlatList (newest at bottom)
  const reversedMessages = [...messages].reverse()

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      {/* Header */}
      <View style={themed($header)}>
        <Pressable onPress={handleBack} style={themed($backButton)}>
          <Icon icon="back" size={24} color={theme.colors.text} />
        </Pressable>
        <View style={themed($headerInfo)}>
          <View style={themed($headerAvatar)}>
            {conversation.listingThumbnail ? (
              <Image
                source={{ uri: conversation.listingThumbnail }}
                style={themed($headerAvatarImage)}
              />
            ) : (
              <Text
                text={conversation.otherUserName.charAt(0).toUpperCase()}
                style={themed($avatarText)}
              />
            )}
          </View>
          <View style={themed($headerText)}>
            <Text
              text={conversation.otherUserName}
              style={themed($headerTitle)}
              numberOfLines={1}
            />
            <Pressable onPress={handleViewListing}>
              <Text
                text={`Re: ${conversation.listingTitle}`}
                style={themed($headerSubtitle)}
                numberOfLines={1}
              />
            </Pressable>
          </View>
        </View>
        <Pressable style={themed($headerAction)} onPress={handleViewListing}>
          <Icon icon="image" size={24} color={theme.colors.text} />
        </Pressable>
      </View>

      {/* Messages list */}
      <KeyboardAvoidingView
        style={themed($keyboardAvoid)}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={reversedMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item._id}
          contentContainerStyle={themed($messagesList)}
          showsVerticalScrollIndicator={false}
          inverted
          ListEmptyComponent={renderEmptyState}
        />

        {/* Message input */}
        <View style={[themed($inputContainer), { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TextInput
            style={themed($input)}
            placeholder="Type a message..."
            placeholderTextColor={theme.colors.textDim}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={500}
          />
          <Pressable
            style={[themed($sendButton), !message.trim() && themed($sendButtonDisabled)]}
            onPress={handleSend}
            disabled={!message.trim()}
          >
            <Icon
              icon="caretRight"
              size={20}
              color={message.trim() ? theme.colors.palette.neutral100 : theme.colors.textDim}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $header: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})

const $backButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.palette.neutral100,
  justifyContent: "center",
  alignItems: "center",
  marginRight: spacing.sm,
})

const $headerInfo: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
})

const $headerAvatar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.palette.primary200,
  justifyContent: "center",
  alignItems: "center",
  marginRight: spacing.sm,
  overflow: "hidden",
})

const $headerAvatarImage: ThemedStyle<ViewStyle> = () => ({
  width: 40,
  height: 40,
})

const $loadingContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $avatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.tint,
})

const $headerText: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $headerTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.text,
})

const $headerSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.tint,
})

const $headerAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.xs,
})

const $keyboardAvoid: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $messagesList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  flexGrow: 1,
})

const $messageContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginVertical: spacing.xs,
})

const $messageContainerMe: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
})

const $messageContainerOther: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-start",
})

const $messageBubble: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  maxWidth: "75%",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: 18,
})

const $messageBubbleMe: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
  borderBottomRightRadius: 4,
})

const $messageBubbleOther: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral100,
  borderBottomLeftRadius: 4,
})

const $messageText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 15,
  color: colors.text,
  lineHeight: 20,
})

const $messageTextMe: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $messageTime: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 11,
  color: colors.textDim,
  marginTop: spacing.xxs,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: spacing.xl,
  transform: [{ scaleY: -1 }], // Because list is inverted
})

const $emptyTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.textDim,
  textAlign: "center",
})

const $emptySubtitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  fontSize: 14,
  color: colors.textDim,
  textAlign: "center",
  marginTop: spacing.xs,
})

const $inputContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-end",
  paddingHorizontal: spacing.md,
  paddingTop: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
  backgroundColor: colors.background,
})

const $input: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  flex: 1,
  minHeight: 40,
  maxHeight: 100,
  backgroundColor: colors.palette.neutral100,
  borderRadius: 20,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  fontSize: 15,
  color: colors.text,
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
  backgroundColor: colors.palette.neutral200,
})

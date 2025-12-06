import {
  View,
  ViewStyle,
  TextStyle,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
} from "react-native"
import { router } from "expo-router"
import { useQuery } from "convex/react"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAuth } from "@/context/AuthContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

// Type for the enriched conversation from Convex
type ConversationWithMetadata = {
  _id: Id<"conversations">
  _creationTime: number
  listingId: Id<"listings">
  buyerId: string
  sellerId: string
  lastMessageAt: number
  lastMessagePreview?: string
  listingTitle: string
  listingThumbnail?: string
  otherUserName: string
  otherUserImage?: string
  unreadCount: number
}

export default function MessagesScreen() {
  const { themed, theme } = useAppTheme()
  const { isAuthenticated } = useAuth()

  // Fetch conversations from Convex
  const conversations = useQuery(api.conversations.list, isAuthenticated ? {} : "skip")

  const handleConversationPress = (conversationId: Id<"conversations">) => {
    router.push(`/messages/${conversationId}`)
  }

  // Format timestamp to relative time
  const formatTimestamp = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`

    return new Date(timestamp).toLocaleDateString()
  }

  const renderConversation = ({ item }: { item: ConversationWithMetadata }) => (
    <Pressable
      style={({ pressed }) => [
        themed($conversationCard),
        pressed && themed($conversationCardPressed),
      ]}
      onPress={() => handleConversationPress(item._id)}
    >
      <View style={themed($avatar)}>
        {item.listingThumbnail ? (
          <Image source={{ uri: item.listingThumbnail }} style={themed($avatarImage)} />
        ) : (
          <Text text={item.otherUserName.charAt(0).toUpperCase()} style={themed($avatarText)} />
        )}
      </View>
      <View style={themed($conversationContent)}>
        <View style={themed($conversationHeader)}>
          <Text text={item.otherUserName} style={themed($userName)} numberOfLines={1} />
          <Text text={formatTimestamp(item.lastMessageAt)} style={themed($timestamp)} />
        </View>
        <Text text={item.listingTitle} style={themed($listingTitle)} numberOfLines={1} />
        <Text
          text={item.lastMessagePreview || "Start a conversation..."}
          style={[themed($lastMessage), item.unreadCount > 0 && themed($unreadMessage)]}
          numberOfLines={1}
        />
      </View>
      {item.unreadCount > 0 && (
        <View style={themed($unreadBadge)}>
          <Text text={String(item.unreadCount)} style={themed($unreadBadgeText)} />
        </View>
      )}
    </Pressable>
  )

  const renderEmptyState = () => (
    <View style={themed($emptyContainer)}>
      <Text text="No messages yet" preset="heading" style={themed($emptyTitle)} />
      <Text
        text="When you contact a seller or someone messages you about a listing, conversations will appear here."
        style={themed($emptySubtitle)}
      />
    </View>
  )

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($container)}>
      <View style={themed($header)}>
        <Text text="Messages" preset="heading" />
      </View>

      {conversations === undefined ? (
        <View style={themed($loadingContainer)}>
          <ActivityIndicator size="large" color={theme.colors.tint} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item._id}
          contentContainerStyle={themed($listContainer)}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmptyState}
        />
      )}
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
})

const $listContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  flexGrow: 1,
})

const $conversationCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
  padding: spacing.md,
  marginBottom: spacing.sm,
})

const $conversationCardPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
})

const $avatar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 50,
  height: 50,
  borderRadius: 25,
  backgroundColor: colors.palette.primary200,
  justifyContent: "center",
  alignItems: "center",
  marginRight: spacing.md,
})

const $avatarImage: ThemedStyle<ViewStyle> = () => ({
  width: 50,
  height: 50,
  borderRadius: 25,
})

const $avatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 20,
  fontWeight: "600",
  color: colors.tint,
})

const $conversationContent: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $conversationHeader: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
})

const $userName: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.text,
  flex: 1,
})

const $timestamp: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 12,
  color: colors.textDim,
})

const $listingTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 13,
  color: colors.tint,
  marginTop: 2,
})

const $lastMessage: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 14,
  color: colors.textDim,
  marginTop: 2,
})

const $unreadMessage: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontWeight: "500",
})

const $unreadBadge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minWidth: 20,
  height: 20,
  borderRadius: 10,
  backgroundColor: colors.tint,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: 6,
  marginLeft: 8,
})

const $unreadBadgeText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 11,
  fontWeight: "600",
  color: colors.palette.neutral100,
})

const $loadingContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: spacing.xl,
})

const $emptyTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})

const $emptySubtitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  textAlign: "center",
  marginTop: spacing.sm,
})

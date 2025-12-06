import { Tabs, router } from "expo-router"
import { View, ViewStyle, Pressable, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Icon, IconTypes } from "@/components/Icon"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"

// Custom sell button component (the big red plus)
// Now navigates to the dedicated sell flow instead of tab content
function SellButton({ onPress }: { onPress: () => void }) {
  const { theme } = useAppTheme()

  const handlePress = () => {
    // Navigate to the dedicated sell flow
    router.push("/sell")
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.sellButton,
        { backgroundColor: theme.colors.error },
        pressed && styles.sellButtonPressed,
      ]}
    >
      <Icon icon="plus" size={28} color="#FFFFFF" />
    </Pressable>
  )
}

export default function TabLayout() {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.tint,
        tabBarInactiveTintColor: theme.colors.textDim,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Icon icon="house" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: "Categories",
          tabBarIcon: ({ color, size }) => <Icon icon="squaresFour" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: "",
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <View style={styles.sellButtonContainer}>
              <SellButton onPress={() => props.onPress?.(undefined as any)} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => <Icon icon="chatCircle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Me",
          tabBarIcon: ({ color, size }) => <Icon icon="user" color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  sellButtonContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: -20,
  },
  sellButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  sellButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.95 }],
  },
})

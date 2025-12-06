import { ComponentType } from "react"
import {
  StyleProp,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
  ViewStyle,
} from "react-native"
import {
  ArrowLeft,
  Bell,
  CaretLeft,
  CaretRight,
  Check,
  ChatCircle,
  Clock,
  Desktop,
  DotsThree,
  DotsThreeVertical,
  DotsThreeCircle,
  Eye,
  EyeSlash,
  GearSix,
  Gift,
  House,
  Image as ImageIcon,
  List,
  Lock,
  MagnifyingGlass,
  Plus,
  Robot,
  ShareNetwork,
  SquaresFour,
  User,
  X,
  Book,
  Couch,
  TShirt,
  Bed,
  Basketball,
  Ticket,
  Wrench,
  ShoppingBag,
  Package,
  Heart,
  Bug,
  type Icon as _PhosphorIconType,
} from "phosphor-react-native"

import { useAppTheme } from "@/theme/context"

// Icon registry mapping icon names to Phosphor icon components
export const iconRegistry = {
  // Navigation
  back: ArrowLeft,
  caretLeft: CaretLeft,
  caretRight: CaretRight,

  // Actions
  check: Check,
  x: X,
  plus: Plus,

  // UI Elements
  bell: Bell,
  settings: GearSix,
  menu: List,
  more: DotsThree,
  moreVertical: DotsThreeVertical,
  share: ShareNetwork,

  // Visibility
  hidden: EyeSlash,
  view: Eye,

  // Security
  lock: Lock,

  // Content
  image: ImageIcon,

  // Tab Navigation (new)
  house: House,
  squaresFour: SquaresFour,
  chatCircle: ChatCircle,
  user: User,

  // Search
  magnifyingGlass: MagnifyingGlass,
  clock: Clock,

  // Categories
  desktop: Desktop,
  book: Book,
  couch: Couch,
  tShirt: TShirt,
  bed: Bed,
  basketball: Basketball,
  ticket: Ticket,
  gift: Gift,
  wrench: Wrench,
  dotsThreeCircle: DotsThreeCircle,

  // Additional icons
  shoppingBag: ShoppingBag,
  package: Package,
  heart: Heart,
  bug: Bug,
  ladybug: Bug, // Legacy support
  robot: Robot, // AI Assistant

  // Legacy support - map old names to new icons
  search: MagnifyingGlass,
} as const

export type IconTypes = keyof typeof iconRegistry

type BaseIconProps = {
  /**
   * The name of the icon
   */
  icon: IconTypes

  /**
   * An optional tint color for the icon
   */
  color?: string

  /**
   * An optional size for the icon. If not provided, defaults to 24.
   */
  size?: number

  /**
   * Style overrides for the icon container
   */
  containerStyle?: StyleProp<ViewStyle>

  /**
   * Style overrides for the icon itself (applied to SVG)
   */
  style?: StyleProp<ViewStyle>
}

type PressableIconProps = Omit<TouchableOpacityProps, "style"> & BaseIconProps
type IconProps = Omit<ViewProps, "style"> & BaseIconProps

/**
 * A component to render a registered icon.
 * It is wrapped in a <TouchableOpacity />
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/app/components/Icon/}
 * @param {PressableIconProps} props - The props for the `PressableIcon` component.
 * @returns {JSX.Element} The rendered `PressableIcon` component.
 */
export function PressableIcon(props: PressableIconProps) {
  const {
    icon,
    color,
    size = 24,
    containerStyle: $containerStyleOverride,
    style: $iconStyleOverride,
    ...pressableProps
  } = props

  const { theme } = useAppTheme()

  const IconComponent = iconRegistry[icon] as ComponentType<{
    size?: number
    color?: string
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"
    style?: StyleProp<ViewStyle>
  }>

  return (
    <TouchableOpacity {...pressableProps} style={$containerStyleOverride}>
      <IconComponent
        size={size}
        color={color ?? theme.colors.text}
        weight="regular"
        style={$iconStyleOverride}
      />
    </TouchableOpacity>
  )
}

/**
 * A component to render a registered icon.
 * It is wrapped in a <View />, use `PressableIcon` if you want to react to input
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/app/components/Icon/}
 * @param {IconProps} props - The props for the `Icon` component.
 * @returns {JSX.Element} The rendered `Icon` component.
 */
export function Icon(props: IconProps) {
  const {
    icon,
    color,
    size = 24,
    containerStyle: $containerStyleOverride,
    style: $iconStyleOverride,
    ...viewProps
  } = props

  const { theme } = useAppTheme()

  const IconComponent = iconRegistry[icon] as ComponentType<{
    size?: number
    color?: string
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"
    style?: StyleProp<ViewStyle>
  }>

  return (
    <View {...viewProps} style={$containerStyleOverride}>
      <IconComponent
        size={size}
        color={color ?? theme.colors.text}
        weight="regular"
        style={$iconStyleOverride}
      />
    </View>
  )
}

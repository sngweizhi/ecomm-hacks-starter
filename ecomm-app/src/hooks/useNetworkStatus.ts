import { useCallback, useSyncExternalStore } from "react"
import NetInfo, { NetInfoState, NetInfoStateType } from "@react-native-community/netinfo"

export interface NetworkStatus {
  /** Whether the device is currently online */
  isOnline: boolean
  /** The type of connection (wifi, cellular, etc.) */
  connectionType: NetInfoStateType
  /** Whether we're connected via wifi */
  isWifi: boolean
  /** Whether we're connected via cellular */
  isCellular: boolean
  /** Manually refresh the network status */
  refresh: () => Promise<void>
}

type OnlineTransitionCallback = () => void

/** Callbacks to run when transitioning from offline to online */
const onlineTransitionCallbacks: Set<OnlineTransitionCallback> = new Set()

/**
 * Register a callback to be called when the device transitions from offline to online
 */
export function onOnlineTransition(callback: OnlineTransitionCallback): () => void {
  onlineTransitionCallbacks.add(callback)
  return () => {
    onlineTransitionCallbacks.delete(callback)
  }
}

/**
 * Trigger all online transition callbacks
 */
function triggerOnlineTransition() {
  onlineTransitionCallbacks.forEach((callback) => {
    try {
      callback()
    } catch (error) {
      console.error("[NetworkStatus] Error in online transition callback:", error)
    }
  })
}

// ============================================================================
// Singleton network state management
// ============================================================================

interface NetworkState {
  isOnline: boolean
  connectionType: NetInfoStateType
}

/** Singleton network state */
let networkState: NetworkState = {
  isOnline: true,
  connectionType: NetInfoStateType.unknown,
}

/** Whether we've initialized the singleton subscription */
let isInitialized = false

/** Subscribers to network state changes */
const subscribers: Set<() => void> = new Set()

/** Previous online state for transition detection */
let wasOnline = true

/**
 * Initialize the singleton NetInfo subscription
 */
function initializeNetworkSubscription() {
  if (isInitialized) return
  isInitialized = true

  // Get initial state
  NetInfo.fetch().then(handleNetworkChange)

  // Subscribe to network changes (singleton - only one subscription)
  NetInfo.addEventListener(handleNetworkChange)

  if (__DEV__) {
    console.log("[NetworkStatus] Singleton subscription initialized")
  }
}

/**
 * Handle network state changes with deduplication
 */
function handleNetworkChange(state: NetInfoState) {
  const nowOnline = state.isConnected === true && state.isInternetReachable !== false
  const newConnectionType = state.type

  // Only update if values actually changed (deduplication)
  if (networkState.isOnline === nowOnline && networkState.connectionType === newConnectionType) {
    return // No change, skip update
  }

  const previouslyOnline = wasOnline

  // Update singleton state
  networkState = {
    isOnline: nowOnline,
    connectionType: newConnectionType,
  }
  wasOnline = nowOnline

  // Detect offline -> online transition
  if (nowOnline && !previouslyOnline) {
    if (__DEV__) {
      console.log("[NetworkStatus] Back online, triggering callbacks...")
    }
    triggerOnlineTransition()
  }

  if (__DEV__) {
    console.log("[NetworkStatus] Connection changed:", {
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
      isOnline: nowOnline,
    })
  }

  // Notify all subscribers
  subscribers.forEach((callback) => callback())
}

/**
 * Subscribe to network state changes (for useSyncExternalStore)
 */
function subscribe(callback: () => void): () => void {
  // Initialize on first subscription
  initializeNetworkSubscription()

  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

/**
 * Get current network state snapshot (for useSyncExternalStore)
 */
function getSnapshot(): NetworkState {
  return networkState
}

/**
 * Hook to monitor network connectivity status
 */
export function useNetworkStatus(): NetworkStatus {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const refresh = useCallback(async () => {
    const netState = await NetInfo.refresh()
    handleNetworkChange(netState)
  }, [])

  return {
    isOnline: state.isOnline,
    connectionType: state.connectionType,
    isWifi: state.connectionType === NetInfoStateType.wifi,
    isCellular: state.connectionType === NetInfoStateType.cellular,
    refresh,
  }
}

/**
 * Get current network status (non-hook version for use outside React)
 */
export async function getNetworkStatus(): Promise<{
  isOnline: boolean
  connectionType: NetInfoStateType
}> {
  const state = await NetInfo.fetch()
  return {
    isOnline: state.isConnected === true && state.isInternetReachable !== false,
    connectionType: state.type,
  }
}

/**
 * Check if currently online (simple boolean check)
 */
export async function isOnline(): Promise<boolean> {
  const status = await getNetworkStatus()
  return status.isOnline
}

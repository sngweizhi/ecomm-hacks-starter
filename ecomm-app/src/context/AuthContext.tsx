import { createContext, FC, PropsWithChildren, useContext, useCallback } from "react"
import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/clerk-expo"

export type AuthContextType = {
  isAuthenticated: boolean
  isLoaded: boolean
  userId?: string | null
  userEmail?: string | null
  userName?: string | null
  userImageUrl?: string | null
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)

export interface AuthProviderProps {}

export const AuthProvider: FC<PropsWithChildren<AuthProviderProps>> = ({ children }) => {
  const { isSignedIn, isLoaded, userId } = useClerkAuth()
  const { signOut } = useClerk()
  const { user } = useUser()

  const logout = useCallback(async () => {
    await signOut()
  }, [signOut])

  const value: AuthContextType = {
    isAuthenticated: !!isSignedIn,
    isLoaded,
    userId,
    userEmail: user?.primaryEmailAddress?.emailAddress,
    userName: user?.fullName ?? user?.firstName,
    userImageUrl: user?.imageUrl,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}

import Taro from "@tarojs/taro"

declare const API_BASE_URL: string
declare const DEV_AUTH_ENABLED: boolean
declare const TASK_DEBUG: boolean
const BASE_URL: string =
  typeof API_BASE_URL !== "undefined" && API_BASE_URL
    ? API_BASE_URL
    : process.env.NODE_ENV === "production"
      ? ""
      : "http://localhost:3000"

let loginPromise: Promise<{ token: string; userId: string } | null> | null = null

export async function loginWeapp() {
  // WeApp only: obtain code then exchange on server
  try {
    const { code, errMsg } = await Taro.login()
    if (TASK_DEBUG) {
      console.log("weapp login result", { code, errMsg })
    }
    if (!code) throw new Error("no code")
    const res = await Taro.request<{ token: string; userId: string }>({
      url: `${BASE_URL}/api/auth/weapp/login`,
      method: "POST",
      data: { code },
      header: { "Content-Type": "application/json" },
    })
    if ((res.data as any).token) {
      Taro.setStorageSync("token", (res.data as any).token)
      if ((res.data as any).userId) Taro.setStorageSync("userId", (res.data as any).userId)
    }
    return res.data
  } catch (e) {
    console.error("loginWeapp failed", e)
    throw e
  }
}

export async function devLoginWeapp(userId: string, secret?: string) {
  const trimmed = String(userId || "").trim()
  if (!trimmed) throw new Error("userId is required")

  const res = await Taro.request<{ token: string; userId: string }>({
    url: `${BASE_URL}/api/auth/dev/login`,
    method: "POST",
    data: { userId: trimmed },
    header: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Dev-Login-Secret": secret } : {}),
    },
  })

  if ((res.data as any).token) {
    Taro.setStorageSync("token", (res.data as any).token)
    if ((res.data as any).userId) Taro.setStorageSync("userId", (res.data as any).userId)
    Taro.setStorageSync("devUserId", trimmed)
  }

  return res.data
}

export async function ensureWeappLogin() {
  const existing = getToken()
  if (TASK_DEBUG) {
    console.log("ensureWeappLogin start", {
      hasToken: Boolean(existing),
      hasPromise: Boolean(loginPromise),
      devAuth: DEV_AUTH_ENABLED,
    })
  }
  if (existing) return existing
  if (process.env.TARO_ENV !== "weapp") return ""

  if (!loginPromise) {
    const devUserId = DEV_AUTH_ENABLED ? getDevUserId() : ""
    loginPromise = (devUserId ? devLoginWeapp(devUserId) : loginWeapp())
      .catch((e) => {
        console.error("ensureWeappLogin failed", e)
        return null
      })
      .finally(() => {
        loginPromise = null
      })
  }

  await loginPromise
  if (TASK_DEBUG) {
    console.log("ensureWeappLogin done", {
      hasToken: Boolean(getToken()),
    })
  }
  return getToken()
}

export function getToken() {
  try {
    return Taro.getStorageSync("token")
  } catch {
    return ""
  }
}

export function getUserId() {
  try {
    return Taro.getStorageSync("userId")
  } catch {
    return ""
  }
}

export function getDevUserId() {
  try {
    return Taro.getStorageSync("devUserId")
  } catch {
    return ""
  }
}

export function logoutWeapp() {
  try {
    Taro.removeStorageSync("token")
    Taro.removeStorageSync("userId")
    Taro.removeStorageSync("devUserId")
  } catch {
    // ignore storage errors
  }
}

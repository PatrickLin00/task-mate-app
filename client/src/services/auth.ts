import Taro from '@tarojs/taro'

export async function loginWeapp() {
  // WeApp only: obtain code then exchange on server
  try {
    const { code } = await Taro.login()
    if (!code) throw new Error('no code')
    const API_BASE_URL: string = (globalThis as any).API_BASE_URL || ''
    const res = await Taro.request<{ token: string; openid: string }>({
      url: `${API_BASE_URL}/api/auth/weapp/login`,
      method: 'POST',
      data: { code },
      header: { 'Content-Type': 'application/json' },
    })
    if ((res.data as any).token) {
      Taro.setStorageSync('token', (res.data as any).token)
    }
    return res.data
  } catch (e) {
    console.error('loginWeapp failed', e)
    throw e
  }
}

export function getToken() {
  try { return Taro.getStorageSync('token') } catch { return '' }
}


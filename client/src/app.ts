import type { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'

import './app.scss'
import { loginWeapp } from '@/services/auth'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(async () => {
    console.log('App launched.')
    try {
      if (process.env.TARO_ENV === 'weapp') {
        await loginWeapp()
      }
    } catch (e) {
      console.warn('WeApp login skipped or failed:', e)
    }
  })

  return children
}

export default App

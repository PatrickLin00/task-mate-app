import type { UserConfigExport } from '@tarojs/cli'

const config: UserConfigExport<'vite'> = {
  mini: {
    enableSourceMap: false,
  },
  vite: {
    build: {
      sourcemap: false,
    },
  },
}

export default config

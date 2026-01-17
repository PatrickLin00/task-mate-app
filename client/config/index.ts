import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import fs from 'fs'
import path from 'path'

import devConfig from './dev'
import prodConfig from './prod'

const readEnvFile = (filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) return {} as Record<string, string>
    const text = fs.readFileSync(filePath, 'utf8')
    const out: Record<string, string> = {}
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const idx = line.indexOf('=')
      if (idx <= 0) continue
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim()
      if (!key) continue
      out[key] = val
    }
    return out
  } catch {
    return {} as Record<string, string>
  }
}

// https://taro-docs.jd.com/docs/next/config#defineconfig
export default defineConfig<'vite'>(async (merge, { command, mode }) => {
  const fileEnv = {
    ...readEnvFile(path.resolve(__dirname, '..', '.env')),
    ...readEnvFile(path.resolve(__dirname, '..', `.env.${mode}`)),
  }
  const getEnvValue = (key: string) => process.env[key] ?? fileEnv[key]
  const appId = getEnvValue('TARO_APP_ID')
  const devAuthEnabled =
    String(getEnvValue('DEV_AUTH_ENABLED') || getEnvValue('TASKMATE_DEV_AUTH_ENABLED') || '').toLowerCase() ===
    'true'
  const taskDebug =
    String(getEnvValue('TARO_APP_TASK_DEBUG') || '').toLowerCase() === 'true'
  const taskMemReport =
    String(getEnvValue('TARO_APP_TASK_MEM_REPORT') || '').toLowerCase() === 'true'
  const subscribeTplTodo = getEnvValue('TARO_APP_SUBSCRIBE_TPL_TODO') || ''
  const subscribeTplTaskUpdate = getEnvValue('TARO_APP_SUBSCRIBE_TPL_TASK_UPDATE') || ''
  const subscribeTplReview = getEnvValue('TARO_APP_SUBSCRIBE_TPL_REVIEW') || ''
  const subscribeTplWork = getEnvValue('TARO_APP_SUBSCRIBE_TPL_WORK') || ''
  const appNameLabel = getEnvValue('TARO_APP_NAME') || ''
  const operatorName = getEnvValue('TARO_APP_OPERATOR') || ''
  const supportContact = getEnvValue('TARO_APP_SUPPORT_CONTACT') || ''
  const legalTerms = getEnvValue('TARO_APP_LEGAL_TERMS') || ''
  const legalPrivacy = getEnvValue('TARO_APP_LEGAL_PRIVACY') || ''
  const devAuth = process.env.NODE_ENV === 'production' ? false : devAuthEnabled
  const apiBaseUrl =
    getEnvValue('TASKMATE_API_BASE_URL') ||
    getEnvValue('TARO_APP_API_BASE_URL') ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000')
  const baseConfig: UserConfigExport<'vite'> = {
    appId: appId || undefined,
    projectName: 'client',
    date: '2025-11-1',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [
      "@tarojs/plugin-generator"
    ],
    alias: {
      '@': path.resolve(__dirname, '..', 'src'),
    },
    defineConstants: {
      API_BASE_URL: JSON.stringify(apiBaseUrl),
      DEV_AUTH_ENABLED: JSON.stringify(devAuth),
      TASK_DEBUG: JSON.stringify(taskDebug),
      TASK_MEM_REPORT: JSON.stringify(taskMemReport),
      SUBSCRIBE_TPL_TODO: JSON.stringify(subscribeTplTodo),
      SUBSCRIBE_TPL_TASK_UPDATE: JSON.stringify(subscribeTplTaskUpdate),
      SUBSCRIBE_TPL_REVIEW: JSON.stringify(subscribeTplReview),
      SUBSCRIBE_TPL_WORK: JSON.stringify(subscribeTplWork),
      APP_NAME: JSON.stringify(appNameLabel),
      APP_OPERATOR: JSON.stringify(operatorName),
      APP_SUPPORT_CONTACT: JSON.stringify(supportContact),
      APP_LEGAL_TERMS: JSON.stringify(legalTerms),
      APP_LEGAL_PRIVACY: JSON.stringify(legalPrivacy),
    },
    copy: {
      patterns: [
        {
          from: 'src/assets',
          to: 'dist/assets',
        },
      ],
      options: {},
    },
    framework: 'react',
    compiler: 'vite',
      mini: {
      imageUrlLoaderOption: {
        // Disable automatic base64 inlining for large images.
        limit: 0,
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {

          }
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',

      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: false,
        }
      }
    }
  }


  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})

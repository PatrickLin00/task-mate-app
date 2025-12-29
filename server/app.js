const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '.env') })
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')

const taskRoutes = require('./routes/taskRoutes')
const authRoutes = require('./routes/authRoutes')
const aiRoutes = require('./routes/aiRoutes')
const { ensureDevScenarioTasks } = require('./utils/seedTasks')
const { migrateUserIds } = require('./utils/migrateLegacyIds')
const { migrateTaskIds } = require('./utils/migrateLegacyTaskIds')
const { cleanupLegacyTestTasks } = require('./utils/cleanupDevData')

const app = express()

// Middleware
const rawCorsOrigin = process.env.CORS_ORIGIN
const corsOrigin = rawCorsOrigin
  ? rawCorsOrigin.split(',').map((item) => item.trim()).filter(Boolean)
  : true
app.use(cors({ origin: corsOrigin }))
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    mongoHost: getMongoHost(process.env.MONGODB_URI),
  })
})

// Routes
app.use('/api/tasks', taskRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/ai', aiRoutes)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

// Global error handler
// TODO: Add structured error types and logging/reporting integration
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' })
})

const getMongoHost = (uri) => {
  if (!uri) return 'unknown'
  try {
    const parsed = new URL(uri)
    return parsed.host || 'unknown'
  } catch (err) {
    const cleaned = uri.replace(/^mongodb\+srv:\/\//, '').replace(/^mongodb:\/\//, '')
    const withoutCreds = cleaned.replace(/^[^@]*@/, '')
    const host = withoutCreds.split('/')[0].split('?')[0]
    return host || 'unknown'
  }
}

const start = async () => {
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    console.error('MONGODB_URI is not set')
    process.exit(1)
  }

  try {
    await mongoose.connect(mongoUri)
    console.log('MongoDB connected')
    console.log(`MongoDB host: ${getMongoHost(mongoUri)}`)

    try {
      await migrateUserIds()
      await migrateTaskIds()

      const isDev = process.env.NODE_ENV !== 'production'
      const devAuthEnabled = String(process.env.DEV_AUTH_ENABLED || '').toLowerCase() === 'true'
      const cleanupEnabled = String(process.env.DEV_CLEANUP_LEGACY_TEST_TASKS || '').toLowerCase() !== 'false'

      if (isDev && devAuthEnabled && cleanupEnabled) {
        const cleaned = await cleanupLegacyTestTasks()
        if (cleaned.deleted > 0) console.log(`Deleted ${cleaned.deleted} legacy test tasks`)
      } else if (String(process.env.DEV_RESET_TEST_TASKS || '').toLowerCase() === 'true') {
        const cleaned = await cleanupLegacyTestTasks()
        if (cleaned.deleted > 0) console.log(`Deleted ${cleaned.deleted} legacy test tasks`)
      }

      if (devAuthEnabled) {
        const scenario = await ensureDevScenarioTasks()
        if (scenario.inserted > 0) console.log(`Seeded ${scenario.inserted} dev scenario tasks`)
      }
    } catch (err) {
      console.error('Seed tasks error:', err)
    }

    const PORT = process.env.PORT || 3000
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('MongoDB connection error:', err)
    process.exit(1)
  }
}

void start()

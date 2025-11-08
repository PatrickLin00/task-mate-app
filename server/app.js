require('dotenv').config()
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')

const taskRoutes = require('./routes/taskRoutes')
const authRoutes = require('./routes/authRoutes')

const app = express()

// Connect database
// TODO: Configure retry/timeout/logging as needed (pending ops requirements)
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err))

// Middleware
app.use(cors({
  // In dev allow any origin; tighten in production
  // TODO: Restrict CORS origins in production (pending frontend domain)
  origin: process.env.CORS_ORIGIN || true,
}))
app.use(express.json())

// Routes
app.use('/api/tasks', taskRoutes)
app.use('/api/auth', authRoutes)

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

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})

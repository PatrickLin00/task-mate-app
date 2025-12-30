const axios = require('axios')
const https = require('https')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { ensureDevScenarioTasks } = require('../utils/seedTasks')

// POST /api/auth/weapp/login
// body: { code }
// TODO: rate limit & better error mapping (pending ops/security)
const normalizeDevUserId = (raw) => {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return ''
  if (v.startsWith('dev:')) return v
  if (v.includes(':')) return ''
  return `dev:${v}`
}

const normalizeWxUserId = (openid) => {
  const v = typeof openid === 'string' ? openid.trim() : ''
  if (!v) return ''
  return `wx:${v}`
}

const buildWeappRequestOptions = () => {
  const insecure = String(process.env.WEAPP_TLS_INSECURE || '').toLowerCase() === 'true'
  const base = { proxy: false }
  if (!insecure) return base
  return { ...base, httpsAgent: new https.Agent({ rejectUnauthorized: false }) }
}

exports.loginWeapp = async (req, res) => {
  try {
    const { code } = req.body || {}
    if (!code) return res.status(400).json({ error: 'code is required' })

    const appid = process.env.WEAPP_APPID
    const secret = process.env.WEAPP_SECRET
    if (!appid || !secret) {
      if (process.env.NODE_ENV !== 'production') {
        const userId = normalizeDevUserId('dev-openid')
        let user = await User.findOne({ userId })
        if (!user) user = await User.create({ userId })

        try {
          await ensureDevScenarioTasks()
        } catch (err) {
          console.error('seed test tasks error:', err)
        }

        const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '15d' })
        return res.json({ token, userId })
      }
      return res.status(500).json({ error: 'WeApp credentials not configured' })
    }

    const url = 'https://api.weixin.qq.com/sns/jscode2session'
    const params = { appid, secret, js_code: code, grant_type: 'authorization_code' }
    const { data } = await axios.get(url, { params, ...buildWeappRequestOptions() })
    if (data.errcode) {
      return res.status(400).json({ error: 'jscode2session failed', detail: data })
    }

    const { openid /*, session_key, unionid */ } = data
    if (!openid) return res.status(400).json({ error: 'openid missing' })

    const userId = normalizeWxUserId(openid)
    let user = await User.findOne({ userId })
    if (!user) user = await User.create({ userId })

    if (process.env.NODE_ENV !== 'production') {
      try {
        await ensureDevScenarioTasks()
      } catch (err) {
        console.error('seed test tasks error:', err)
      }
    }

    const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '15d' })
    res.json({ token, userId })
  } catch (err) {
    console.error('loginWeapp error:', err)
    res.status(500).json({ error: 'login failed' })
  }
}

// POST /api/auth/weapp/profile
// body: { nickname, avatar }
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ error: 'unauthorized' })
    const { nickname, avatar } = req.body || {}
    const updated = await User.findOneAndUpdate(
      { userId },
      { $set: { nickname, avatar } },
      { new: true }
    )
    res.json(updated)
  } catch (err) {
    console.error('updateProfile error:', err)
    res.status(500).json({ error: 'update profile failed' })
  }
}

exports.devLogin = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'not found' })
    if (String(process.env.DEV_AUTH_ENABLED || '').toLowerCase() !== 'true') {
      return res.status(404).json({ error: 'not found' })
    }

    const configured = process.env.DEV_LOGIN_SECRET
    if (configured) {
      const provided = req.headers['x-dev-login-secret']
      if (provided !== configured) return res.status(401).json({ error: 'unauthorized' })
    }

    const body = req.body || {}
    const userId = normalizeDevUserId(body.userId)
    if (!userId) return res.status(400).json({ error: 'userId is required' })

    let user = await User.findOne({ userId })
    if (!user) user = await User.create({ userId })

    try {
      await ensureDevScenarioTasks()
    } catch (err) {
      console.error('seed test tasks error:', err)
    }

    const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '15d' })
    return res.json({ token, userId })
  } catch (err) {
    console.error('devLogin error:', err)
    return res.status(500).json({ error: 'dev login failed' })
  }
}

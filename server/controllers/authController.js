const axios = require('axios')
const jwt = require('jsonwebtoken')
const User = require('../models/User')

// POST /api/auth/weapp/login
// body: { code }
// TODO: rate limit & better error mapping (pending ops/security)
exports.loginWeapp = async (req, res) => {
  try {
    const { code } = req.body || {}
    if (!code) return res.status(400).json({ error: 'code is required' })

    const appid = process.env.WEAPP_APPID
    const secret = process.env.WEAPP_SECRET
    if (!appid || !secret) {
      return res.status(500).json({ error: 'WeApp credentials not configured' })
    }

    const url = 'https://api.weixin.qq.com/sns/jscode2session'
    const params = { appid, secret, js_code: code, grant_type: 'authorization_code' }
    const { data } = await axios.get(url, { params })
    if (data.errcode) {
      return res.status(400).json({ error: 'jscode2session failed', detail: data })
    }

    const { openid /*, session_key, unionid */ } = data
    if (!openid) return res.status(400).json({ error: 'openid missing' })

    let user = await User.findOne({ openid })
    if (!user) user = await User.create({ openid })

    const token = jwt.sign({ sub: openid }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '15d' })
    res.json({ token, openid })
  } catch (err) {
    console.error('loginWeapp error:', err)
    res.status(500).json({ error: 'login failed' })
  }
}

// POST /api/auth/weapp/profile
// body: { nickname, avatar }
exports.updateProfile = async (req, res) => {
  try {
    const openid = req.user?.openid
    if (!openid) return res.status(401).json({ error: 'unauthorized' })
    const { nickname, avatar } = req.body || {}
    const updated = await User.findOneAndUpdate(
      { openid },
      { $set: { nickname, avatar } },
      { new: true }
    )
    res.json(updated)
  } catch (err) {
    console.error('updateProfile error:', err)
    res.status(500).json({ error: 'update profile failed' })
  }
}


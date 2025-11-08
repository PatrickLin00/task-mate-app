const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const authController = require('../controllers/authController')

router.post('/weapp/login', authController.loginWeapp)
router.post('/weapp/profile', auth, authController.updateProfile)

module.exports = router


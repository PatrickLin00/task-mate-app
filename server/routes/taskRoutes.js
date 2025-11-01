const express = require('express')
const router = express.Router()
const taskController = require('../controllers/taskController')

// 创建任务
router.post('/create', taskController.createTask)

// 获取所有任务
router.get('/', taskController.getAllTasks)

module.exports = router

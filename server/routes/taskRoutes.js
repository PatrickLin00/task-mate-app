const express = require('express')
const router = express.Router()
const taskController = require('../controllers/taskController')

// 创建任务
router.post('/', taskController.createTask)

// 获取任务列表（可按状态过滤）
router.get('/', taskController.getAllTasks)

// 更新进度
router.patch('/:id/progress', taskController.updateProgress)

// 完成任务
router.patch('/:id/complete', taskController.completeTask)

// 放弃任务
router.patch('/:id/abandon', taskController.abandonTask)

module.exports = router

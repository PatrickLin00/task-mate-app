const express = require('express')
const router = express.Router()
const taskController = require('../controllers/taskController')

// 创建任务
router.post('/create', taskController.createTask)

// 获取所有任务
router.get('/', taskController.getAllTasks)

// TODO: 以下路由待产品与权限规则明确后实现
// 获取单个任务详情
// router.get('/:id', taskController.getTaskById)
// 更新任务
// router.put('/:id', taskController.updateTask)
// 删除任务
// router.delete('/:id', taskController.deleteTask)
// 更新任务状态（如接取/完成）
// router.patch('/:id/status', taskController.updateTaskStatus)

module.exports = router

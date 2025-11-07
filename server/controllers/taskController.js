const Task = require('../models/Task')

exports.createTask = async (req, res) => {
  try {
    // TODO: 请求体验证（必填字段/长度/格式等）待定规范
    // TODO: 鉴权与将 createdBy 绑定到当前用户（待接入登录与用户体系）
    const task = new Task(req.body)
    await task.save()
    res.status(201).json(task)
  } catch (error) {
    console.error('createTask error:', error)
    res.status(500).json({ error: '任务创建失败' })
  }
}

exports.getAllTasks = async (req, res) => {
  try {
    // TODO: 支持按创建者/接取者/状态过滤与分页（待产品规则）
    const tasks = await Task.find()
    res.json(tasks)
  } catch (error) {
    console.error('getAllTasks error:', error)
    res.status(500).json({ error: '获取任务失败' })
  }
}

const Task = require('../models/Task')

exports.createTask = async (req, res) => {
  try {
    const task = new Task(req.body)
    await task.save()
    res.status(201).json(task)
  } catch (error) {
    res.status(500).json({ error: '任务创建失败' })
  }
}

exports.getAllTasks = async (req, res) => {
  const tasks = await Task.find()
  res.json(tasks)
}

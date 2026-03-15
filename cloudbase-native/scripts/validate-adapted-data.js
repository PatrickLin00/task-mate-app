const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const INPUT_DIR = path.join(ROOT, 'cloudbase-native', 'migration-output', 'adapted')

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(INPUT_DIR, name), 'utf8'))
}

function isIso(value) {
  if (value === null || value === '') return true
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && typeof value === 'string'
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message)
}

function validateUsers(users, errors) {
  users.forEach((user, index) => {
    const prefix = `users[${index}]`
    const onboarding = user && user.onboarding && typeof user.onboarding === 'object' ? user.onboarding : null
    const preferences = user && user.subscribePreferences && typeof user.subscribePreferences === 'object' ? user.subscribePreferences : null
    assert(typeof user._id === 'string' && user._id, `${prefix} missing _id`, errors)
    assert(typeof user.userId === 'string' && user.userId, `${prefix} missing userId`, errors)
    assert(!String(user.userId).startsWith('wx:'), `${prefix} userId still has wx: prefix`, errors)
    assert(typeof user.nickname === 'string', `${prefix} nickname must be string`, errors)
    assert(Boolean(onboarding), `${prefix} missing onboarding`, errors)
    if (onboarding) {
      assert(typeof onboarding.seen === 'boolean', `${prefix} onboarding.seen must be boolean`, errors)
      assert(isIso(onboarding.seenAt), `${prefix} onboarding.seenAt invalid`, errors)
    }
    assert(Boolean(preferences), `${prefix} missing subscribePreferences`, errors)
    ;['todo', 'taskUpdate', 'review', 'work'].forEach((scene) => {
      const current = preferences ? preferences[scene] : null
      assert(current && typeof current === 'object', `${prefix} missing subscribePreferences.${scene}`, errors)
      if (current && typeof current === 'object') {
        assert(typeof current.templateId === 'string', `${prefix} ${scene}.templateId must be string`, errors)
        assert(typeof current.status === 'string', `${prefix} ${scene}.status must be string`, errors)
        assert(isIso(current.updatedAt), `${prefix} ${scene}.updatedAt invalid`, errors)
        assert(isIso(current.authorizedAt), `${prefix} ${scene}.authorizedAt invalid`, errors)
        assert(isIso(current.lastSentAt), `${prefix} ${scene}.lastSentAt invalid`, errors)
      }
    })
    assert(isIso(user.createdAt), `${prefix} createdAt invalid`, errors)
    assert(isIso(user.updatedAt), `${prefix} updatedAt invalid`, errors)
  })
}

function validateTasks(tasks, errors) {
  const allowedStatus = ['pending', 'in_progress', 'review_pending', 'pending_confirmation', 'completed', 'closed', 'refactored']
  const allowedCategory = ['normal', 'challenge', 'system']
  tasks.forEach((task, index) => {
    const prefix = `tasks[${index}]`
    assert(typeof task._id === 'string' && task._id, `${prefix} missing _id`, errors)
    assert(typeof task.title === 'string', `${prefix} title must be string`, errors)
    assert(allowedStatus.includes(task.status), `${prefix} invalid status ${task.status}`, errors)
    assert(allowedCategory.includes(task.category), `${prefix} invalid category ${task.category}`, errors)
    assert(typeof task.creatorId === 'string', `${prefix} creatorId must be string`, errors)
    assert(!String(task.creatorId).startsWith('wx:'), `${prefix} creatorId still has wx: prefix`, errors)
    assert(!String(task.assigneeId || '').startsWith('wx:'), `${prefix} assigneeId still has wx: prefix`, errors)
    assert(typeof task.creatorName === 'string', `${prefix} creatorName must be string`, errors)
    assert(typeof task.assigneeName === 'string', `${prefix} assigneeName must be string`, errors)
    assert(typeof task.ownerScope === 'string', `${prefix} ownerScope must be string`, errors)
    assert(Array.isArray(task.subtasks), `${prefix} subtasks must be array`, errors)
    assert(task.subtasks.length <= 4, `${prefix} subtasks exceeds max 4`, errors)
    assert(task.attributeReward && typeof task.attributeReward === 'object', `${prefix} missing attributeReward`, errors)
    assert(['wisdom', 'strength', 'agility'].includes(task.attributeReward.type), `${prefix} invalid reward type`, errors)
    assert(Number(task.attributeReward.value) >= 1, `${prefix} invalid reward value`, errors)
    assert(isIso(task.createdAt), `${prefix} createdAt invalid`, errors)
    assert(isIso(task.updatedAt), `${prefix} updatedAt invalid`, errors)
  })
}

function validateArchives(archives, errors) {
  archives.forEach((archive, index) => {
    const prefix = `task_archives[${index}]`
    assert(typeof archive._id === 'string' && archive._id, `${prefix} missing _id`, errors)
    assert(typeof archive.ownerId === 'string' && archive.ownerId, `${prefix} missing ownerId`, errors)
    assert(!String(archive.ownerId).startsWith('wx:'), `${prefix} ownerId still has wx: prefix`, errors)
    assert(typeof archive.sourceTaskId === 'string' && archive.sourceTaskId, `${prefix} missing sourceTaskId`, errors)
    assert(['completed', 'review_pending'].includes(archive.status), `${prefix} invalid status ${archive.status}`, errors)
    assert(archive.snapshot && typeof archive.snapshot === 'object', `${prefix} missing snapshot`, errors)
    assert(typeof archive.snapshot._id === 'string' && archive.snapshot._id, `${prefix} snapshot missing _id`, errors)
    assert(typeof archive.snapshot.creatorName === 'string', `${prefix} snapshot.creatorName must be string`, errors)
    assert(typeof archive.snapshot.assigneeName === 'string', `${prefix} snapshot.assigneeName must be string`, errors)
    assert(typeof archive.snapshot.ownerScope === 'string', `${prefix} snapshot.ownerScope must be string`, errors)
    assert(isIso(archive.createdAt), `${prefix} createdAt invalid`, errors)
    assert(isIso(archive.updatedAt), `${prefix} updatedAt invalid`, errors)
  })
}

function main() {
  const users = readJson('users.json')
  const tasks = readJson('tasks.json')
  const archives = readJson('task_archives.json')
  const errors = []

  validateUsers(users, errors)
  validateTasks(tasks, errors)
  validateArchives(archives, errors)

  if (errors.length) {
    console.error(`Validation failed with ${errors.length} issue(s):`)
    errors.slice(0, 50).forEach((message) => console.error(`- ${message}`))
    process.exit(1)
  }

  console.log('Adapted migration data looks structurally valid.')
  console.log(`users=${users.length} tasks=${tasks.length} task_archives=${archives.length}`)
}

main()

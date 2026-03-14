App({
  onLaunch() {
    const { initCloud } = require('./utils/cloud')
    initCloud()
  },

  globalData: {
    profile: null,
  },
})

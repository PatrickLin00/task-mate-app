const strings = require('../../config/strings')
const legalStrings = require('../../config/legal-strings')

Page({
  data: {
    strings,
    legalStrings,
    content: legalStrings.privacy,
  },

  onLoad() {
    wx.setNavigationBarTitle({
      title: legalStrings.privacy.navTitle,
    })
  },

  openPrivacyGuide() {
    if (typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({ title: strings.profile.privacyHint, icon: 'none' })
      return
    }
    wx.openPrivacyContract({
      fail: () => {
        wx.showToast({ title: strings.profile.privacyHint, icon: 'none' })
      },
    })
  },
})

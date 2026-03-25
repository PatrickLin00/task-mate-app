const legalStrings = require('../../config/legal-strings')

Page({
  data: {
    legalStrings,
    content: legalStrings.terms,
  },

  onLoad() {
    wx.setNavigationBarTitle({
      title: legalStrings.terms.navTitle,
    })
  },
})

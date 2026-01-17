export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/about/index',
    'pages/task/detail',
    'pages/legal/index'
  ],
  lazyCodeLoading: 'requiredComponents',
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '星愿同行',
    navigationBarTextStyle: 'black'
  }
})

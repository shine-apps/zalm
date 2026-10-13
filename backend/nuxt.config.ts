// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  // 生产构建（nuxt build / Docker 构建）禁用全部远程字体 provider，
  // 避免构建期访问 fonts.google.com 等外部服务的超时重试（国内网络约白等 2 分钟）；
  // 字体回退到 CSS font-family 栈中的系统字体。dev 模式不受影响。
  fonts: process.env.NODE_ENV === 'production'
    ? {
        adobe: false,
        bunny: false,
        fontshare: false,
        fontsource: false,
        google: false,
        googleicons: false,
        npm: false
      }
    : undefined,

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/': { prerender: true }
  },

  // 后端固定 9999，前端（3333）经 dev proxy 同源访问
  devServer: {
    port: 9999
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})

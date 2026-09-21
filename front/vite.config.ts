import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'PI_TEACHER_');
  const apiTarget = env.PI_TEACHER_API_TARGET || 'http://127.0.0.1:8080';

  return {
    // 生产构建由 Go 服务端以内嵌静态资源托管, SPA 深链 (/cards、/settings/general)
    // 依赖根绝对路径; 相对路径 './' 会让深层路由把资源解析到子目录而 404.
    base: '/',
    plugins: [react()],
    server: {
      port: 3000,
      host: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false
        }
      }
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true
    }
  };
});

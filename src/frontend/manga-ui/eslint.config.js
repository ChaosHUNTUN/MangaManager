import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // 代码库统一用 `catch {}` 表示"尽力而为、失败静默"（如 localStorage / 预取 / 埋点），
      // 保留空 catch 是有意为之，不算缺陷
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 常见约定：未使用的函数参数/解构剩余项以 _ 开头即视为有意忽略
      'no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
        ignoreRestSiblings: true,
      }],
      // 该规则只影响开发期 HMR 粒度，不影响运行；仓库多处"组件文件同时导出常量/hook"
      'react-refresh/only-export-components': 'warn',
      // 以下三条是 React Compiler 的建议性规则（本项目未启用 React Compiler 编译）：
      // 多为"effect 内同步 setState""渲染期读时间""ref 取到的 DOM 节点赋值"等既有惯用写法，
      // 保留为警告以便后续按需治理，不作为构建门槛
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  {
    // 构建配置与 Node 脚本：使用 node 全局（process/require/__dirname 等）
    files: ['vite.config.js', 'eslint.config.js', 'src/visual-test/check_imports.js'],
    languageOptions: { globals: globals.node },
  },
])

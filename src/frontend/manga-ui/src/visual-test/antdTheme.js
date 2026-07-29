/**
 * 双主题 antd ConfigProvider 辅助 (响应式 hook 版本)
 * 必须在 ThemeProvider 子树中使用 — 通过 useTheme() 实时跟随主题切换
 */
import { theme as antTheme } from 'antd';
import { useTheme } from './ThemeContext';

const darkTokens = {
  colorPrimary: '#8b7aa0',
  colorBgContainer: '#14141f',
  colorBgElevated: '#1a1a2a',
  borderRadius: 7,
  colorBorder: 'rgba(255,255,255,0.08)',
};

const lightTokens = {
  colorPrimary: '#6d5c8a',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#faf9fc',
  borderRadius: 7,
  colorBorder: 'rgba(0,0,0,0.10)',
};

export function useAntdTheme() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return {
    algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: isDark ? darkTokens : lightTokens,
  };
}

/** 保留静态版以备兼容（不跟随主题切换） */
export function getAntdTheme() {
  const isDark = typeof document !== 'undefined'
    && document.documentElement.dataset.theme !== 'light';
  return {
    algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: isDark ? darkTokens : lightTokens,
  };
}
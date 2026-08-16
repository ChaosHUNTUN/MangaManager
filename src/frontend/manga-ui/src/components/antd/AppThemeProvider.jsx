import React from 'react';
import { ConfigProvider } from 'antd';
import { useAntdTheme } from '../../visual-test/antdTheme';

/**
 * AppThemeProvider — 在页面根部包裹一次
 * <AppThemeProvider>
 *   <YourPage />
 * </AppThemeProvider>
 */
export default function AppThemeProvider({ children }) {
  const theme = useAntdTheme();
  return <ConfigProvider theme={theme}>{children}</ConfigProvider>;
}

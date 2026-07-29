import React, { createContext, useContext, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const ThemeContext = createContext();

const KEY = 'mm-theme';

function getStoredTheme() {
  try { return localStorage.getItem(KEY) || 'dark'; } catch { return 'dark'; }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch {}
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** 简洁的昼夜切换按钮 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? '切到亮色模式' : '切到暗色模式'}
      className="vt-nav-link"
      style={{
        fontSize: 'var(--text-xs)',
        justifyContent: 'center',
      }}
    >
      <span className="vt-nav-icon">
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
      </span>
      <span>{theme === 'dark' ? '亮色模式' : '暗色模式'}</span>
    </button>
  );
}

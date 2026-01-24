import { useState, useEffect, useCallback } from "react";
import { useStorage } from "./useStorage";

type Theme = "dark" | "light" | "system";

export function useTheme() {
  const [themeSetting, setThemeSetting] = useStorage<Theme>("theme", "dark");
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  // 获取系统主题偏好
  const getSystemTheme = useCallback((): "dark" | "light" => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "dark";
  }, []);

  // 应用主题到 DOM
  const applyTheme = useCallback((theme: "dark" | "light") => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }
    setResolvedTheme(theme);
  }, []);

  // 监听主题设置变化
  useEffect(() => {
    if (themeSetting === "system") {
      applyTheme(getSystemTheme());
    } else {
      applyTheme(themeSetting);
    }
  }, [themeSetting, applyTheme, getSystemTheme]);

  // 监听系统主题变化
  useEffect(() => {
    if (themeSetting !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyTheme(getSystemTheme());

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [themeSetting, applyTheme, getSystemTheme]);

  return {
    theme: themeSetting,
    resolvedTheme,
    setTheme: setThemeSetting,
  };
}

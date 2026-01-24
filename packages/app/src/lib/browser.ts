/**
 * 浏览器信息检测工具
 */

interface BrowserInfo {
  name: string;
  version: string;
  fullName: string;
}

/**
 * 从 User Agent 解析浏览器信息
 */
export function getBrowserInfo(): BrowserInfo {
  const ua = navigator.userAgent;

  let name = "Unknown";
  let version = "";

  // 检测顺序很重要：Edge 和 Chrome 的 UA 都包含 "Chrome"
  if (ua.includes("Edg/")) {
    name = "Edge";
    const match = ua.match(/Edg\/(\d+\.[\d.]+)/);
    version = match ? match[1] : "";
  } else if (ua.includes("Firefox/")) {
    name = "Firefox";
    const match = ua.match(/Firefox\/(\d+\.[\d.]+)/);
    version = match ? match[1] : "";
  } else if (ua.includes("Chrome/")) {
    name = "Chrome";
    const match = ua.match(/Chrome\/(\d+\.[\d.]+)/);
    version = match ? match[1] : "";
  } else if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    name = "Safari";
    const match = ua.match(/Version\/(\d+\.[\d.]+)/);
    version = match ? match[1] : "";
  } else if (ua.includes("Opera") || ua.includes("OPR/")) {
    name = "Opera";
    const match = ua.match(/(?:Opera|OPR)\/(\d+\.[\d.]+)/);
    version = match ? match[1] : "";
  }

  return {
    name,
    version,
    fullName: version ? `${name} ${version}` : name,
  };
}

/**
 * 检查两个浏览器是否为同一类型
 */
export function isSameBrowser(browser1: string, browser2: string): boolean {
  // 提取浏览器名称（忽略版本号）
  const getName = (b: string) => b.split(" ")[0].toLowerCase();
  return getName(browser1) === getName(browser2);
}

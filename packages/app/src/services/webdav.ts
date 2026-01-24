export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
}

export interface WebDAVClient {
  testConnection: () => Promise<boolean>;
  putFile: (path: string, content: string) => Promise<void>;
  getFile: (path: string) => Promise<string>;
  createDirectory: (path: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
}

export function createWebDAVClient(config: WebDAVConfig): WebDAVClient {
  const getHeaders = () => {
    const auth = btoa(`${config.username}:${config.password}`);
    return {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest", // 关键：抑制浏览器原生 401 弹窗
    };
  };

  const normalizeUrl = (path: string) => {
    const baseUrl = config.url.endsWith("/") ? config.url : `${config.url}/`;
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `${baseUrl}${cleanPath}`;
  };

  return {
    testConnection: async () => {
      const response = await fetch(normalizeUrl(""), {
        method: "PROPFIND",
        headers: {
          ...getHeaders(),
          Depth: "0",
        },
        credentials: "omit", // 防止浏览器弹出认证对话框
      });
      return response.ok || response.status === 207; // 207 Multi-Status is common for WebDAV
    },

    putFile: async (path: string, content: string) => {
      const response = await fetch(normalizeUrl(path), {
        method: "PUT",
        headers: getHeaders(),
        body: content,
        credentials: "omit",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to upload file: ${response.status} ${response.statusText}`,
        );
      }
    },

    getFile: async (path: string) => {
      const response = await fetch(normalizeUrl(path), {
        method: "GET",
        headers: getHeaders(),
        credentials: "omit",
      });

      if (!response.ok) {
        if (response.status === 404 || response.status === 401) {
          return ""; // 返回空字符串表示文件不存在或未授权
        }
        throw new Error(
          `Failed to download file: ${response.status} ${response.statusText}`,
        );
      }

      return await response.text();
    },

    createDirectory: async (path: string) => {
      const response = await fetch(normalizeUrl(path), {
        method: "MKCOL",
        headers: getHeaders(),
        credentials: "omit",
      });

      if (!response.ok && response.status !== 405) {
        throw new Error(
          `Failed to create directory: ${response.status} ${response.statusText}`,
        );
      }
    },

    exists: async (path: string) => {
      try {
        const response = await fetch(normalizeUrl(path), {
          method: "PROPFIND",
          headers: {
            ...getHeaders(),
            Depth: "0",
          },
          credentials: "omit",
        });
        return response.ok || response.status === 207;
      } catch {
        return false;
      }
    },
  };
}

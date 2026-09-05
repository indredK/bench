import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

const host = process.env.TAURI_DEV_HOST

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        splash: path.resolve(import.meta.dirname, "splash.html"),
      },
      output: {
        manualChunks(id: string | string[]) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom")) {
              return "vendor-react"
            }
            if (id.includes("@tauri-apps")) {
              return "vendor-tauri"
            }
            if (id.includes("radix-ui") || id.includes("@radix-ui")) {
              return "vendor-radix"
            }
            if (id.includes("lucide-react")) {
              return "vendor-icons"
            }
            return "vendor"
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/.claude/**",
      // Playwright e2e 用例由 `pnpm run test:e2e` (playwright test) 执行 (A4-1)。
      "e2e/**",
    ],
    css: false,
  },
}))

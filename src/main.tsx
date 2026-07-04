/**
 * Bootstrap / 启动入口: wire providers and mount app; 只挂载应用与全局 Provider.
 */
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { ThemeProvider } from "next-themes"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import App from "./App"
import "./styles/index.css"
import { i18nInitPromise } from "./i18n/config"
import "@fontsource-variable/geist"

// Await i18next so the first React paint already has translations resolved.
// Without this, the first frame renders raw keys like "appManager.title"
// and only flips to translated text on the next tick — visible flicker (#098).
// If init rejects we render anyway with the i18next fallback locale so the
// user never sees a permanent white screen.
async function bootstrap() {
  try {
    await i18nInitPromise
  } catch (error) {
    console.warn("[bootstrap] i18n init failed; falling back to default:", error)
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>
          <App />
        </TooltipProvider>
        <Toaster />
      </ThemeProvider>
    </StrictMode>,
  )
}

void bootstrap()

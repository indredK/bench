import { StrictMode, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App";
import "./styles.css";
import "./i18n/config";
import "@fontsource-variable/geist";

function SplashManager() {
  useEffect(() => {
    const splash = document.getElementById("splash");
    if (!splash || splash.classList.contains("closing")) return;

    const raf = requestAnimationFrame(() => {
      splash.classList.add("closing");
      setTimeout(() => {
        if (splash.parentNode) splash.remove();
      }, 800);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <SplashManager />
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
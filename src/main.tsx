import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App";
import "./styles.css";
import "./i18n/config";
import "@fontsource-variable/geist";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);

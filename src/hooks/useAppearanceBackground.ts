import { useEffect, useState } from "react"
import { BACKGROUND_EVENT, readBackground } from "@/lib/appearanceBackground"

export function useAppearanceBackground() {
  const [background, setBackground] = useState(readBackground)
  useEffect(() => {
    const update = () => setBackground(readBackground())
    window.addEventListener(BACKGROUND_EVENT, update)
    window.addEventListener("storage", update)
    return () => {
      window.removeEventListener(BACKGROUND_EVENT, update)
      window.removeEventListener("storage", update)
    }
  }, [])
  return background
}

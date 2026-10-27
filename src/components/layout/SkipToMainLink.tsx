import { useTranslation } from "react-i18next"

export const MAIN_CONTENT_ID = "main-content"

export function SkipToMainLink() {
  const { t } = useTranslation()

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(event) => {
        event.preventDefault()
        document.getElementById(MAIN_CONTENT_ID)?.focus({ preventScroll: true })
      }}
      className="bg-background text-foreground focus-visible:ring-ring fixed top-2 left-2 z-50 -translate-y-[200%] rounded-md px-3 py-2 text-sm shadow transition-transform focus:translate-y-0 focus:outline-none focus-visible:ring-2 motion-reduce:transition-none"
    >
      {t("common.skipToMain")}
    </a>
  )
}

import { createRoot } from "react-dom/client"
import { VirtualizedResultList } from "@/features/network-probe/components/VirtualizedResultList"

const items = Array.from({ length: 300 }, (_, index) => `Result row ${index + 1}`)

createRoot(document.getElementById("root")!).render(
  <VirtualizedResultList
    ariaLabel="Virtualized results"
    items={items}
    getItemKey={(item) => item}
    renderItem={(item) => item}
  />,
)

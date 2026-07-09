/**
 * Tool View / 工具视图: embed existing dev-cleaner as a sub-flow; 嵌入现有开发项目清理.
 */
import { DevCleanerPageContent } from "@/features/dev-cleaner/components/DevCleanerPageContent"
import { useDevCleanerController } from "@/features/dev-cleaner/hooks/useDevCleanerController"

export function DevProjectCleanerTool() {
  const controller = useDevCleanerController()
  return <DevCleanerPageContent controller={controller} />
}

/**
 * Tool View / 工具视图: embed existing dev-cleaner as a sub-flow; 嵌入现有开发项目清理.
 */
import { DevCleanerPageContent } from "@extension/dev-cleaner/components/DevCleanerPageContent"
import { useDevCleanerController } from "@extension/dev-cleaner/hooks/useDevCleanerController"

export function DevProjectCleanerTool() {
  const controller = useDevCleanerController()
  return <DevCleanerPageContent controller={controller} />
}

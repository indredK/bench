/**
 * Feature / 功能层: lazy-load hardware compare module; 只负责硬件模块延迟装载.
 */
import { useEffect, useState } from "react";
import HardwareCompare from "@/features/hardware/HardwareCompare";
import type { CompareDataModule } from "@/shared/compare/types";

interface HardwareCompareTabProps {
  loadModule: () => Promise<{ module: CompareDataModule<any> }>;
}

export default function HardwareCompareTab({ loadModule }: HardwareCompareTabProps) {
  const [module, setModule] = useState<CompareDataModule<any> | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadModule().then((loaded) => {
      if (!cancelled) {
        setModule(loaded.module);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadModule]);

  if (!module) return null;

  return <HardwareCompare module={module} />;
}

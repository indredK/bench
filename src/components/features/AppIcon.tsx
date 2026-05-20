import { AppWindow } from "lucide-react";

interface AppIconProps {
  iconBase64: string | null;
  size?: number;
  className?: string;
}

export function AppIcon({ iconBase64, size = 24, className }: AppIconProps) {
  if (!iconBase64) {
    return <AppWindow size={size} className={className} />;
  }

  return (
    <img
      src={`data:image/png;base64,${iconBase64}`}
      alt=""
      width={size}
      height={size}
      className={className}
    />
  );
}
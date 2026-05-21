export interface ProjectInfo {
  path: string;
  name: string;
  total_size: number;
  target_size: number;
  last_modified: number;
  dependencies_count: number;
  project_type: "NodeJs" | "Python" | "Rust" | "Go" | "General";
  cleanup_potential: number;
  cleanup_paths?: string[];
}

export interface CleanupResult {
  success: boolean;
  cleaned_size: number;
  errors: string[];
}

export interface ScanResult {
  total_projects: number;
  total_size: number;
  total_cleanup_size: number;
  projects: ProjectInfo[];
  scan_time_ms: number;
  aborted: boolean;
}

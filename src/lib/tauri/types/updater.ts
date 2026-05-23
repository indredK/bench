/**
 * IPC Types / 通信类型: updater payloads only; 只定义更新相关数据形状.
 */
export interface AppUpdateInfo {
  available: boolean;
  currentVersion: string;
  version: string | null;
  date: string | null;
  body: string | null;
}

export interface AppUpdateInstallResult {
  installed: boolean;
  requiresRestart: boolean;
}

export type AppUpdateDownloadEvent =
  | {
      event: "started";
      contentLength: number | null;
    }
  | {
      event: "progress";
      chunkLength: number;
      downloadedBytes: number;
      contentLength: number | null;
    }
  | {
      event: "finished";
    }
  | {
      event: "cancelled";
    }
  | {
      event: "failed";
      error: string;
    };

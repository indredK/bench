/**
 * IPC DTO / 通信 DTO: startup diagnostics only; 只定义启动诊断数据形状.
 */
export interface StartupIssue {
  feature: string
  message: string
}

# System Settings Roadmap

新增设置必须遵守 [design.md](./design.md) 的平台、权限、读写回读和键位映射规则。

## Backlog

- [ ] 清理 store 未使用字段和死代码。
- [ ] 浏览器名称改为 canonical value，并在展示层做 locale 映射。
- [ ] 将启动配置读取失败传播到前端失败态。
- [ ] 评估“隐藏桌面”候选；确认系统版本与可逆性后再实现。
- [ ] 设置导入/导出；写入前校验 schema、平台和权限并展示变更预览。

# Port Manager Roadmap

> 规划功能（Backlog / 待验证 / 远期）已汇总至 [planned/port-manager.md](../../roadmap/planned/port-manager.md)。
> 已完成功能与详情见 [product-specs/port-manager.md](../../reference/product-specs/port-manager.md)。
> 安全、平台和性能边界见 [design.md](./design.md)。

**当前待收敛风险**：Kill 仍以 PID 执行，身份复核与信号发送之间存在非原子竞态。Unix 后代现在会在每个 SIGKILL 前复核原生创建身份，身份改变或不可读时拒绝向该 PID 发信号；但复核和 `kill(2)` 之间仍有窄竞态，目标进程 / Windows `taskkill` 也未绑定稳定进程句柄。平台句柄方案和真机验证见[待办](../../roadmap/planned/port-manager.md)。

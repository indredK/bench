//! douyin_content_assets —— 抖音内容资产插件宿主域模块（DCA-01，D-037）。
//!
//! 职责：采集条目与本地视频资产的宿主侧存储（版本化 JSON + 媒体文件）、
//! 插件能力面 IPC（`douyin_assets_*` 四命令）、Companion 桥接导入路由。
//!
//! 信任边界：插件前端只拿资产 ID 与元数据；文件选择/容器探测/复制/去重
//! 全部在宿主完成。Companion 批次经 browser_bridge 的 token+Origin 校验后
//! 进入 [`bridge::import_batch`] 做路由级校验（域名白名单/条数/幂等去重）。

pub mod bridge;
pub mod commands;
mod store;
mod types;

/// 域模块编译自检：常量与插件 ID 必须与 plugin-market 目录一致。
#[cfg(test)]
mod consistency {
    #[test]
    fn extension_id_matches_plugin_directory_name() {
        // plugin-market/extensions/<id> 的真源目录名；改动必须双仓同步。
        assert_eq!(super::types::EXTENSION_ID, "douyin-content-assets");
    }

    #[test]
    fn batch_limit_matches_source_spec() {
        assert_eq!(super::types::MAX_BATCH_ITEMS, 100);
    }
}

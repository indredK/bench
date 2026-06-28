use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct SleepConfig {
    pub prevent_sleep: bool,
    pub prevent_display: bool,
    pub auto_disable_on_exit: bool,
}

impl Default for SleepConfig {
    fn default() -> Self {
        Self {
            prevent_sleep: true,
            prevent_display: true,
            auto_disable_on_exit: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct SleepState {
    pub enabled: bool,
    pub since: Option<i64>,
    pub config: SleepConfig,
}

use super::types::{
    AccountSessionStatus, LoginDetectionConfig, LoginDetectionMode, LoginDetectionPresence,
    LoginDetectionRule,
};

const PRESET_LOGGED_IN_NEEDLE: &str = "退出登录";
const PRESET_LOGGED_OUT_NEEDLE: &str = "登录";

pub fn classify(page_text: &str, config: &LoginDetectionConfig) -> AccountSessionStatus {
    match config.mode {
        LoginDetectionMode::PresetLogout => {
            if contains(page_text, PRESET_LOGGED_IN_NEEDLE) {
                AccountSessionStatus::Ready
            } else {
                AccountSessionStatus::LoginRequired
            }
        }
        LoginDetectionMode::PresetLogin => {
            if contains(page_text, PRESET_LOGGED_OUT_NEEDLE) {
                AccountSessionStatus::LoginRequired
            } else {
                AccountSessionStatus::Ready
            }
        }
        LoginDetectionMode::Custom => {
            if rule_matches(page_text, &config.logged_out_rule) {
                AccountSessionStatus::LoginRequired
            } else if rule_matches(page_text, &config.logged_in_rule) {
                AccountSessionStatus::Ready
            } else {
                AccountSessionStatus::Expired
            }
        }
    }
}

fn rule_matches(text: &str, rule: &LoginDetectionRule) -> bool {
    let needle = rule.text.trim();
    if needle.is_empty() {
        return false;
    }
    let present = contains(text, needle);
    match rule.presence {
        LoginDetectionPresence::Present => present,
        LoginDetectionPresence::Absent => !present,
    }
}

fn contains(text: &str, needle: &str) -> bool {
    text.contains(needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(mode: LoginDetectionMode) -> LoginDetectionConfig {
        LoginDetectionConfig {
            mode,
            logged_out_rule: LoginDetectionRule::default(),
            logged_in_rule: LoginDetectionRule::default(),
        }
    }

    #[test]
    fn preset_logout_present_means_ready() {
        let s = classify("个人中心 退出登录", &cfg(LoginDetectionMode::PresetLogout));
        assert_eq!(s, AccountSessionStatus::Ready);
    }

    #[test]
    fn preset_logout_absent_means_login_required() {
        let s = classify("欢迎使用 请登录", &cfg(LoginDetectionMode::PresetLogout));
        assert_eq!(s, AccountSessionStatus::LoginRequired);
    }

    #[test]
    fn preset_login_present_means_login_required() {
        let s = classify("请登录账号", &cfg(LoginDetectionMode::PresetLogin));
        assert_eq!(s, AccountSessionStatus::LoginRequired);
    }

    #[test]
    fn preset_login_absent_means_ready() {
        let s = classify("欢迎回来,用户中心", &cfg(LoginDetectionMode::PresetLogin));
        assert_eq!(s, AccountSessionStatus::Ready);
    }

    #[test]
    fn custom_logged_out_rule_present_wins() {
        let config = LoginDetectionConfig {
            mode: LoginDetectionMode::Custom,
            logged_out_rule: LoginDetectionRule {
                presence: LoginDetectionPresence::Present,
                text: "请登录".into(),
            },
            logged_in_rule: LoginDetectionRule {
                presence: LoginDetectionPresence::Present,
                text: "退出".into(),
            },
        };
        assert_eq!(
            classify("请登录账号 退出", &config),
            AccountSessionStatus::LoginRequired
        );
    }

    #[test]
    fn custom_logged_in_rule_present_when_out_absent() {
        let config = LoginDetectionConfig {
            mode: LoginDetectionMode::Custom,
            logged_out_rule: LoginDetectionRule {
                presence: LoginDetectionPresence::Present,
                text: "请登录".into(),
            },
            logged_in_rule: LoginDetectionRule {
                presence: LoginDetectionPresence::Present,
                text: "退出".into(),
            },
        };
        assert_eq!(
            classify("欢迎 退出", &config),
            AccountSessionStatus::Ready
        );
    }

    #[test]
    fn custom_neither_matches_yields_expired() {
        let config = LoginDetectionConfig {
            mode: LoginDetectionMode::Custom,
            logged_out_rule: LoginDetectionRule {
                presence: LoginDetectionPresence::Present,
                text: "请登录".into(),
            },
            logged_in_rule: LoginDetectionRule {
                presence: LoginDetectionPresence::Present,
                text: "退出".into(),
            },
        };
        assert_eq!(
            classify("纯展示页面", &config),
            AccountSessionStatus::Expired
        );
    }

    #[test]
    fn custom_absent_presence_inverts_match() {
        let config = LoginDetectionConfig {
            mode: LoginDetectionMode::Custom,
            logged_out_rule: LoginDetectionRule::default(),
            logged_in_rule: LoginDetectionRule {
                presence: LoginDetectionPresence::Absent,
                text: "请登录".into(),
            },
        };
        assert_eq!(
            classify("用户中心 余额 100", &config),
            AccountSessionStatus::Ready
        );
        assert_eq!(
            classify("请登录后访问", &config),
            AccountSessionStatus::Expired
        );
    }

    #[test]
    fn empty_rule_text_does_not_match() {
        let config = LoginDetectionConfig {
            mode: LoginDetectionMode::Custom,
            logged_out_rule: LoginDetectionRule {
                presence: LoginDetectionPresence::Present,
                text: "   ".into(),
            },
            logged_in_rule: LoginDetectionRule {
                presence: LoginDetectionPresence::Present,
                text: String::new(),
            },
        };
        assert_eq!(classify("anything", &config), AccountSessionStatus::Expired);
    }

    #[test]
    fn default_config_is_preset_logout() {
        let s = classify("退出登录", &LoginDetectionConfig::default());
        assert_eq!(s, AccountSessionStatus::Ready);
    }
}

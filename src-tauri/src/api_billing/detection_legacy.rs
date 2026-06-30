use super::types::*;

const PRESET_LOGGED_IN_NEEDLE: &str = "\u{9000}\u{51fa}\u{767b}\u{5f55}";
const PRESET_LOGGED_OUT_NEEDLE: &str = "\u{767b}\u{5f55}";

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

pub fn classify_confident(page_text: &str, config: &LoginDetectionConfig) -> Option<AccountSessionStatus> {
    match config.mode {
        LoginDetectionMode::PresetLogout => {
            contains(page_text, PRESET_LOGGED_IN_NEEDLE).then_some(AccountSessionStatus::Ready)
        }
        LoginDetectionMode::PresetLogin => {
            contains(page_text, PRESET_LOGGED_OUT_NEEDLE).then_some(AccountSessionStatus::LoginRequired)
        }
        LoginDetectionMode::Custom => {
            if positive_rule_matches(page_text, &config.logged_out_rule) {
                Some(AccountSessionStatus::LoginRequired)
            } else if positive_rule_matches(page_text, &config.logged_in_rule) {
                Some(AccountSessionStatus::Ready)
            } else {
                None
            }
        }
    }
}

fn positive_rule_matches(text: &str, rule: &LoginDetectionRule) -> bool {
    if !matches!(rule.presence, LoginDetectionPresence::Present) {
        return false;
    }
    let needle = rule.text.trim();
    if needle.is_empty() { return false; }
    contains(text, needle)
}

fn rule_matches(text: &str, rule: &LoginDetectionRule) -> bool {
    let needle = rule.text.trim();
    if needle.is_empty() { return false; }
    let present = contains(text, needle);
    match rule.presence {
        LoginDetectionPresence::Present => present,
        LoginDetectionPresence::Absent => !present,
    }
}

fn contains(text: &str, needle: &str) -> bool {
    text.contains(needle)
}

use serde::{Deserialize, Serialize};
use url::Url;

use super::super::types::StationAccount;

/// 匹配置信度
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum MatchConfidence {
    Exact,
    Sso,
    Manual,
}

/// 匹配结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthProxyMatch {
    pub station_id: String,
    pub station_name: String,
    pub website: String,
    pub accounts: Vec<StationAccount>,
    pub confidence: MatchConfidence,
}

/// 已知的 SSO 提供商 hostname 映射
const SSO_PROVIDERS: &[(&str, &str)] = &[
    ("login.microsoftonline.com", "Microsoft SSO"),
    ("login.live.com", "Microsoft SSO"),
    ("okta.com", "Okta"),
    ("auth0.com", "Auth0"),
    ("accounts.google.com", "Google SSO"),
    ("login.salesforce.com", "Salesforce"),
];

/// 从目标 URL 提取 hostname
pub fn extract_hostname(target: &str) -> Result<(String, String), String> {
    let parsed = Url::parse(target).map_err(|e| format!("invalid target URL: {e}"))?;
    let hostname = parsed
        .host_str()
        .ok_or_else(|| "target URL has no host".to_string())?
        .to_lowercase();
    Ok((hostname, parsed.to_string()))
}

/// 匹配目标 URL 对应的 Station
///
/// 策略:
/// 1. 精确匹配 website hostname
/// 2. 子域名匹配 (api.github.com → github.com)
/// 3. SSO 提供商模糊匹配
/// 4. 返回所有匹配结果
pub fn match_target_to_stations(
    target: &str,
    stations: &[super::super::types::RelayStation],
    accounts: &[StationAccount],
) -> Vec<AuthProxyMatch> {
    let Ok((hostname, _)) = extract_hostname(target) else {
        return vec![];
    };

    let mut results: Vec<AuthProxyMatch> = Vec::new();

    for station in stations {
        let station_host = station.website.trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_end_matches('/')
            .to_lowercase();

        let confidence = if station_host == hostname {
            MatchConfidence::Exact
        } else if hostname.ends_with(&format!(".{station_host}")) || hostname == station_host {
            // 子域名或相同
            MatchConfidence::Exact
        } else {
            // SSO 模糊匹配
            let sso_match = SSO_PROVIDERS.iter().find(|(h, _)| {
                hostname == *h || hostname.ends_with(&format!(".{h}"))
            });
            match sso_match {
                Some(_) if station_host.contains("microsoft") || station_host.contains("okta")
                    || station_host.contains("auth0") || station_host.contains("sso")
                    || station_host.contains("login") =>
                {
                    MatchConfidence::Sso
                }
                _ => continue,
            }
        };

        let station_accounts: Vec<StationAccount> = accounts
            .iter()
            .filter(|a| a.station_id == station.id && a.proxy_enabled)
            .cloned()
            .collect();

        results.push(AuthProxyMatch {
            station_id: station.id.clone(),
            station_name: station.remark.clone(),
            website: station.website.clone(),
            accounts: station_accounts,
            confidence,
        });
    }

    results
}

#[cfg(test)]
mod tests {
    use super::super::super::types::*;
    use super::*;

    fn make_station(id: &str, website: &str, remark: &str) -> RelayStation {
        RelayStation {
            id: id.into(),
            remark: remark.into(),
            website: website.into(),
            created_at: String::new(),
            login_detection: LoginDetectionConfig::default(),
            exclusivity_mode: ExclusivityMode::Coexisting,
            auth_profile: None,
            probe_failure_count: 0,
            session_ttl_hours: 720,
        }
    }

    fn make_account(station_id: &str, id: &str, proxy_enabled: bool) -> StationAccount {
        StationAccount {
            id: id.into(),
            station_id: station_id.into(),
            username: format!("user-{id}"),
            notes: String::new(),
            phone: None,
            tg_account: None,
            linked_account: None,
            invite_link: None,
            login_methods: vec![],
            status: AccountSessionStatus::Ready,
            last_login_at: None,
            last_refreshed_at: None,
            created_at: String::new(),
            has_password: true,
            account_type: Default::default(),
            website: None,
            session: None,
            exclusivity_group: None,
            proxy_enabled,
            external_app_ids: Vec::new(),
        }
    }

    #[test]
    fn exact_hostname_match() {
        let stations = vec![make_station("s1", "https://github.com", "GitHub")];
        let accounts = vec![make_account("s1", "a1", true)];
        let result = match_target_to_stations("https://github.com/login/oauth/authorize", &stations, &accounts);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].confidence, MatchConfidence::Exact);
    }

    #[test]
    fn subdomain_match() {
        let stations = vec![make_station("s1", "https://github.com", "GitHub")];
        let accounts = vec![make_account("s1", "a1", true)];
        let result = match_target_to_stations("https://api.github.com/resource", &stations, &accounts);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].confidence, MatchConfidence::Exact);
    }

    #[test]
    fn filter_non_proxy_accounts() {
        let stations = vec![make_station("s1", "https://github.com", "GitHub")];
        let accounts = vec![
            make_account("s1", "a1", true),
            make_account("s1", "a2", false),
        ];
        let result = match_target_to_stations("https://github.com", &stations, &accounts);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].accounts.len(), 1);
        assert_eq!(result[0].accounts[0].id, "a1");
    }

    #[test]
    fn no_match_returns_empty() {
        let stations = vec![make_station("s1", "https://github.com", "GitHub")];
        let accounts = vec![];
        let result = match_target_to_stations("https://gitlab.com", &stations, &accounts);
        assert_eq!(result.len(), 0);
    }
}

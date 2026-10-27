use serde::{Deserialize, Serialize};
use url::Url;

use super::super::types::StationAccount;

/// 匹配置信度
///
/// 必须 camelCase：前端 `MatchConfidence` 声明的是 `"exact" | "sso" | "manual"`，
/// 而 serde 默认输出 `"Exact"` —— 大小写不一致会让向导里的置信度分支全部走空。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MatchConfidence {
    Exact,
    Sso,
    Manual,
}

/// 匹配结果
///
/// 嵌套结构体也要自己带 `rename_all`：外层 `BrowserOpenResult` 的 camelCase
/// 不会传导到内层字段（前端读 `stationId` 拿到 undefined，去重与显示一起失效）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

/// Station websites may include a sign-in path or query. Match only their parsed
/// HTTP(S) hostname so these details cannot prevent a valid station match.
pub(crate) fn normalized_station_hostname(website: &str) -> Option<String> {
    let parsed = Url::parse(website.trim()).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return None;
    }
    parsed.host_str().map(str::to_ascii_lowercase)
}

/// 匹配目标 URL 对应的 Station
///
/// 策略:
/// 1. 精确 hostname、同一可注册域与目标子域优先匹配
/// 2. SSO 提供商匹配
/// 3. 其余 Station 仍以 manual 候选返回，供用户明确选择
pub fn match_target_to_stations(
    target: &str,
    stations: &[super::super::types::RelayStation],
    accounts: &[StationAccount],
) -> Vec<AuthProxyMatch> {
    let Ok((hostname, _)) = extract_hostname(target) else {
        return vec![];
    };

    let mut results: Vec<AuthProxyMatch> = Vec::new();
    let mut manual_results: Vec<AuthProxyMatch> = Vec::new();

    for station in stations {
        let station_host = normalized_station_hostname(&station.website);

        let confidence = station_host.as_deref().and_then(|station_host| {
            if station_host == hostname
                || hostname.ends_with(&format!(".{station_host}"))
                || same_registrable_domain(&hostname, station_host)
            {
                Some(MatchConfidence::Exact)
            } else {
                // SSO provider hosts may authenticate an otherwise matching site.
                let sso_match = SSO_PROVIDERS
                    .iter()
                    .find(|(h, _)| hostname == *h || hostname.ends_with(&format!(".{h}")));
                match sso_match {
                    Some(_)
                        if station_host.contains("microsoft")
                            || station_host.contains("okta")
                            || station_host.contains("auth0")
                            || station_host.contains("sso")
                            || station_host.contains("login") =>
                    {
                        Some(MatchConfidence::Sso)
                    }
                    _ => None,
                }
            }
        });

        let station_accounts: Vec<StationAccount> = accounts
            .iter()
            .filter(|a| a.station_id == station.id && a.proxy_enabled)
            .cloned()
            .collect();

        let candidate = AuthProxyMatch {
            station_id: station.id.clone(),
            station_name: station.remark.clone(),
            website: station.website.clone(),
            accounts: station_accounts,
            confidence: confidence.clone().unwrap_or(MatchConfidence::Manual),
        };
        if confidence.is_some() {
            results.push(candidate);
        } else {
            manual_results.push(candidate);
        }
    }

    results.extend(manual_results);
    results
}

fn same_registrable_domain(left: &str, right: &str) -> bool {
    match (psl::domain_str(left), psl::domain_str(right)) {
        (Some(left_domain), Some(right_domain)) => left_domain == right_domain,
        _ => false,
    }
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
            network_proxy: None,
            login_fingerprint: None,
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
            refresh_schedule: None,
            next_refresh_at_ts: None,
            first_login_at: None,
            status_reason: None,
        }
    }

    #[test]
    fn exact_hostname_match() {
        let stations = vec![make_station("s1", "https://github.com", "GitHub")];
        let accounts = vec![make_account("s1", "a1", true)];
        let result = match_target_to_stations(
            "https://github.com/login/oauth/authorize",
            &stations,
            &accounts,
        );
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].confidence, MatchConfidence::Exact);
    }

    #[test]
    fn station_url_path_and_query_do_not_block_hostname_match() {
        let stations = vec![make_station(
            "s1",
            "https://github.com/login/oauth?tenant=work",
            "GitHub",
        )];
        let result =
            match_target_to_stations("https://github.com/login/oauth/authorize", &stations, &[]);

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].confidence, MatchConfidence::Exact);
    }

    #[test]
    fn subdomain_match() {
        let stations = vec![make_station("s1", "https://github.com", "GitHub")];
        let accounts = vec![make_account("s1", "a1", true)];
        let result =
            match_target_to_stations("https://api.github.com/resource", &stations, &accounts);
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
    fn registrable_domain_match_is_symmetric_and_uses_public_suffix_rules() {
        let stations = vec![
            make_station("parent", "https://example.com", "Example"),
            make_station("child", "https://login.example.co.uk", "UK Example"),
            make_station("unrelated-uk", "https://other.co.uk", "Other UK"),
            make_station("private-suffix", "https://alice.github.io", "Alice Pages"),
        ];

        let result = match_target_to_stations("https://example.co.uk/oauth", &stations, &[]);

        assert_eq!(result[0].station_id, "child");
        assert_eq!(result[0].confidence, MatchConfidence::Exact);
        assert!(result
            .iter()
            .any(|item| item.station_id == "parent" && item.confidence == MatchConfidence::Manual));
        assert!(result.iter().any(|item| {
            item.station_id == "unrelated-uk" && item.confidence == MatchConfidence::Manual
        }));

        let result = match_target_to_stations("https://bob.github.io", &stations, &[]);
        assert!(result.iter().any(|item| item.station_id == "private-suffix"
            && item.confidence == MatchConfidence::Manual));
    }

    #[test]
    fn unmatched_stations_remain_manual_candidates() {
        let stations = vec![make_station("s1", "https://unrelated.example", "Unrelated")];
        let accounts = vec![make_account("s1", "a1", true)];

        let result = match_target_to_stations("https://github.com/login", &stations, &accounts);

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].confidence, MatchConfidence::Manual);
        assert_eq!(result[0].accounts[0].id, "a1");
    }

    #[test]
    fn no_stations_returns_empty() {
        let result = match_target_to_stations("https://gitlab.com", &[], &[]);
        assert!(result.is_empty());
    }
}

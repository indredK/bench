//! DNSSEC / DoH / DoT — Cloudflare DoH JSON AD bit + reachability (S-SEC-05).

use super::types::DnsSecCheckResult;
use super::validate::validate_host;
use crate::error::AppResult;
use serde::Deserialize;
use std::time::Instant;
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

const DOH_URL: &str = "https://cloudflare-dns.com/dns-query";
const DOT_HOST: &str = "1.1.1.1";
const DOT_PORT: u16 = 853;

#[derive(Debug, Deserialize)]
struct DohJson {
    #[serde(rename = "Status")]
    status: Option<u32>,
    #[serde(rename = "AD")]
    ad: Option<bool>,
    #[serde(rename = "CD")]
    cd: Option<bool>,
    #[serde(default)]
    #[serde(rename = "Answer")]
    answer: Option<Vec<serde_json::Value>>,
}

pub async fn check_dnssec(domain: String) -> AppResult<DnsSecCheckResult> {
    validate_host(&domain)?;
    let command_hint = format!("checkDnsSec('{domain}') // DoH AD-bit + DoT reachability");

    let (dnssec_status, dnssec_detail, doh_ok, doh_rtt_ms, doh_detail) =
        probe_doh_dnssec(&domain).await;
    let (dot_ok, dot_rtt_ms, dot_detail) = probe_dot().await;

    Ok(DnsSecCheckResult {
        domain,
        dnssec_status,
        dnssec_detail,
        doh_ok,
        doh_rtt_ms,
        doh_detail,
        dot_ok,
        dot_rtt_ms,
        dot_detail,
        command_hint,
    })
}

async fn probe_doh_dnssec(
    domain: &str,
) -> (String, Option<String>, bool, Option<f64>, Option<String>) {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Bench-NetworkProbe/1.0")
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return (
                "unknown".into(),
                Some(format!("DoH client: {e}")),
                false,
                None,
                Some(format!("DoH client: {e}")),
            )
        }
    };
    // type=A + DO flag via cd=false (default) — Cloudflare reports AD when chain validates.
    let url = format!("{DOH_URL}?name={domain}&type=A&do=true");
    let t0 = Instant::now();
    match client
        .get(&url)
        .header("accept", "application/dns-json")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            match resp.json::<DohJson>().await {
                Ok(body) => {
                    let ad = body.ad.unwrap_or(false);
                    let status = body.status.unwrap_or(0);
                    let answers = body.answer.as_ref().map(|a| a.len()).unwrap_or(0);
                    let (dnssec_status, dnssec_detail) = if status == 2 {
                        (
                            "bogus".into(),
                            Some(
                                "SERVFAIL from validating DoH resolver — possible bogus / validation failure."
                                    .into(),
                            ),
                        )
                    } else if ad {
                        (
                            "secure".into(),
                            Some(format!(
                                "Cloudflare DoH reported AD=true ({answers} answers). Authenticated Data bit set."
                            )),
                        )
                    } else if answers > 0 {
                        (
                            "insecure".into(),
                            Some(format!(
                                "Answers present but AD=false (CD={:?}). Zone likely unsigned or not validated.",
                                body.cd
                            )),
                        )
                    } else {
                        (
                            "unknown".into(),
                            Some("DoH OK but no answers and AD=false.".into()),
                        )
                    };
                    (
                        dnssec_status,
                        dnssec_detail,
                        true,
                        Some(ms),
                        Some(format!("DoH OK via {DOH_URL} (AD={ad})")),
                    )
                }
                Err(e) => (
                    "unknown".into(),
                    Some(format!("DoH JSON parse: {e}")),
                    true,
                    Some(ms),
                    Some(format!("DoH HTTP OK but JSON parse failed: {e}")),
                ),
            }
        }
        Ok(resp) => (
            "unknown".into(),
            Some(format!("DoH HTTP {}", resp.status())),
            false,
            None,
            Some(format!("DoH HTTP {}", resp.status())),
        ),
        Err(e) => (
            "unknown".into(),
            Some(format!("DoH failed: {e}")),
            false,
            None,
            Some(format!("DoH failed: {e}")),
        ),
    }
}

async fn probe_dot() -> (bool, Option<f64>, Option<String>) {
    let t0 = Instant::now();
    match timeout(
        Duration::from_secs(5),
        TcpStream::connect((DOT_HOST, DOT_PORT)),
    )
    .await
    {
        Ok(Ok(_stream)) => {
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            (
                true,
                Some(ms),
                Some(format!(
                    "TCP {DOT_HOST}:{DOT_PORT} reachable (TLS handshake not fully validated in this build)"
                )),
            )
        }
        Ok(Err(e)) => (false, None, Some(format!("DoT TCP failed: {e}"))),
        Err(_) => (false, None, Some("DoT TCP timed out".into())),
    }
}

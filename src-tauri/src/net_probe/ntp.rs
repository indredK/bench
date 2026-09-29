//! NTP offset probe — multi-source median (design-discover §3.4).

use super::types::{NtpProbeResult, ProbeServer};
use crate::error::AppResult;
use futures_util::future::join_all;
use rsntp::{AsyncSntpClient, Config};
use std::time::{Duration, Instant};

const NTP_TIMEOUT: Duration = Duration::from_secs(4);

#[derive(Debug)]
struct NtpSample {
    offset_seconds: f64,
    rtt_seconds: f64,
    stratum: u8,
}

pub async fn probe_ntp(servers: &[ProbeServer]) -> AppResult<NtpProbeResult> {
    let servers = servers
        .iter()
        .take(super::defaults::MAX_NTP_SERVERS)
        .collect::<Vec<_>>();
    let command_hint = format!(
        "probeNtp(local) // multi-source median ({} configured source(s))",
        servers.len()
    );
    let started = Instant::now();
    let attempts = join_all(servers.iter().map(|source| probe_one(&source.server))).await;
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;

    let mut samples = Vec::new();
    let mut details = Vec::with_capacity(attempts.len());
    let mut used = Vec::new();
    for (source, attempt) in servers.iter().zip(attempts) {
        let server = &source.server;
        match attempt {
            Ok(sample) => {
                used.push(format!("{} ({server})", source.id));
                details.push(format!(
                    "{} ({server}) offset={:.3}s stratum={}",
                    source.id, sample.offset_seconds, sample.stratum
                ));
                samples.push(sample);
            }
            Err(error) => details.push(format!("{} ({server}) fail:{error}", source.id)),
        }
    }

    if samples.is_empty() {
        return Ok(NtpProbeResult {
            server: String::new(),
            ok: false,
            offset_seconds: None,
            rtt_seconds: None,
            stratum: None,
            sources_succeeded: 0,
            sources_configured: servers.len() as u8,
            severity: "fail".into(),
            detail: Some(if servers.is_empty() {
                "No NTP sources are configured.".into()
            } else {
                format!("All NTP sources failed. {}", details.join("; "))
            }),
            elapsed_ms,
            command_hint,
        });
    }

    samples.sort_by(|left, right| left.offset_seconds.total_cmp(&right.offset_seconds));
    let middle = samples.len() / 2;
    let median = if samples.len() % 2 == 0 {
        (samples[middle - 1].offset_seconds + samples[middle].offset_seconds) / 2.0
    } else {
        samples[middle].offset_seconds
    };
    let stratum = samples
        .iter()
        .min_by(|left, right| {
            (left.offset_seconds - median)
                .abs()
                .total_cmp(&(right.offset_seconds - median).abs())
                .then_with(|| left.rtt_seconds.total_cmp(&right.rtt_seconds))
        })
        .map(|sample| sample.stratum);
    let mut rtts = samples
        .iter()
        .map(|sample| sample.rtt_seconds)
        .collect::<Vec<_>>();
    rtts.sort_by(f64::total_cmp);
    let rtt_median = if rtts.len() % 2 == 0 {
        (rtts[middle - 1] + rtts[middle]) / 2.0
    } else {
        rtts[middle]
    };
    let severity = severity_for_offset(median);

    Ok(NtpProbeResult {
        server: used.join(", "),
        ok: true,
        offset_seconds: Some(median),
        rtt_seconds: Some(rtt_median),
        stratum,
        sources_succeeded: samples.len() as u8,
        sources_configured: servers.len() as u8,
        severity: severity.into(),
        detail: Some(format!(
            "median_offset={median:.3}s from {} source(s). {}",
            samples.len(),
            details.join("; ")
        )),
        elapsed_ms,
        command_hint,
    })
}

async fn probe_one(server: &str) -> Result<NtpSample, String> {
    let mut addresses = tokio::net::lookup_host(server)
        .await
        .map_err(|error| format!("DNS lookup failed: {error}"))?
        .collect::<Vec<_>>();
    addresses.sort_by_key(|address| !address.is_ipv4());
    let address = addresses
        .first()
        .copied()
        .ok_or_else(|| "DNS lookup returned no address".to_string())?;
    let bind_address = if address.is_ipv4() {
        "0.0.0.0:0"
    } else {
        "[::]:0"
    }
    .parse()
    .map_err(|error| format!("Invalid local bind address: {error}"))?;
    let config = Config::default()
        .bind_address(bind_address)
        .timeout(NTP_TIMEOUT)
        .connect_ip(true);
    let client = AsyncSntpClient::with_config(config);
    // Use the address selected above. Passing the hostname here would make rsntp resolve it
    // again and could select a different IP family than the socket's bind address.
    let result = client
        .synchronize(address)
        .await
        .map_err(|error| error.to_string())?;

    Ok(NtpSample {
        offset_seconds: result.clock_offset().as_secs_f64(),
        rtt_seconds: result.round_trip_delay().as_secs_f64().max(0.0),
        stratum: result.stratum(),
    })
}

fn severity_for_offset(offset_seconds: f64) -> &'static str {
    let absolute_offset = offset_seconds.abs();
    if absolute_offset > 2.0 {
        "high"
    } else if absolute_offset > 0.5 {
        "warn"
    } else {
        "ok"
    }
}

#[cfg(test)]
mod tests {
    use super::severity_for_offset;

    #[test]
    fn ntp_severity_uses_documented_absolute_thresholds() {
        assert_eq!(severity_for_offset(0.5), "ok");
        assert_eq!(severity_for_offset(-0.501), "warn");
        assert_eq!(severity_for_offset(2.0), "warn");
        assert_eq!(severity_for_offset(-2.001), "high");
    }
}

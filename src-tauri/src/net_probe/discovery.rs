//! LAN discovery — neighbor cache + bounded TCP sweep with cancel (S-DIS-01).

use super::summary::is_tunnel_iface;
use super::types::{
    ArpNeighbor, LanDiscoveryProgressEvent, LanDiscoveryProgressPhase, LanDiscoveryResult,
    ScanSessionEvent,
};
use crate::error::{AppError, AppResult};
use std::collections::BTreeMap;
use std::io::ErrorKind;
use std::net::Ipv4Addr;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::TcpStream;
use tokio::time::timeout;

const SCAN_SESSION_EVENT: &str = "network-probe:scan-session";
const LAN_DISCOVERY_PROGRESS_EVENT: &str = "network-probe:lan-discovery-progress";
const SWEEP_CONCURRENCY: usize = 32;
const SWEEP_TIMEOUT_MS: u64 = 250;
const SWEEP_PORTS: &[u16] = &[80, 443, 22];
const SYSTEM_NEIGHBOR_CACHE_SUPPORTED: bool = cfg!(any(target_os = "macos", target_os = "windows"));
#[cfg(target_os = "macos")]
const ARP_CACHE_TIMEOUT: Duration = Duration::from_secs(3);
/// Do not actively probe subnets wider than /24 until the UI has a larger-scope confirmation.
const MAX_PREFIX_LEN: u8 = 24;

#[derive(Debug, Clone, PartialEq, Eq)]
struct Ipv4InterfaceAddress {
    name: String,
    ip: Ipv4Addr,
    prefix_len: u8,
    is_physical: bool,
    is_tunnel: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Ipv4Subnet {
    interface: String,
    address: Ipv4Addr,
    local_addresses: Vec<Ipv4Addr>,
    network: Ipv4Addr,
    prefix_len: u8,
    is_physical: bool,
}

struct Ipv4NetworkSnapshot {
    candidates: Vec<Ipv4InterfaceAddress>,
    default_interface: Option<(String, bool)>,
    default_gateway: Option<Ipv4Addr>,
}

struct ScanSessionGuard(String);

impl Drop for ScanSessionGuard {
    fn drop(&mut self) {
        super::session::clear_session(&self.0);
    }
}

fn preflight_status(
    session_id: &str,
    empty_reason: &'static str,
    normal_message: &'static str,
    cancelled_message: &'static str,
) -> (bool, String, String) {
    let cancelled = super::session::is_cancelled(session_id);
    let message = if cancelled {
        cancelled_message
    } else {
        normal_message
    };
    (cancelled, empty_reason.to_string(), message.to_string())
}

impl Ipv4Subnet {
    fn from_interface(address: Ipv4InterfaceAddress) -> Option<Self> {
        let prefix_len = address.prefix_len;
        if !(1..=32).contains(&prefix_len) {
            return None;
        }
        let mask = prefix_mask(prefix_len);
        let network = Ipv4Addr::from(u32::from(address.ip) & mask);
        Some(Self {
            interface: address.name,
            address: address.ip,
            local_addresses: vec![address.ip],
            network,
            prefix_len,
            is_physical: address.is_physical,
        })
    }

    fn cidr(&self) -> String {
        format!("{}/{}", self.network, self.prefix_len)
    }

    fn contains(&self, address: Ipv4Addr) -> bool {
        let mask = prefix_mask(self.prefix_len);
        (u32::from(address) & mask) == u32::from(self.network)
    }

    fn probe_hosts(&self) -> Vec<Ipv4Addr> {
        if self.exceeds_sweep_limit() {
            return Vec::new();
        }
        let mask = prefix_mask(self.prefix_len);
        let network = u32::from(self.network);
        let broadcast = network | !mask;
        let (first, last) = match self.prefix_len {
            32 => return Vec::new(),
            31 => (network, broadcast),
            _ => (network + 1, broadcast - 1),
        };
        (first..=last)
            .map(Ipv4Addr::from)
            .filter(|ip| !self.local_addresses.contains(ip))
            .collect()
    }

    fn exceeds_sweep_limit(&self) -> bool {
        self.prefix_len < MAX_PREFIX_LEN
    }

    fn active_sweep_skip_reason(&self) -> Option<&'static str> {
        if !self.address.is_private() {
            Some("non-private-scope")
        } else if self.exceeds_sweep_limit() {
            Some("scope")
        } else if self.prefix_len == 32 {
            Some("no-peers")
        } else {
            None
        }
    }
}

fn prefix_mask(prefix_len: u8) -> u32 {
    match prefix_len {
        0 => 0,
        1..=32 => u32::MAX << (32 - prefix_len),
        _ => 0,
    }
}

fn filter_cached_neighbors(neighbors: Vec<ArpNeighbor>, subnet: &Ipv4Subnet) -> Vec<ArpNeighbor> {
    dedup_neighbors_by_ip(
        neighbors
            .into_iter()
            .filter(|neighbor| {
                let Ok(address) = neighbor.ip.parse::<Ipv4Addr>() else {
                    return false;
                };
                subnet.contains(address)
                    && neighbor
                        .iface
                        .as_deref()
                        .map(|iface| iface == subnet.interface)
                        .unwrap_or(false)
            })
            .collect(),
    )
}

fn dedup_neighbors_by_ip(mut neighbors: Vec<ArpNeighbor>) -> Vec<ArpNeighbor> {
    neighbors.sort_by(|left, right| left.ip.cmp(&right.ip));
    neighbors.dedup_by(|left, right| left.ip == right.ip);
    neighbors
}

fn discovery_mode(cache_supported: bool, active_probes_started: bool) -> &'static str {
    match (cache_supported, active_probes_started) {
        (true, true) => "arp-cache+tcp-sweep",
        (true, false) => "arp-cache",
        (false, true) => "tcp-sweep",
        (false, false) => "not-run",
    }
}

fn cache_for_discovery(result: AppResult<Vec<ArpNeighbor>>) -> (Vec<ArpNeighbor>, bool) {
    match result {
        Ok(neighbors) if SYSTEM_NEIGHBOR_CACHE_SUPPORTED => (neighbors, true),
        Ok(_) | Err(_) => (Vec::new(), false),
    }
}

fn select_ipv4_subnet(
    candidates: Vec<Ipv4InterfaceAddress>,
    default_interface: Option<(&str, bool)>,
    default_gateway: Option<Ipv4Addr>,
) -> Option<Ipv4Subnet> {
    let subnets: Vec<Ipv4Subnet> = candidates
        .into_iter()
        .filter(|candidate| !candidate.is_tunnel && !is_tunnel_iface(&candidate.name))
        .filter_map(Ipv4Subnet::from_interface)
        .collect();

    let select_unambiguous = |mut matches: Vec<Ipv4Subnet>| {
        matches.sort_by(|left, right| {
            (&left.interface, left.network, left.prefix_len).cmp(&(
                &right.interface,
                right.network,
                right.prefix_len,
            ))
        });
        let mut unique: Vec<Ipv4Subnet> = Vec::new();
        for subnet in matches {
            if let Some(existing) = unique.last_mut().filter(|existing| {
                existing.interface == subnet.interface
                    && existing.network == subnet.network
                    && existing.prefix_len == subnet.prefix_len
            }) {
                existing.local_addresses.extend(subnet.local_addresses);
                existing.local_addresses.sort_unstable();
                existing.local_addresses.dedup();
            } else {
                unique.push(subnet);
            }
        }
        let mut matches = unique;
        (matches.len() == 1).then(|| matches.remove(0))
    };

    if let Some((default_interface, false)) = default_interface
        .filter(|(interface, is_tunnel)| !*is_tunnel && !is_tunnel_iface(interface))
    {
        let on_default = subnets
            .iter()
            .filter(|subnet| subnet.interface == default_interface)
            .cloned()
            .collect::<Vec<_>>();
        if on_default.len() == 1 {
            return on_default.into_iter().next();
        }
        if let Some(gateway) = default_gateway {
            if let Some(selected) = select_unambiguous(
                on_default
                    .iter()
                    .filter(|subnet| subnet.contains(gateway))
                    .cloned()
                    .collect(),
            ) {
                return Some(selected);
            }
        }
        if let Some(selected) = select_unambiguous(
            on_default
                .into_iter()
                .filter(|subnet| subnet.address.is_private())
                .collect(),
        ) {
            return Some(selected);
        }
        // A default route exists but its interface has no usable/unique IPv4 subnet.
        // Do not guess another interface and scan an unrelated network.
        return None;
    }

    // A full-tunnel VPN can own the system default route. Prefer a physical subnet that
    // contains the gateway if the route metadata still identifies one; otherwise fall
    // back only when exactly one physical private subnet exists.
    let physical_private = subnets
        .into_iter()
        .filter(|subnet| subnet.address.is_private() && subnet.is_physical)
        .collect::<Vec<_>>();
    if let Some(gateway) = default_gateway {
        if let Some(selected) = select_unambiguous(
            physical_private
                .iter()
                .filter(|subnet| subnet.contains(gateway))
                .cloned()
                .collect(),
        ) {
            return Some(selected);
        }
    }
    select_unambiguous(physical_private)
}

fn local_ipv4_addresses() -> AppResult<Ipv4NetworkSnapshot> {
    let interfaces = netdev::get_interfaces();
    let default = netdev::get_default_interface().ok();
    let default_interface = default
        .as_ref()
        .map(|interface| (interface.name.clone(), interface.is_tun()));
    let default_gateway = default
        .as_ref()
        .and_then(|interface| interface.gateway.as_ref())
        .and_then(|gateway| gateway.ipv4.first().copied());
    let candidates = interfaces
        .into_iter()
        .filter(|interface| interface.is_up() && interface.is_running() && !interface.is_loopback())
        .flat_map(|interface| {
            let is_tunnel = interface.is_tun() || is_tunnel_iface(&interface.name);
            let is_physical = interface.is_physical();
            let name = interface.name;
            interface
                .ipv4
                .into_iter()
                .map(move |address| Ipv4InterfaceAddress {
                    name: name.clone(),
                    ip: address.addr(),
                    prefix_len: address.prefix_len(),
                    is_physical,
                    is_tunnel,
                })
        })
        .collect();
    Ok(Ipv4NetworkSnapshot {
        candidates,
        default_interface,
        default_gateway,
    })
}

pub async fn discover_lan<R: Runtime>(app: Option<&AppHandle<R>>) -> AppResult<LanDiscoveryResult> {
    let started = Instant::now();
    let session_id = super::session::new_session_id();
    if let Some(app) = app {
        let _ = app.emit(
            SCAN_SESSION_EVENT,
            &ScanSessionEvent {
                session_id: session_id.clone(),
                kind: "lan".into(),
            },
        );
    }
    let _session_guard = ScanSessionGuard(session_id.clone());
    emit_lan_discovery_progress(
        app,
        &session_id,
        LanDiscoveryProgressPhase::Preparing,
        0,
        0,
        0,
    );
    let cache_result = tauri::async_runtime::spawn_blocking(read_arp_cache)
        .await
        .map_err(|e| AppError::task_failed(format!("arp join: {e}")))?;
    let (cache, cache_available) = cache_for_discovery(cache_result);
    let discovery_strategy = if cache_available {
        "arp-cache + TCP connect (80,443,22; max /24)"
    } else {
        "TCP connect only (80,443,22; max /24; OS neighbor cache unavailable)"
    };
    let command_hint = format!("scanLan(local) // {discovery_strategy}; sessionId={session_id}");

    let snapshot = tauri::async_runtime::spawn_blocking(local_ipv4_addresses)
        .await
        .map_err(|error| AppError::task_failed(format!("interface join: {error}")))??;
    let Ipv4NetworkSnapshot {
        candidates,
        default_interface,
        default_gateway: gateway,
    } = snapshot;
    let subnet = select_ipv4_subnet(
        candidates,
        default_interface
            .as_ref()
            .map(|(name, is_tunnel)| (name.as_str(), *is_tunnel)),
        gateway,
    );

    let Some(subnet) = subnet else {
        let (cancelled, empty_reason, message) = preflight_status(
            &session_id,
            "no-interface",
            "Could not identify one active non-tunnel IPv4 subnet; connect to a local network or review VPN interfaces and retry.",
            "LAN discovery was cancelled before interface selection completed.",
        );
        return Ok(LanDiscoveryResult {
            mode: discovery_mode(false, false).into(),
            neighbors: Vec::new(),
            message: Some(message),
            empty_reason: Some(empty_reason),
            cidr: None,
            cancelled,
            session_id,
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            command_hint,
        });
    };
    let cache = filter_cached_neighbors(cache, &subnet);
    let cidr = subnet.cidr();

    if let Some(skip_reason) = subnet.active_sweep_skip_reason() {
        let normal_message = match skip_reason {
            "non-private-scope" => "The selected interface is outside RFC 1918 private IPv4 ranges; active TCP probes were skipped without explicit scope authorization.",
            "scope" => "The local subnet is wider than /24; active TCP probes were skipped.",
            "no-peers" => "The selected /32 host route has no other IPv4 addresses to probe.",
            _ => unreachable!("all active sweep skip reasons are handled"),
        };
        let (cancelled, empty_reason, message) = preflight_status(
            &session_id,
            skip_reason,
            normal_message,
            "LAN discovery was cancelled before active TCP probes began.",
        );
        return Ok(LanDiscoveryResult {
            mode: discovery_mode(cache_available, false).into(),
            neighbors: cache,
            message: Some(message),
            empty_reason: Some(empty_reason),
            cidr: Some(cidr),
            cancelled,
            session_id,
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            command_hint,
        });
    }

    let hosts = subnet.probe_hosts();
    let mut by_ip: BTreeMap<String, ArpNeighbor> = BTreeMap::new();
    for n in cache {
        by_ip.insert(n.ip.clone(), n);
    }

    let mut progress = LanDiscoveryProgressReporter::new(app, &session_id, hosts.len());
    progress.emit(LanDiscoveryProgressPhase::Scanning, by_ip.len());

    let mut cancelled = false;
    let mut permission_denied = false;
    let mut active_probes_started = false;

    for chunk in hosts.chunks(SWEEP_CONCURRENCY) {
        if super::session::is_cancelled(&session_id) {
            cancelled = true;
            break;
        }
        let mut tasks = tokio::task::JoinSet::new();
        for ip in chunk {
            let ip = *ip;
            active_probes_started = true;
            tasks.spawn(async move { (ip, probe_host(ip).await) });
        }
        while let Some(result) = tasks.join_next().await {
            match result {
                Ok((ip, status)) => {
                    permission_denied |=
                        progress.record_completed(&mut by_ip, &subnet.interface, ip, status);
                }
                Err(error) if error.is_cancelled() => {}
                Err(error) => {
                    return Err(AppError::task_failed(format!(
                        "LAN host probe task failed: {error}"
                    )));
                }
            }

            let cancellation_requested = super::session::is_cancelled(&session_id);
            if permission_denied || cancellation_requested {
                cancelled |= cancellation_requested;
                tasks.abort_all();
                // Preserve every result that had already completed when cancellation or a
                // permission denial stopped this chunk. Aborted, unfinished probes do not
                // increment checked_hosts or the discovered-neighbor count.
                while let Some(result) = tasks.join_next().await {
                    match result {
                        Ok((ip, status)) => {
                            permission_denied |= progress.record_completed(
                                &mut by_ip,
                                &subnet.interface,
                                ip,
                                status,
                            );
                        }
                        Err(error) if error.is_cancelled() => {}
                        Err(error) => {
                            return Err(AppError::task_failed(format!(
                                "LAN host probe task failed: {error}"
                            )));
                        }
                    }
                }
                break;
            }
        }
        if cancelled || permission_denied {
            break;
        }
    }

    cancelled = cancelled || super::session::is_cancelled(&session_id);
    let neighbors: Vec<ArpNeighbor> = by_ip.into_values().collect();
    let gateway_seen = gateway
        .map(|g| neighbors.iter().any(|n| n.ip == g.to_string()))
        .unwrap_or(false);

    let (empty_reason, message) = if permission_denied {
        (
            Some("permission".into()),
            Some(
                "Local Network access was denied. Check the app's Local Network setting in System Settings."
                    .into(),
            ),
        )
    } else if cancelled {
        (None, Some("LAN discovery cancelled mid-sweep.".into()))
    } else if neighbors.is_empty() {
        (
            Some("quiet".into()),
            Some(
                "No neighbors found. May be a quiet network, Wi‑Fi client isolation, or Local Network permission."
                    .into(),
            ),
        )
    } else if neighbors.len() <= 1 && gateway_seen {
        (
            Some("isolation".into()),
            Some("Only the gateway responded — guest Wi‑Fi / client isolation is likely.".into()),
        )
    } else {
        (
            None,
            Some(
                "Degraded: ARP cache + TCP connect /24 sweep. Privileged ARP request needs adv-scanner."
                    .into(),
            ),
        )
    };

    Ok(LanDiscoveryResult {
        mode: discovery_mode(cache_available, active_probes_started).into(),
        neighbors,
        message,
        empty_reason,
        cidr: Some(cidr),
        cancelled,
        session_id,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        command_hint,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HostProbeStatus {
    Responsive,
    Unresponsive,
    LocalNetworkDenied,
}

fn apply_host_probe_status(
    by_ip: &mut BTreeMap<String, ArpNeighbor>,
    interface: &str,
    ip: Ipv4Addr,
    status: HostProbeStatus,
) -> bool {
    match status {
        HostProbeStatus::Responsive => {
            let key = ip.to_string();
            by_ip.entry(key.clone()).or_insert(ArpNeighbor {
                ip: key,
                mac: None,
                iface: Some(interface.to_string()),
                source: "tcp-sweep".into(),
            });
            false
        }
        HostProbeStatus::LocalNetworkDenied => true,
        HostProbeStatus::Unresponsive => false,
    }
}

fn emit_lan_discovery_progress<R: Runtime>(
    app: Option<&AppHandle<R>>,
    session_id: &str,
    phase: LanDiscoveryProgressPhase,
    checked_hosts: usize,
    total_hosts: usize,
    discovered_neighbors: usize,
) {
    if let Some(app) = app {
        let _ = app.emit(
            LAN_DISCOVERY_PROGRESS_EVENT,
            &LanDiscoveryProgressEvent {
                session_id: session_id.to_string(),
                phase,
                checked_hosts,
                total_hosts,
                discovered_neighbors,
            },
        );
    }
}

struct LanDiscoveryProgressReporter<'a, R: Runtime> {
    app: Option<&'a AppHandle<R>>,
    session_id: String,
    total_hosts: usize,
    checked_hosts: usize,
}

impl<'a, R: Runtime> LanDiscoveryProgressReporter<'a, R> {
    fn new(app: Option<&'a AppHandle<R>>, session_id: &str, total_hosts: usize) -> Self {
        Self {
            app,
            session_id: session_id.to_string(),
            total_hosts,
            checked_hosts: 0,
        }
    }

    fn emit(&self, phase: LanDiscoveryProgressPhase, discovered_neighbors: usize) {
        emit_lan_discovery_progress(
            self.app,
            &self.session_id,
            phase,
            self.checked_hosts,
            self.total_hosts,
            discovered_neighbors,
        );
    }

    fn record_completed(
        &mut self,
        by_ip: &mut BTreeMap<String, ArpNeighbor>,
        interface: &str,
        ip: Ipv4Addr,
        status: HostProbeStatus,
    ) -> bool {
        self.checked_hosts += 1;
        let permission_denied = apply_host_probe_status(by_ip, interface, ip, status);
        self.emit(LanDiscoveryProgressPhase::Scanning, by_ip.len());
        permission_denied
    }
}

async fn probe_host(ip: Ipv4Addr) -> HostProbeStatus {
    for &port in SWEEP_PORTS {
        let addr = format!("{ip}:{port}");
        match timeout(
            Duration::from_millis(SWEEP_TIMEOUT_MS),
            TcpStream::connect(addr),
        )
        .await
        {
            Ok(Ok(_)) => return HostProbeStatus::Responsive,
            Ok(Err(error)) if error.kind() == ErrorKind::PermissionDenied => {
                return HostProbeStatus::LocalNetworkDenied;
            }
            _ => {}
        }
    }
    HostProbeStatus::Unresponsive
}

pub fn read_arp_cache() -> AppResult<Vec<ArpNeighbor>> {
    #[cfg(target_os = "macos")]
    {
        let output = crate::subprocess::run_output_with_timeout(
            Command::new("arp").args(["-an"]),
            ARP_CACHE_TIMEOUT,
            None,
        )
        .map_err(|error| {
            AppError::io(format!(
                "arp -an failed: {:?} (exit code {:?})",
                error.kind, error.exit_code
            ))
        })?;
        if !output.status.success() {
            return Err(AppError::io(format!(
                "arp -an exited with status {}",
                output.status
            )));
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let mut out = Vec::new();
        for line in text.lines() {
            if let Some(ip) = extract_paren_ip(line) {
                let mac = extract_mac(line);
                let iface = line
                    .split_whitespace()
                    .skip_while(|t| *t != "on")
                    .nth(1)
                    .map(str::to_string);
                out.push(ArpNeighbor {
                    ip,
                    mac,
                    iface,
                    source: "arp-cache".into(),
                });
            }
        }
        out.sort_by(|a, b| a.ip.cmp(&b.ip));
        Ok(out)
    }
    #[cfg(target_os = "windows")]
    {
        read_windows_neighbor_table()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(Vec::new())
    }
}

#[cfg(target_os = "windows")]
fn read_windows_neighbor_table() -> AppResult<Vec<ArpNeighbor>> {
    use std::collections::HashMap;
    use std::ffi::c_void;
    use std::ptr;
    use windows_sys::Win32::Foundation::{ERROR_NOT_FOUND, ERROR_SUCCESS};
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        FreeMibTable, GetIpNetTable2, MIB_IPNET_ROW2, MIB_IPNET_TABLE2,
    };
    use windows_sys::Win32::Networking::WinSock::{NlnsUnreachable, AF_INET};

    struct MibTableGuard(*const c_void);

    impl Drop for MibTableGuard {
        fn drop(&mut self) {
            // SAFETY: GetIpNetTable2 allocates this table and FreeMibTable owns its release.
            unsafe { FreeMibTable(self.0) };
        }
    }

    let mut table = ptr::null_mut::<MIB_IPNET_TABLE2>();
    // SAFETY: `table` is a valid out pointer and AF_INET requests IPv4 rows only.
    let status = unsafe { GetIpNetTable2(AF_INET, &mut table) };
    let _guard = (!table.is_null()).then(|| MibTableGuard(table.cast()));

    if status == ERROR_NOT_FOUND {
        return Ok(Vec::new());
    }
    if status != ERROR_SUCCESS {
        return Err(AppError::io(format!(
            "GetIpNetTable2 failed with Windows status {status}"
        )));
    }
    if table.is_null() {
        return Err(AppError::io(
            "GetIpNetTable2 succeeded without returning a neighbor table",
        ));
    }

    let interface_names: HashMap<u32, String> = netdev::get_interfaces()
        .into_iter()
        .map(|interface| (interface.index, interface.name))
        .collect();
    // SAFETY: a successful GetIpNetTable2 call returns an allocated table with NumEntries rows.
    let entry_count = unsafe { (*table).NumEntries as usize };
    let entry_size = std::mem::size_of::<MIB_IPNET_ROW2>();
    if entry_count > isize::MAX as usize / entry_size {
        return Err(AppError::io(
            "GetIpNetTable2 returned an invalid neighbor count",
        ));
    }
    // SAFETY: Table is the flexible row array in the allocated table; Windows reports the
    // exact number of rows and the allocation stays alive until `_guard` drops.
    let entries = unsafe {
        std::slice::from_raw_parts(
            std::ptr::addr_of!((*table).Table).cast::<MIB_IPNET_ROW2>(),
            entry_count,
        )
    };

    let mut neighbors = Vec::with_capacity(entry_count);
    for entry in entries {
        // SAFETY: GetIpNetTable2 was called with AF_INET, so Address.Ipv4 is the active union arm.
        let ipv4 = unsafe { entry.Address.Ipv4 };
        // SAFETY: `Ipv4` is the active address union arm for AF_INET.
        let address = unsafe { ipv4.sin_addr.S_un.S_addr };
        let ip = ipv4_from_windows_network_order(address);
        let mac_len = entry.PhysicalAddressLength as usize;
        let mac = if mac_len <= entry.PhysicalAddress.len() {
            format_hardware_address(&entry.PhysicalAddress[..mac_len])
        } else {
            None
        };

        if entry.State == NlnsUnreachable {
            continue;
        }

        neighbors.push(ArpNeighbor {
            ip: ip.to_string(),
            mac,
            iface: interface_names.get(&entry.InterfaceIndex).cloned(),
            source: "arp-cache".into(),
        });
    }
    neighbors.sort_by(|a, b| a.ip.cmp(&b.ip));
    Ok(neighbors)
}

#[cfg(any(target_os = "windows", test))]
fn format_hardware_address(bytes: &[u8]) -> Option<String> {
    (!bytes.is_empty()).then(|| {
        bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<Vec<_>>()
            .join(":")
    })
}

#[cfg(any(target_os = "windows", test))]
fn ipv4_from_windows_network_order(value: u32) -> Ipv4Addr {
    Ipv4Addr::from(value.to_ne_bytes())
}

pub fn detect_arp_spoofing_hints() -> AppResult<Vec<super::types::PollutionFinding>> {
    use super::types::PollutionFinding;
    let mut findings = Vec::new();
    let neighbors = dedup_neighbors_by_ip(read_arp_cache()?);
    let route = super::summary::collect_default_route().ok();
    let gateway = route.as_ref().and_then(|r| r.gateway.clone());

    if let Some(gw) = gateway {
        let gw_entries: Vec<_> = neighbors.iter().filter(|n| n.ip == gw).collect();
        if gw_entries.is_empty() {
            findings.push(PollutionFinding {
                code: "arp_gateway_missing".into(),
                kind: "arp".into(),
                severity: "info".into(),
                evidence: format!(
                    "Gateway {gw} not present in ARP cache yet (normal just after link-up)."
                ),
                command_hint: "detectArpSpoofing(local) // read-only".into(),
            });
        } else if gw_entries.iter().any(|n| n.mac.is_none()) {
            findings.push(PollutionFinding {
                code: "arp_gateway_incomplete".into(),
                kind: "arp".into(),
                severity: "warn".into(),
                evidence: format!("Gateway {gw} has incomplete ARP entry."),
                command_hint: "detectArpSpoofing(local) // read-only".into(),
            });
        } else if let Some(mac) = gw_entries[0].mac.as_ref() {
            let shared_ips: Vec<_> = neighbors
                .iter()
                .filter(|n| n.mac.as_ref() == Some(mac) && n.ip != gw)
                .map(|n| n.ip.clone())
                .collect();
            if !shared_ips.is_empty() {
                findings.push(shared_gateway_mac_finding(&gw, mac, &shared_ips));
            } else {
                findings.push(PollutionFinding {
                    code: "arp_gateway_bound".into(),
                    kind: "arp".into(),
                    severity: "info".into(),
                    evidence: format!("Gateway {gw} bound to MAC {mac} (single binding in cache)."),
                    command_hint: "detectArpSpoofing(local) // read-only".into(),
                });
            }
        }
    } else {
        findings.push(PollutionFinding {
            code: "arp_no_gateway".into(),
            kind: "arp".into(),
            severity: "info".into(),
            evidence: "No default gateway — skip ARP spoofing check.".into(),
            command_hint: "detectArpSpoofing(local) // read-only".into(),
        });
    }

    Ok(findings)
}

fn shared_gateway_mac_finding(
    gateway: &str,
    mac: &str,
    shared_ips: &[String],
) -> super::types::PollutionFinding {
    use super::types::PollutionFinding;

    PollutionFinding {
        code: "arp_shared_mac".into(),
        kind: "arp".into(),
        // Shared MACs commonly belong to bridges, virtual networks, or shared devices.
        // A single ARP cache snapshot cannot prove spoofing or detect MAC changes over time.
        severity: "info".into(),
        evidence: format!(
            "Gateway {gateway} MAC {mac} is also present for: {}. Shared MACs are common and this alone does not indicate spoofing.",
            shared_ips.join(", ")
        ),
        command_hint: "detectArpSpoofing(local) // read-only".into(),
    }
}

#[cfg(test)]
mod lan_subnet_tests {
    use super::{
        apply_host_probe_status, filter_cached_neighbors, select_ipv4_subnet, ArpNeighbor,
        HostProbeStatus, Ipv4InterfaceAddress, Ipv4Subnet, ScanSessionGuard,
    };
    use std::collections::BTreeMap;
    use std::net::Ipv4Addr;

    fn interface(name: &str, ip: &str, prefix_len: u8, is_physical: bool) -> Ipv4InterfaceAddress {
        Ipv4InterfaceAddress {
            name: name.into(),
            ip: ip.parse().unwrap(),
            prefix_len,
            is_physical,
            is_tunnel: name.starts_with("utun"),
        }
    }

    #[test]
    fn rejects_invalid_prefix_lengths() {
        assert!(Ipv4Subnet::from_interface(interface("en0", "192.0.2.4", 0, true)).is_none());
        assert!(Ipv4Subnet::from_interface(interface("en0", "192.0.2.4", 33, true)).is_none());
    }

    #[test]
    fn prefers_the_non_tunnel_subnet_containing_the_gateway() {
        let subnet = select_ipv4_subnet(
            vec![
                interface("utun4", "198.18.0.1", 16, false),
                interface("en1", "10.2.0.9", 24, true),
                interface("en0", "192.168.1.22", 23, true),
            ],
            Some(("utun4", true)),
            Some("192.168.0.1".parse().unwrap()),
        )
        .unwrap();

        assert_eq!(subnet.interface, "en0");
        assert_eq!(subnet.cidr(), "192.168.0.0/23");
        assert!(subnet.exceeds_sweep_limit());
    }

    #[test]
    fn does_not_guess_between_physical_subnets_behind_a_vpn() {
        let selected = select_ipv4_subnet(
            vec![
                interface("en0", "192.168.1.22", 24, true),
                interface("en1", "10.2.0.9", 24, true),
            ],
            Some(("utun4", true)),
            None,
        );

        assert!(selected.is_none());
    }

    #[test]
    fn class_c_probe_range_excludes_network_broadcast_and_local_address() {
        let subnet =
            Ipv4Subnet::from_interface(interface("en0", "192.168.0.103", 24, true)).unwrap();
        let hosts = subnet.probe_hosts();

        assert_eq!(subnet.cidr(), "192.168.0.0/24");
        assert_eq!(hosts.len(), 253);
        assert!(!hosts.contains(&Ipv4Addr::new(192, 168, 0, 0)));
        assert!(!hosts.contains(&Ipv4Addr::new(192, 168, 0, 103)));
        assert!(!hosts.contains(&Ipv4Addr::new(192, 168, 0, 255)));
    }

    #[test]
    fn small_point_to_point_subnet_probes_the_other_address() {
        let subnet = Ipv4Subnet::from_interface(interface("en0", "192.0.2.4", 31, true)).unwrap();

        assert_eq!(subnet.probe_hosts(), vec![Ipv4Addr::new(192, 0, 2, 5)]);
    }

    #[test]
    fn host_route_has_no_remote_hosts() {
        let subnet = Ipv4Subnet::from_interface(interface("en0", "192.168.0.4", 32, true)).unwrap();

        assert!(subnet.probe_hosts().is_empty());
        assert_eq!(subnet.active_sweep_skip_reason(), Some("no-peers"));
    }

    #[test]
    fn excludes_every_local_address_when_an_interface_has_aliases() {
        let subnet = select_ipv4_subnet(
            vec![
                interface("en0", "192.168.0.4", 24, true),
                interface("en0", "192.168.0.5", 24, true),
            ],
            Some(("en0", false)),
            None,
        )
        .unwrap();

        let hosts = subnet.probe_hosts();
        assert!(!hosts.contains(&Ipv4Addr::new(192, 168, 0, 4)));
        assert!(!hosts.contains(&Ipv4Addr::new(192, 168, 0, 5)));
        assert_eq!(hosts.len(), 252);
    }

    #[test]
    fn cached_neighbors_are_filtered_to_the_selected_subnet_and_interface() {
        let subnet =
            Ipv4Subnet::from_interface(interface("en0", "192.168.0.103", 24, true)).unwrap();
        let cached = |ip: &str, iface: Option<&str>| ArpNeighbor {
            ip: ip.into(),
            mac: None,
            iface: iface.map(str::to_string),
            source: "arp-cache".into(),
        };

        let filtered = filter_cached_neighbors(
            vec![
                cached("192.168.0.1", Some("en0")),
                cached("192.168.0.22", Some("en1")),
                cached("192.168.1.22", Some("en0")),
                cached("192.168.0.2", None),
            ],
            &subnet,
        );

        assert_eq!(
            filtered
                .iter()
                .map(|neighbor| neighbor.ip.as_str())
                .collect::<Vec<_>>(),
            vec!["192.168.0.1"]
        );
    }

    #[test]
    fn overlapping_cache_ips_keep_the_selected_interface_entry() {
        let subnet =
            Ipv4Subnet::from_interface(interface("en0", "192.168.0.103", 24, true)).unwrap();
        let cached = |iface: &str| ArpNeighbor {
            ip: "192.168.0.1".into(),
            mac: Some(if iface == "en0" {
                "00:11:22:33:44:00".into()
            } else {
                "00:11:22:33:44:11".into()
            }),
            iface: Some(iface.into()),
            source: "arp-cache".into(),
        };

        let filtered = filter_cached_neighbors(vec![cached("en1"), cached("en0")], &subnet);

        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].iface.as_deref(), Some("en0"));
        assert_eq!(filtered[0].mac.as_deref(), Some("00:11:22:33:44:00"));
    }

    #[test]
    fn non_private_subnets_never_trigger_active_probes_without_confirmation() {
        for address in ["203.0.113.17", "169.254.1.17", "100.64.1.17"] {
            let subnet = Ipv4Subnet::from_interface(interface("en0", address, 24, true)).unwrap();
            assert!(
                subnet.active_sweep_skip_reason().is_some(),
                "unexpected active sweep for {address}"
            );
        }
    }

    #[test]
    fn discovery_mode_describes_the_sources_that_the_platform_can_read() {
        assert_eq!(super::discovery_mode(true, false), "arp-cache");
        assert_eq!(super::discovery_mode(true, true), "arp-cache+tcp-sweep");
        assert_eq!(super::discovery_mode(false, false), "not-run");
        assert_eq!(super::discovery_mode(false, true), "tcp-sweep");
    }

    #[test]
    fn responsive_sweep_results_keep_cached_metadata_and_unique_neighbor_count() {
        let ip = Ipv4Addr::new(192, 168, 0, 1);
        let mut by_ip = BTreeMap::from([(
            ip.to_string(),
            ArpNeighbor {
                ip: ip.to_string(),
                mac: Some("00:11:22:33:44:55".into()),
                iface: Some("en0".into()),
                source: "arp-cache".into(),
            },
        )]);

        let denied = apply_host_probe_status(&mut by_ip, "en0", ip, HostProbeStatus::Responsive);

        assert!(!denied);
        assert_eq!(by_ip.len(), 1);
        assert_eq!(by_ip[&ip.to_string()].source, "arp-cache");
        assert_eq!(
            by_ip[&ip.to_string()].mac.as_deref(),
            Some("00:11:22:33:44:55")
        );
    }

    #[test]
    fn local_network_denial_is_reported_as_a_stop_condition() {
        let mut by_ip = BTreeMap::new();

        let denied = apply_host_probe_status(
            &mut by_ip,
            "en0",
            Ipv4Addr::new(192, 168, 0, 2),
            HostProbeStatus::LocalNetworkDenied,
        );

        assert!(denied);
        assert!(by_ip.is_empty());
    }

    #[test]
    fn cancellation_during_preflight_is_reported_for_early_results() {
        let session_id = super::super::session::new_session_id();
        super::super::session::cancel_scan(session_id.clone());

        let (cancelled, reason, message) = super::preflight_status(
            &session_id,
            "scope",
            "The local subnet is wider than /24; active TCP probes were skipped.",
            "LAN discovery was cancelled before active TCP probes began.",
        );

        assert!(cancelled);
        assert_eq!(reason, "scope");
        assert_eq!(
            message,
            "LAN discovery was cancelled before active TCP probes began."
        );
        super::super::session::clear_session(&session_id);
    }

    #[test]
    fn session_guard_clears_registry_when_preflight_returns_early() {
        let session_id = super::super::session::new_session_id();
        let guard = ScanSessionGuard(session_id.clone());
        super::super::session::cancel_scan(session_id.clone());
        assert!(super::super::session::is_cancelled(&session_id));

        drop(guard);

        assert!(!super::super::session::is_cancelled(&session_id));
    }

    #[test]
    fn cache_read_errors_degrade_to_tcp_discovery_without_claiming_cache_data() {
        let (neighbors, cache_available) =
            super::cache_for_discovery(Err(crate::error::AppError::io("cache unavailable")));

        assert!(neighbors.is_empty());
        assert!(!cache_available);
        assert_eq!(super::discovery_mode(cache_available, true), "tcp-sweep");
    }

    #[test]
    fn formats_hardware_addresses_without_assuming_a_six_byte_mac() {
        assert_eq!(
            super::format_hardware_address(&[0, 17, 34, 51, 68, 255]).as_deref(),
            Some("00:11:22:33:44:ff")
        );
        assert_eq!(
            super::format_hardware_address(&[0, 1, 2, 3, 4, 5, 6, 7]).as_deref(),
            Some("00:01:02:03:04:05:06:07")
        );
        assert_eq!(super::format_hardware_address(&[]), None);
    }

    #[test]
    fn converts_windows_network_order_ipv4_bytes_correctly() {
        let raw_address = u32::from_ne_bytes([192, 168, 10, 2]);
        assert_eq!(
            super::ipv4_from_windows_network_order(raw_address),
            Ipv4Addr::new(192, 168, 10, 2)
        );
    }
}

#[cfg(test)]
mod arp_pollution_tests {
    use super::shared_gateway_mac_finding;

    #[test]
    fn shared_gateway_mac_is_informational_not_an_attack_claim() {
        let finding =
            shared_gateway_mac_finding("192.0.2.1", "00:11:22:33:44:55", &["192.0.2.8".into()]);

        assert_eq!(finding.code, "arp_shared_mac");
        assert_eq!(finding.severity, "info");
        assert!(finding.evidence.contains("does not indicate spoofing"));
    }
}

#[cfg(target_os = "macos")]
fn extract_paren_ip(line: &str) -> Option<String> {
    let start = line.find('(')? + 1;
    let end = line[start..].find(')')? + start;
    Some(line[start..end].to_string())
}

#[cfg(target_os = "macos")]
fn extract_mac(line: &str) -> Option<String> {
    for token in line.split_whitespace() {
        if token.contains(':')
            && token.len() >= 11
            && token.chars().filter(|c| *c == ':').count() == 5
            && token.chars().all(|c| c.is_ascii_hexdigit() || c == ':')
        {
            return Some(token.to_ascii_lowercase());
        }
        if token == "(incomplete)" {
            return None;
        }
    }
    None
}

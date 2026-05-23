use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use serde::Deserialize;
use std::{collections::BTreeMap, env, fs, path::PathBuf};

#[derive(Debug, Deserialize)]
struct LatestJson {
    version: String,
    platforms: BTreeMap<String, PlatformUpdate>,
}

#[derive(Debug, Deserialize)]
struct PlatformUpdate {
    signature: String,
    url: String,
}

fn main() -> Result<(), String> {
    let args = parse_args(env::args().skip(1).collect())?;
    let latest_path = args.latest_json;
    let assets_dir = args.assets_dir;
    let pubkey = args.pubkey;

    let latest_text = fs::read_to_string(&latest_path)
        .map_err(|error| format!("failed to read {}: {error}", latest_path.display()))?;
    let latest: LatestJson = serde_json::from_str(&latest_text)
        .map_err(|error| format!("failed to parse {}: {error}", latest_path.display()))?;

    if latest.platforms.is_empty() {
        return Err("latest.json must include at least one platform".to_string());
    }

    let pubkey_text = decode_base64_to_string(&pubkey, "pubkey")?;
    let public_key = PublicKey::decode(&pubkey_text)
        .map_err(|error| format!("failed to decode updater public key: {error}"))?;

    for (platform, update) in latest.platforms {
        let file_name = update
            .url
            .rsplit('/')
            .next()
            .ok_or_else(|| format!("{platform}: update URL has no file name"))?;
        let file_name = percent_decode(file_name);
        let asset_path = assets_dir.join(&file_name);
        let asset = fs::read(&asset_path).map_err(|error| {
            format!(
                "{platform}: failed to read {}: {error}",
                asset_path.display()
            )
        })?;
        let signature_text =
            decode_base64_to_string(&update.signature, &format!("{platform} signature"))?;
        let signature = Signature::decode(&signature_text)
            .map_err(|error| format!("{platform}: failed to decode signature: {error}"))?;

        public_key
            .verify(&asset, &signature, true)
            .map_err(|error| {
                format!(
                    "{platform}: updater signature verification failed for {file_name}: {error}"
                )
            })?;

        println!("verified updater signature for {platform}: {file_name}");
    }

    println!("verified updater manifest for version {}", latest.version);
    Ok(())
}

struct Args {
    latest_json: PathBuf,
    assets_dir: PathBuf,
    pubkey: String,
}

fn parse_args(args: Vec<String>) -> Result<Args, String> {
    let mut latest_json = None;
    let mut assets_dir = None;
    let mut pubkey = None;
    let mut iter = args.into_iter();

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--latest-json" => latest_json = iter.next().map(PathBuf::from),
            "--assets-dir" => assets_dir = iter.next().map(PathBuf::from),
            "--pubkey" => pubkey = iter.next(),
            "--help" | "-h" => return Err(usage()),
            other => return Err(format!("unknown argument: {other}\n{}", usage())),
        }
    }

    Ok(Args {
        latest_json: latest_json.ok_or_else(usage)?,
        assets_dir: assets_dir.ok_or_else(usage)?,
        pubkey: pubkey.ok_or_else(usage)?,
    })
}

fn usage() -> String {
    "Usage: verify_updater_manifest --latest-json <path> --assets-dir <dir> --pubkey <base64-public-key>"
        .to_string()
}

fn decode_base64_to_string(value: &str, label: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|error| format!("{label}: invalid base64: {error}"))?;
    String::from_utf8(bytes).map_err(|error| format!("{label}: invalid utf-8: {error}"))
}

fn percent_decode(value: &str) -> String {
    let mut bytes = Vec::with_capacity(value.len());
    let mut iter = value.as_bytes().iter().copied();

    while let Some(byte) = iter.next() {
        if byte == b'%' {
            let high = iter.next();
            let low = iter.next();
            if let (Some(high), Some(low)) = (high, low) {
                if let (Some(high), Some(low)) = (hex_value(high), hex_value(low)) {
                    bytes.push((high << 4) | low);
                    continue;
                }
                bytes.push(b'%');
                bytes.push(high);
                bytes.push(low);
                continue;
            }
            bytes.push(b'%');
            if let Some(high) = high {
                bytes.push(high);
            }
            if let Some(low) = low {
                bytes.push(low);
            }
            continue;
        }

        bytes.push(byte);
    }

    String::from_utf8_lossy(&bytes).to_string()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

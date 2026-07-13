use std::path::Path;
use std::process::Command;

/// Subset of `codesign -dvvv` output we care about. We use the Team ID to
/// detect a Developer ID change between the installed bundle and the new one.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct CodesignInfo {
    /// Bundle identifier reported by codesign's `Identifier=` line.
    pub bundle_id: Option<String>,
    /// 10-char Team Identifier (e.g. "ABCDE12345"). `None` when the bundle
    /// is unsigned or codesign reports "not set".
    pub team_id: Option<String>,
    /// First `Authority=` line, e.g. "Developer ID Application: Foo (ABCDE12345)".
    pub authority: Option<String>,
}

/// Run `codesign -dvvv <app>` and parse the result.
pub fn read_codesign_info(app_path: &Path) -> Result<CodesignInfo, String> {
    let out = Command::new("codesign")
        .arg("-dvvv")
        .arg(app_path)
        .output()
        .map_err(|e| format!("SU_CODESIGN_FAIL: spawn {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "SU_CODESIGN_FAIL: -dvvv exit {} {}",
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    // codesign writes its info to stderr; stdout is empty in practice.
    let text = String::from_utf8_lossy(&out.stderr);
    Ok(parse_codesign_output(&text))
}

/// Strictly verify a signature with `codesign --verify --deep --strict`.
/// Returns the SU_CODESIGN_FAIL error when the bundle is unsigned, tampered,
/// or fails the integrity check.
pub fn verify_signature(app_path: &Path) -> Result<(), String> {
    let out = Command::new("codesign")
        .arg("--verify")
        .arg("--deep")
        .arg("--strict")
        .arg(app_path)
        .output()
        .map_err(|e| format!("SU_CODESIGN_FAIL: spawn {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "SU_CODESIGN_FAIL: verify exit {} {}",
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

/// Gatekeeper assessment is the final notarization/policy check. A valid
/// embedded signature alone is insufficient for an untrusted download.
pub fn assess_notarization(app_path: &Path) -> Result<(), String> {
    let out = Command::new("spctl")
        .args(["--assess", "--type", "execute", "--strict"])
        .arg(app_path)
        .output()
        .map_err(|error| format!("SU_NOTARIZATION_FAIL: spawn {error}"))?;
    if !out.status.success() {
        return Err(format!(
            "SU_NOTARIZATION_FAIL: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

pub fn verify_platform_compatibility(app_path: &Path) -> Result<(), String> {
    let plist_path = app_path.join("Contents/Info.plist");
    let dictionary = plist::Value::from_file(&plist_path)
        .map_err(|error| format!("SU_BUNDLE_METADATA_FAIL: {error}"))?
        .into_dictionary()
        .ok_or_else(|| "SU_BUNDLE_METADATA_FAIL: Info.plist is not a dictionary".to_string())?;

    if let Some(minimum) = dictionary
        .get("LSMinimumSystemVersion")
        .and_then(|value| value.as_string())
    {
        let host = Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .map_err(|error| format!("SU_OS_VERSION_FAIL: {error}"))?;
        let host = String::from_utf8_lossy(&host.stdout);
        if compare_version_components(host.trim(), minimum).is_lt() {
            return Err(format!("SU_OS_TOO_OLD: requires {minimum}"));
        }
    }

    let executable = dictionary
        .get("CFBundleExecutable")
        .and_then(|value| value.as_string())
        .ok_or_else(|| "SU_BUNDLE_METADATA_FAIL: CFBundleExecutable missing".to_string())?;
    let executable_path = app_path.join("Contents/MacOS").join(executable);
    let output = Command::new("lipo")
        .arg("-archs")
        .arg(&executable_path)
        .output()
        .map_err(|error| format!("SU_ARCH_CHECK_FAIL: {error}"))?;
    if !output.status.success() {
        return Err("SU_ARCH_CHECK_FAIL: lipo could not inspect executable".to_string());
    }
    let required = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        other => other,
    };
    let architectures = String::from_utf8_lossy(&output.stdout);
    if !architectures
        .split_whitespace()
        .any(|arch| arch == required)
    {
        return Err(format!("SU_ARCH_MISMATCH: requires {required}"));
    }
    Ok(())
}

fn compare_version_components(left: &str, right: &str) -> std::cmp::Ordering {
    let parse = |value: &str| {
        value
            .split('.')
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect::<Vec<_>>()
    };
    let mut left = parse(left);
    let mut right = parse(right);
    let width = left.len().max(right.len());
    left.resize(width, 0);
    right.resize(width, 0);
    left.cmp(&right)
}

fn parse_codesign_output(text: &str) -> CodesignInfo {
    let mut info = CodesignInfo::default();
    for raw in text.lines() {
        let line = raw.trim();
        if let Some(v) = line.strip_prefix("TeamIdentifier=") {
            let v = v.trim();
            if !v.is_empty() && v != "not set" {
                info.team_id = Some(v.to_string());
            }
        } else if info.authority.is_none() {
            if let Some(v) = line.strip_prefix("Authority=") {
                info.authority = Some(v.trim().to_string());
            }
        }
        if let Some(v) = line.strip_prefix("Identifier=") {
            let v = v.trim();
            if !v.is_empty() {
                info.bundle_id = Some(v.to_string());
            }
        }
    }
    info
}

/// True when both sides report a Team ID and they differ. An absent Team ID
/// on either side is treated as "unknown" rather than "changed" — the caller
/// decides how to handle unsigned bundles (typically refuse to install).
pub fn team_id_changed(old: &CodesignInfo, new: &CodesignInfo) -> bool {
    match (&old.team_id, &new.team_id) {
        (Some(a), Some(b)) => a != b,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
Executable=/Applications/Demo.app/Contents/MacOS/Demo
Identifier=com.example.demo
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=2345 flags=0x10000(runtime) hashes=70+7 location=embedded
Signature size=8987
Authority=Developer ID Application: Example Studio (ABCDE12345)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
Timestamp=Mar 5, 2026 at 1:23:45 PM
Info.plist entries=42
TeamIdentifier=ABCDE12345
Sealed Resources version=2 rules=13 files=98
";

    #[test]
    fn parse_extracts_team_id_and_first_authority() {
        let info = parse_codesign_output(SAMPLE);
        assert_eq!(info.team_id.as_deref(), Some("ABCDE12345"));
        assert_eq!(
            info.authority.as_deref(),
            Some("Developer ID Application: Example Studio (ABCDE12345)")
        );
    }

    #[test]
    fn parse_handles_unsigned_bundle() {
        let text = "Executable=/x\nIdentifier=anon\nTeamIdentifier=not set\n";
        let info = parse_codesign_output(text);
        assert!(info.team_id.is_none());
        assert!(info.authority.is_none());
    }

    #[test]
    fn parse_handles_empty_output() {
        let info = parse_codesign_output("");
        assert_eq!(info, CodesignInfo::default());
    }

    #[test]
    fn team_id_changed_detects_difference() {
        let old = CodesignInfo {
            team_id: Some("AAA".into()),
            ..Default::default()
        };
        let new = CodesignInfo {
            team_id: Some("BBB".into()),
            ..Default::default()
        };
        assert!(team_id_changed(&old, &new));
    }

    #[test]
    fn team_id_changed_returns_false_when_either_unknown() {
        let signed = CodesignInfo {
            team_id: Some("AAA".into()),
            ..Default::default()
        };
        let unsigned = CodesignInfo::default();
        assert!(!team_id_changed(&signed, &unsigned));
        assert!(!team_id_changed(&unsigned, &signed));
        assert!(!team_id_changed(&unsigned, &unsigned));
    }

    #[test]
    fn team_id_changed_returns_false_when_equal() {
        let a = CodesignInfo {
            team_id: Some("ABCDE12345".into()),
            ..Default::default()
        };
        let b = a.clone();
        assert!(!team_id_changed(&a, &b));
    }

    #[test]
    fn version_component_comparison_handles_padding() {
        assert!(compare_version_components("14.6", "14.5.1").is_gt());
        assert!(compare_version_components("13.4", "14.0").is_lt());
        assert!(compare_version_components("15.0", "15").is_eq());
    }
}

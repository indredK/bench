use std::path::Path;
use std::process::Command;

/// Subset of `codesign -dvvv` output we care about. We use the Team ID to
/// detect a Developer ID change between the installed bundle and the new one.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct CodesignInfo {
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
}

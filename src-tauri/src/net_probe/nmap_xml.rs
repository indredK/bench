//! Minimal, bounded Nmap XML parsing for one explicitly selected host.
//! We intentionally consume only port state/service metadata and OS matches;
//! scripts, hostnames, addresses, and arbitrary banner text are not surfaced.

use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};

const MAX_ATTRIBUTE_CHARS: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NmapPort {
    pub port: u16,
    pub state: String,
    pub service_name: Option<String>,
    pub service_method: Option<String>,
    pub product: Option<String>,
    pub version: Option<String>,
    pub tunnel: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NmapOsMatch {
    pub name: String,
    pub accuracy: u8,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct NmapOutput {
    pub ports: Vec<NmapPort>,
    pub os_match: Option<NmapOsMatch>,
}

#[derive(Debug, Default)]
struct CurrentPort {
    port: u16,
    state: Option<String>,
    service_name: Option<String>,
    service_method: Option<String>,
    product: Option<String>,
    version: Option<String>,
    tunnel: Option<String>,
}

impl CurrentPort {
    fn finish(self) -> Option<NmapPort> {
        Some(NmapPort {
            port: self.port,
            state: self.state?,
            service_name: self.service_name,
            service_method: self.service_method,
            product: self.product,
            version: self.version,
            tunnel: self.tunnel,
        })
    }
}

fn attribute(element: &BytesStart<'_>, key: &str) -> Option<String> {
    element
        .attributes()
        .filter_map(Result::ok)
        .find_map(|attr| {
            (attr.key.as_ref() == key)
                .then(|| {
                    attr.normalized_value(XmlVersion::Implicit1_0)
                        .ok()
                        .map(|value| value.chars().take(MAX_ATTRIBUTE_CHARS).collect())
                })
                .flatten()
        })
}

fn start_port(element: &BytesStart<'_>) -> Option<CurrentPort> {
    if attribute(element, "protocol").as_deref() != Some("tcp") {
        return None;
    }
    Some(CurrentPort {
        port: attribute(element, "portid")?.parse().ok()?,
        ..CurrentPort::default()
    })
}

fn parse_os_match(element: &BytesStart<'_>) -> Option<NmapOsMatch> {
    let name = attribute(element, "name")?;
    if name.is_empty() {
        return None;
    }
    let accuracy = attribute(element, "accuracy")?.parse::<u8>().ok()?;
    (accuracy <= 100).then_some(NmapOsMatch { name, accuracy })
}

fn keep_best_os_match(output: &mut NmapOutput, candidate: Option<NmapOsMatch>) {
    if let Some(candidate) = candidate {
        if output
            .os_match
            .as_ref()
            .is_none_or(|existing| candidate.accuracy > existing.accuracy)
        {
            output.os_match = Some(candidate);
        }
    }
}

pub fn parse_nmap_xml(xml: &str) -> Result<NmapOutput, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    reader.config_mut().check_end_names = true;
    let mut output = NmapOutput::default();
    let mut current_port: Option<CurrentPort> = None;
    let mut buf = Vec::new();
    let mut depth = 0usize;
    let mut root_seen = false;
    let mut root_closed = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(element)) => {
                if depth == 0 {
                    if root_seen || element.name().as_ref() != "nmaprun" {
                        return Err("invalid Nmap XML: expected one nmaprun root".into());
                    }
                    root_seen = true;
                }
                depth += 1;

                match element.name().as_ref() {
                    "port" => current_port = start_port(&element),
                    "state" => {
                        if let Some(port) = current_port.as_mut() {
                            port.state = attribute(&element, "state");
                        }
                    }
                    "service" => {
                        if let Some(port) = current_port.as_mut() {
                            port.service_name = attribute(&element, "name");
                            port.service_method = attribute(&element, "method");
                            port.product = attribute(&element, "product");
                            port.version = attribute(&element, "version");
                            port.tunnel = attribute(&element, "tunnel");
                        }
                    }
                    "osmatch" => keep_best_os_match(&mut output, parse_os_match(&element)),
                    _ => {}
                }
            }
            Ok(Event::Empty(element)) => {
                if depth == 0 {
                    if root_seen || element.name().as_ref() != "nmaprun" {
                        return Err("invalid Nmap XML: expected one nmaprun root".into());
                    }
                    root_seen = true;
                    root_closed = true;
                }
                match element.name().as_ref() {
                    "port" => {
                        if let Some(port) = start_port(&element).and_then(CurrentPort::finish) {
                            output.ports.push(port);
                        }
                    }
                    "state" => {
                        if let Some(port) = current_port.as_mut() {
                            port.state = attribute(&element, "state");
                        }
                    }
                    "service" => {
                        if let Some(port) = current_port.as_mut() {
                            port.service_name = attribute(&element, "name");
                            port.service_method = attribute(&element, "method");
                            port.product = attribute(&element, "product");
                            port.version = attribute(&element, "version");
                            port.tunnel = attribute(&element, "tunnel");
                        }
                    }
                    "osmatch" => keep_best_os_match(&mut output, parse_os_match(&element)),
                    _ => {}
                }
            }
            Ok(Event::End(element)) => {
                if depth == 0 {
                    return Err("invalid Nmap XML: unexpected closing element".into());
                }
                if element.name().as_ref() == "port" {
                    if let Some(port) = current_port.take().and_then(CurrentPort::finish) {
                        output.ports.push(port);
                    }
                }
                depth -= 1;
                if depth == 0 {
                    root_closed = true;
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("invalid Nmap XML: {error}")),
        }
        buf.clear();
    }

    if !root_seen || !root_closed || depth != 0 {
        return Err("invalid Nmap XML: incomplete document".into());
    }

    output.ports.sort_by_key(|port| port.port);
    output.ports.dedup_by_key(|port| port.port);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_service_and_best_os_match_without_exposing_arbitrary_xml() {
        let xml = r#"<?xml version="1.0"?>
            <nmaprun>
              <host>
                <ports>
                  <port protocol="tcp" portid="443">
                    <state state="open" reason="syn-ack"/>
                    <service name="http" method="probed" product="Example &amp; Co" version="2.1" tunnel="ssl"/>
                  </port>
                  <port protocol="udp" portid="53">
                    <state state="open"/>
                    <service name="domain"/>
                  </port>
                </ports>
                <os>
                  <osmatch name="Apple macOS 15" accuracy="88"><osclass/></osmatch>
                  <osmatch name="Apple macOS 15.1" accuracy="94"><osclass/></osmatch>
                </os>
              </host>
            </nmaprun>"#;

        let parsed = parse_nmap_xml(xml).expect("valid XML");
        assert_eq!(parsed.ports.len(), 1);
        assert_eq!(parsed.ports[0].port, 443);
        assert_eq!(parsed.ports[0].state, "open");
        assert_eq!(parsed.ports[0].service_name.as_deref(), Some("http"));
        assert_eq!(parsed.ports[0].service_method.as_deref(), Some("probed"));
        assert_eq!(parsed.ports[0].product.as_deref(), Some("Example & Co"));
        assert_eq!(parsed.ports[0].version.as_deref(), Some("2.1"));
        assert_eq!(parsed.ports[0].tunnel.as_deref(), Some("ssl"));
        assert_eq!(
            parsed.os_match,
            Some(NmapOsMatch {
                name: "Apple macOS 15.1".into(),
                accuracy: 94,
            })
        );
    }

    #[test]
    fn rejects_invalid_os_accuracy_and_malformed_xml_safely() {
        let parsed = parse_nmap_xml(
            r#"<nmaprun><host><os><osmatch name="guess" accuracy="101"/></os></host></nmaprun>"#,
        )
        .expect("well-formed XML");
        assert!(parsed.os_match.is_none());
        assert!(parse_nmap_xml("<nmaprun>").is_err());
        assert!(parse_nmap_xml("<nmaprun><host></nmaprun>").is_err());
        assert!(parse_nmap_xml("<nmaprun/><nmaprun/>").is_err());
        assert!(parse_nmap_xml("<other/>").is_err());
        assert!(parse_nmap_xml("<nmaprun/>").is_ok());
    }
}

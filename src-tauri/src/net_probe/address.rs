use std::net::Ipv6Addr;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Ipv6AddressScope {
    LinkLocal,
    UniqueLocal,
    GlobalUnicast,
}

pub(super) fn classify_ipv6_address(address: Ipv6Addr) -> Option<Ipv6AddressScope> {
    if address.is_unicast_link_local() {
        return Some(Ipv6AddressScope::LinkLocal);
    }
    if address.is_unique_local() {
        return Some(Ipv6AddressScope::UniqueLocal);
    }
    // RFC 4291 currently defines global unicast space as 2000::/3.
    if address.segments()[0] & 0xe000 != 0x2000
        || address.is_unspecified()
        || address.is_loopback()
        || address.is_multicast()
    {
        return None;
    }
    Some(Ipv6AddressScope::GlobalUnicast)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn classify(input: &str) -> Option<Ipv6AddressScope> {
        classify_ipv6_address(input.parse().expect("test address should parse"))
    }

    #[test]
    fn distinguishes_link_local_unique_local_and_global_unicast() {
        assert_eq!(classify("fe80::1"), Some(Ipv6AddressScope::LinkLocal));
        assert_eq!(
            classify("fd12:3456::1"),
            Some(Ipv6AddressScope::UniqueLocal)
        );
        assert_eq!(
            classify("2001:4860:4860::8888"),
            Some(Ipv6AddressScope::GlobalUnicast)
        );
    }

    #[test]
    fn ignores_non_host_addresses_and_ipv4_mapped_addresses() {
        assert_eq!(classify("::"), None);
        assert_eq!(classify("::1"), None);
        assert_eq!(classify("ff02::1"), None);
        assert_eq!(classify("::ffff:192.0.2.1"), None);
        assert_eq!(classify("fec0::1"), None);
    }
}

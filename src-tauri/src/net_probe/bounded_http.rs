//! Bounded streaming reads for remote HTTP responses.

use futures_util::StreamExt;
use reqwest::Response;

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct BoundedBody {
    pub bytes: Vec<u8>,
    pub truncated: bool,
}

/// Read at most `max_bytes`, retaining a prefix when a response exceeds the limit.
pub(crate) async fn read_response_body_limited(
    response: Response,
    max_bytes: usize,
) -> Result<BoundedBody, reqwest::Error> {
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::with_capacity(max_bytes.min(16 * 1024));

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        let remaining = max_bytes.saturating_sub(bytes.len());
        if chunk.len() > remaining {
            bytes.extend_from_slice(&chunk[..remaining]);
            return Ok(BoundedBody {
                bytes,
                truncated: true,
            });
        }
        bytes.extend_from_slice(&chunk);
    }

    Ok(BoundedBody {
        bytes,
        truncated: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    async fn response_with_body(body: &'static [u8]) -> Response {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test server");
        let address = listener.local_addr().expect("test server address");
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept request");
            let mut request = [0_u8; 1024];
            let _ = socket.read(&mut request).await;
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            socket
                .write_all(header.as_bytes())
                .await
                .expect("write headers");
            socket.write_all(body).await.expect("write body");
        });
        reqwest::Client::new()
            .get(format!("http://{address}/"))
            .send()
            .await
            .expect("receive test response")
    }

    #[tokio::test]
    async fn caps_large_response_and_marks_prefix_truncated() {
        let response = response_with_body(b"0123456789").await;

        let body = read_response_body_limited(response, 4)
            .await
            .expect("read bounded body");

        assert_eq!(body.bytes, b"0123");
        assert!(body.truncated);
    }

    #[tokio::test]
    async fn exact_limit_response_is_not_truncated() {
        let response = response_with_body(b"1234").await;

        let body = read_response_body_limited(response, 4)
            .await
            .expect("read bounded body");

        assert_eq!(body.bytes, b"1234");
        assert!(!body.truncated);
    }
}

//! macOS WKWebView scroll tweaks — disable native rubber-band overscroll.

pub fn schedule_disable_overscroll_bounce(window: tauri::WebviewWindow) {
    tauri::async_runtime::spawn(async move {
        for delay_ms in [0u64, 200, 600, 1500, 4000] {
            if delay_ms > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
            }
            let win = window.clone();
            if let Err(e) = win.run_on_main_thread({
                let win = win.clone();
                move || {
                    if let Ok(found) = disable_overscroll_bounce(&win) {
                        if found > 0 {
                            eprintln!(
                                "[macos] disabled overscroll bounce on {found} scroll view(s)"
                            );
                        }
                    }
                }
            }) {
                eprintln!("[macos] schedule disable overscroll bounce failed: {e:?}");
            }
        }
    });
}

fn disable_overscroll_bounce(window: &tauri::WebviewWindow) -> Result<usize, tauri::Error> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    let found = Arc::new(AtomicUsize::new(0));
    let found_in_closure = Arc::clone(&found);
    window.with_webview(move |webview| {
        use objc2::msg_send;
        use objc2::rc::Retained;
        use objc2::runtime::{AnyObject, Bool};
        use objc2_app_kit::NSView;
        use objc2_foundation::NSArray;
        use objc2_web_kit::WKWebView;

        unsafe {
            let view: *mut WKWebView = webview.inner().cast();
            if view.is_null() {
                return;
            }
            let mut stack: Vec<*mut AnyObject> = vec![view as *mut AnyObject];
            while let Some(node) = stack.pop() {
                if node.is_null() {
                    continue;
                }
                let class_name = (*node).class().name().to_str().unwrap_or("");
                if class_name.contains("ScrollView") || class_name.contains("WKScroll") {
                    let _: () = msg_send![node, setBounces: Bool::NO];
                    let _: () = msg_send![node, setAlwaysBouncesVertical: Bool::NO];
                    let _: () = msg_send![node, setAlwaysBouncesHorizontal: Bool::NO];
                    let _: () = msg_send![node, setVerticalScrollElasticity: 0isize];
                    let _: () = msg_send![node, setHorizontalScrollElasticity: 0isize];
                    found_in_closure.fetch_add(1, Ordering::Relaxed);
                }
                let subs: Retained<NSArray<NSView>> = msg_send![node, subviews];
                let cnt = subs.count();
                for i in 0..cnt {
                    let sub: Retained<NSView> = subs.objectAtIndex(i);
                    stack.push(Retained::as_ptr(&sub) as *mut AnyObject);
                }
            }
        }
    })?;
    Ok(found.load(Ordering::Relaxed))
}

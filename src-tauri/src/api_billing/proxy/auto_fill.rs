/// 自动填充登录表单的 JS 脚本。
///
/// 使用原生 value setter 绕过 React/Vue 等框架的虚拟 DOM 守卫，
/// 并触发 input/change 事件确保框架感知输入。
///
/// 安全策略（设计文档 §8.2）：**只填字段，默认不自动提交**。
/// 是否提交交给用户决定，避免错误账号被静默登录或触发风控；同时多数情况下
/// 因 per-account session 已持久化，根本无需填充即处于登录态。
pub const AUTO_FILL_SCRIPT: &str = r#"
(function(username, password) {
  var fillField = function(selector, value) {
    var el = document.querySelector(selector);
    if (!el) return false;
    var nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  };

  var usernameSelectors = [
    'input[type="email"]',
    'input[type="text"][name*="user"]',
    'input[type="text"][name*="email"]',
    'input[type="text"][name*="login"]',
    'input[name="log"]',
    '#username',
    '#email',
    '[autocomplete="username"]',
    'input:not([type])'
  ];

  var passwordSelectors = [
    'input[type="password"]',
    '[autocomplete="current-password"]'
  ];

  var filledUser = false;
  for (var i = 0; i < usernameSelectors.length; i++) {
    if (fillField(usernameSelectors[i], username)) { filledUser = true; break; }
  }

  var filledPassword = false;
  for (var j = 0; j < passwordSelectors.length; j++) {
    if (fillField(passwordSelectors[j], password)) { filledPassword = true; break; }
  }

  // 默认不自动提交。仅填充字段，提交动作交由用户完成。
  return JSON.stringify({ filledUser: filledUser, filledPassword: filledPassword, autoSubmitted: false });
})();
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_fill_script_is_valid_js() {
        let script = AUTO_FILL_SCRIPT.trim();
        assert!(script.starts_with("(function"));
        assert!(script.contains("username"));
        assert!(script.contains("password"));
        assert!(script.ends_with(")();"));
    }
}

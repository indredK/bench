use std::future::Future;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{Runtime, WebviewWindow};

use super::crypto;
use super::session::evaluate_js;
use super::state::AccountManagerState;
use super::types::{AccountManagerError, AccountManagerResult, AccountSession, OriginStorage};

const CAPTURE_TIMEOUT: Duration = Duration::from_secs(10);
/// 等待页面内恢复脚本到达终态的上限。
///
/// 对 WebView 与 CDP 两条链路共用（CDP 侧显式传入本常量）：同一份 S1 回放到
/// 不同端点，「多久算恢复失败」的判定必须一致（D-028 决议 6）。
pub(crate) const RESTORE_TIMEOUT: Duration = Duration::from_secs(10);
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const MAX_BRIDGE_PAYLOAD_BYTES: usize = 12 * 1024 * 1024;
const MAX_RESTORE_SCRIPT_BYTES: usize = 16 * 1024 * 1024;

/// 恢复脚本写进页面的状态槽位名。
///
/// **模板与等待器必须共用这一个常量**：两侧字面量一旦漂移，等待器永远读到
/// `pending`、把已经成功的恢复报成超时，而这条判据是 WebView 与 CDP 两条链路
/// 唯一的自证手段（恢复脚本本身在页面里静默执行，没有任何回传通道）。
pub(crate) const RESTORE_STATE_SLOT: &str = "__BENCH_SESSION_RESTORE__";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndexedDbCaptureStatus {
    Complete,
    Unsupported,
    Limited,
    Failed,
}

pub struct OriginCaptureResult {
    pub storage: OriginStorage,
    pub indexed_db_status: IndexedDbCaptureStatus,
    pub has_data: bool,
}

/// capture 脚本写入 `window[slot]` 的桥接状态（WebView 与 CDP 两条路径共用）。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BridgeState {
    pub(crate) status: String,
    #[serde(default)]
    pub(crate) payload: Option<String>,
    #[serde(default)]
    pub(crate) reason_code: Option<String>,
}

impl BridgeState {
    /// 解析 capture 脚本产出的原始 JSON 文本（CDP 路径用）。
    pub(crate) fn parse(raw: &str) -> AccountManagerResult<Self> {
        serde_json::from_str(raw)
            .map_err(|e| AccountManagerError::store_fail(format!("decode storage bridge: {e}")))
    }

    /// 生成「读取该槽位当前状态」的 JS 表达式（WebView 与 CDP 共用）。
    pub(crate) fn poll_expression(slot: &str) -> String {
        format!(
            "JSON.stringify(window[{}]||{{status:'pending'}})",
            json!(slot)
        )
    }

    /// 清理槽位，避免在页面里留下快照残留。
    pub(crate) fn cleanup_expression(slot: &str) -> String {
        format!("delete window[{}]", json!(slot))
    }

    /// 从完成的桥接状态中取出并构造 `OriginCaptureResult`（含上限与 origin 校验）。
    pub(crate) fn into_capture(
        self,
        state: &AccountManagerState,
        expected_origin: &str,
    ) -> AccountManagerResult<OriginCaptureResult> {
        if self.status != "complete" {
            return Err(AccountManagerError::store_fail(format!(
                "storage capture failed ({})",
                self.reason_code.as_deref().unwrap_or("UNKNOWN")
            )));
        }
        let payload = self
            .payload
            .ok_or_else(|| AccountManagerError::store_fail("storage capture payload missing"))?;
        decode_captured_payload(state, &payload, expected_origin)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserCapture {
    origin: String,
    local_storage: Vec<StorageEntry>,
    session_storage: Vec<StorageEntry>,
    indexed_db: IndexedDbCapture,
}

#[derive(Deserialize, serde::Serialize)]
struct StorageEntry {
    name: String,
    value: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexedDbCapture {
    status: String,
    #[serde(default)]
    snapshot: Option<Value>,
}

pub async fn capture_current_origin<R: Runtime>(
    window: &WebviewWindow<R>,
    state: &AccountManagerState,
    allowed_url: &str,
) -> AccountManagerResult<Option<OriginCaptureResult>> {
    let current_url = window
        .url()
        .map_err(|e| AccountManagerError::store_fail(format!("read WebView URL: {e}")))?;
    if !matches!(current_url.scheme(), "http" | "https") {
        return Ok(None);
    }
    let expected_origin = current_url.origin().ascii_serialization();
    let allowed = url::Url::parse(allowed_url)
        .map_err(|_| AccountManagerError::invalid_input("storage capture URL is invalid"))?;
    // 不需要严格 origin 相等：站点可能把登录页 www → apex 重定向（trae.cn 实测，
    // 2026-09-11），localStorage 落在与 login_detection 配的 website 不同的
    // origin 上。只要求「同 scheme + 同可注册域」（www/apex/api 互相兼容），
    // 采集脚本记录的是**当前文档**的 location.origin，进去仍按实际 origin
    // 加密存储并校验，不会张冠李戴；跨无关站点依旧拒绝。
    let same_site = match (current_url.host_str(), allowed.host_str()) {
        (Some(current_host), Some(allowed_host)) => {
            current_url.scheme() == allowed.scheme()
                && super::session::hosts_share_registrable_domain(current_host, allowed_host)
        }
        _ => false,
    };
    if !same_site {
        return Ok(None);
    }
    let slot = new_capture_slot();
    let script = capture_script(&slot)?;
    window
        .eval(script)
        .map_err(|e| AccountManagerError::store_fail(format!("start storage capture: {e}")))?;

    let bridge = poll_bridge(window, &slot, CAPTURE_TIMEOUT).await?;
    let _ = window.eval(BridgeState::cleanup_expression(&slot));
    bridge.into_capture(state, &expected_origin).map(Some)
}

/// 生成一个新的 capture 桥接槽位名（WebView 与 CDP 两条路径共用命名约定）。
pub(crate) fn new_capture_slot() -> String {
    format!("__BENCH_STORAGE_CAPTURE_{}", uuid::Uuid::new_v4().simple())
}

/// 把 capture 脚本产出的 payload 解码 → 加密 → [`OriginCaptureResult`]。
///
/// 互通 I2 复用点：CDP 路径与 WebView 路径共用同一份脚本与上限规则，保证两条
/// 端点的捕获语义（origin 精确匹配、体积上限、IndexedDB fail-closed）完全一致。
fn decode_captured_payload(
    state: &AccountManagerState,
    payload: &str,
    expected_origin: &str,
) -> AccountManagerResult<OriginCaptureResult> {
    if payload.len() > MAX_BRIDGE_PAYLOAD_BYTES {
        return Err(AccountManagerError::store_fail(
            "storage capture payload exceeds limit",
        ));
    }
    let captured: BrowserCapture = serde_json::from_str(payload)
        .map_err(|e| AccountManagerError::store_fail(format!("decode storage capture: {e}")))?;
    if captured.origin != expected_origin {
        return Err(AccountManagerError::store_fail(
            "storage capture origin changed during evaluation",
        ));
    }

    let key = state.master_key()?;
    let local_json = serde_json::to_string(&captured.local_storage)
        .map_err(|e| AccountManagerError::store_fail(format!("encode localStorage: {e}")))?;
    let session_json = serde_json::to_string(&captured.session_storage)
        .map_err(|e| AccountManagerError::store_fail(format!("encode sessionStorage: {e}")))?;
    let indexed_db_status = match captured.indexed_db.status.as_str() {
        "complete" => IndexedDbCaptureStatus::Complete,
        "unsupported" => IndexedDbCaptureStatus::Unsupported,
        "limited" => IndexedDbCaptureStatus::Limited,
        _ => IndexedDbCaptureStatus::Failed,
    };
    let indexed_db = match captured.indexed_db.snapshot {
        Some(snapshot) if indexed_db_status == IndexedDbCaptureStatus::Complete => {
            let encoded = serde_json::to_string(&snapshot).map_err(|e| {
                AccountManagerError::store_fail(format!("encode IndexedDB snapshot: {e}"))
            })?;
            Some(crypto::encrypt(&key, &encoded)?)
        }
        _ => None,
    };
    let has_data = !captured.local_storage.is_empty()
        || !captured.session_storage.is_empty()
        || indexed_db.is_some();

    Ok(OriginCaptureResult {
        storage: OriginStorage {
            origin: expected_origin.to_string(),
            local_storage: Some(crypto::encrypt(&key, &local_json)?),
            session_storage: Some(crypto::encrypt(&key, &session_json)?),
            indexed_db,
        },
        indexed_db_status,
        has_data,
    })
}

pub fn merge_origin(session: &mut AccountSession, captured: OriginStorage) {
    if let Some(existing) = session
        .origins
        .iter_mut()
        .find(|origin| origin.origin == captured.origin)
    {
        *existing = captured;
    } else {
        session.origins.push(captured);
        session
            .origins
            .sort_by(|left, right| left.origin.cmp(&right.origin));
    }
}

/// 校验存储 origin 是 canonical 的 http(s) origin（WebView 与扩展通道共用同一约束）。
fn ensure_canonical_http_origin(origin: &str) -> AccountManagerResult<()> {
    let parsed = url::Url::parse(origin)
        .map_err(|_| AccountManagerError::store_fail("stored Web Storage origin is invalid"))?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.origin().ascii_serialization() != origin
    {
        return Err(AccountManagerError::store_fail(
            "stored Web Storage origin is not canonical",
        ));
    }
    Ok(())
}

/// 组装「存储恢复载荷」——扩展通道（bench-companion ≥ 0.5）的注入数据。
///
/// 载荷形状与 [`RESTORE_SCRIPT_TEMPLATE`] 的 origin 分支**完全一致**
///（`{origin, localStorage: [{name,value}], sessionStorage: [{name,value}], indexedDb}`），
/// 执行器是模板的扩展侧等价物，双端以载荷 JSON 为唯一 schema 锚点，改动必须同步。
///
/// **IndexedDB 自 bench-companion 0.5 起随载荷下发**：扩展在页面上下文
///（MAIN world）执行与本模板同语义的恢复脚本。原先「不下发」的理由是
/// IndexedDB 无法廉价备份、误覆盖不可逆；现在扩展写入前会先以与采集端
/// 同构的快照脚本把该站点现有 IndexedDB 备份进 `chrome.storage.local`
///（manifest 已带 `unlimitedStorage` 解除体积顾虑），备份不完整则拒绝覆盖
///（fail-closed），误覆盖可经「一键回滚」恢复——前提已不成立。
///
/// `indexedDb` 为 `null` 表示该 origin 没有可用的 IndexedDB 快照（未采集 /
/// 采集 limited / failed），扩展侧据此跳过对应步骤。
///
/// 返回 `None` 表示该会话没有存储快照。
pub fn storage_restore_payload(
    state: &AccountManagerState,
    session: &AccountSession,
) -> AccountManagerResult<Option<Vec<Value>>> {
    if session.origins.is_empty() {
        return Ok(None);
    }
    let mut payload = Vec::new();
    for origin in &session.origins {
        ensure_canonical_http_origin(&origin.origin)?;
        payload.push(json!({
            "origin": origin.origin,
            "localStorage": decrypt_json_array(state, origin.local_storage.as_ref(), "localStorage")?,
            "sessionStorage": decrypt_json_array(
                state,
                origin.session_storage.as_ref(),
                "sessionStorage",
            )?,
            "indexedDb": decrypt_json_value(state, origin.indexed_db.as_ref(), "IndexedDB")?,
        }));
    }
    Ok(Some(payload))
}

pub fn restore_initialization_script(
    state: &AccountManagerState,
    session: &AccountSession,
) -> AccountManagerResult<Option<String>> {
    if session.origins.is_empty() {
        return Ok(None);
    }
    let key = state.master_key()?;
    let mut branches = String::new();
    for origin in &session.origins {
        ensure_canonical_http_origin(&origin.origin)?;
        let local = decrypt_json_array(state, origin.local_storage.as_ref(), "localStorage")?;
        let session_storage =
            decrypt_json_array(state, origin.session_storage.as_ref(), "sessionStorage")?;
        let indexed_db = decrypt_json_value(state, origin.indexed_db.as_ref(), "IndexedDB")?;
        let payload = json!({
            "origin": origin.origin,
            "localStorage": local,
            "sessionStorage": session_storage,
            "indexedDb": indexed_db,
        });
        branches.push_str(&format!(
            "if(location.origin==={}){{selected={};}}else ",
            json!(origin.origin),
            payload
        ));
    }
    branches.push_str("{selected=null;}");

    let script = RESTORE_SCRIPT_TEMPLATE
        // 槽位名先替换、origin 分支后替换：分支里嵌的是站点存储原文，反过来
        // 时页面数据中恰好含 `__RESTORE_SLOT__` 字面量就会被改名，篡改恢复载荷。
        .replace("__RESTORE_SLOT__", RESTORE_STATE_SLOT)
        .replace("__ORIGIN_BRANCHES__", &branches);
    if script.len() > MAX_RESTORE_SCRIPT_BYTES {
        return Err(AccountManagerError::store_fail(
            "storage restore script exceeds limit",
        ));
    }
    let _ = key;
    Ok(Some(script))
}

/// 该会话是否带 IndexedDB 快照（任一 origin 有即算）。
///
/// 决定出向注入后要不要把页面再导航一次：只有 IndexedDB 是异步落库的，
/// Web Storage 同步写完页面首次读取就能看到。
pub(crate) fn has_indexed_db_snapshot(session: &AccountSession) -> bool {
    session
        .origins
        .iter()
        .any(|origin| origin.indexed_db.is_some())
}

/// 页面内恢复脚本的终态（由 [`RESTORE_SCRIPT_TEMPLATE`] 写进状态槽位）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RestoreTerminal {
    /// 存储已落盘（Web Storage 同步完成 + IndexedDB 事务全部提交）。
    Complete,
    /// 当前文档 origin 不在本次恢复载荷里，脚本主动什么都不做。
    Skipped,
    /// 脚本自己报失败，`reason` 是页面里的 reasonCode / 异常 message。
    Failed { reason: String },
    /// 到时限仍未观察到终态。
    Timeout,
}

impl RestoreTerminal {
    /// 给前端的形态（`BrowserOpenOutcome::storage_restore_status`）：
    /// `complete` / `skipped` / `failed:<reason>` / `timeout`。
    pub(crate) fn as_status(&self) -> String {
        match self {
            Self::Complete => "complete".to_string(),
            Self::Skipped => "skipped".to_string(),
            Self::Failed { reason } => format!("failed:{reason}"),
            Self::Timeout => "timeout".to_string(),
        }
    }
}

/// 轮询页面里的恢复状态直到终态 —— **运行时无关**的等待器。
///
/// WebView（`eval_with_callback`）与 CDP（`Runtime.evaluate`）只提供一个
/// 「给表达式、回字符串」的闭包，「什么算恢复完成」的判定与轮询节奏只此一份：
/// 同一份 S1 回放到两个端点必须给出同一个结论，否则浏览器端点会静默地比
/// WebView 端点少一道自证（CDP 链路正是因缺这一步而对 IndexedDB 站点报假成功）。
///
/// `Err` 只表示**轮询通道本身**不可用（求值失败 / 返回不是合法 JSON）；
/// 恢复失败是 `Failed`，其 reason 来自页面自己的 reasonCode，比通道错误可诊断得多。
pub(crate) async fn wait_for_restore_terminal<F, Fut>(
    mut evaluate: F,
    timeout: Duration,
) -> AccountManagerResult<RestoreTerminal>
where
    F: FnMut(String) -> Fut,
    Fut: Future<Output = AccountManagerResult<String>>,
{
    let expression = BridgeState::poll_expression(RESTORE_STATE_SLOT);
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let raw = evaluate(expression.clone()).await?;
        let bridge: BridgeState = serde_json::from_str(&raw)
            .map_err(|e| AccountManagerError::store_fail(format!("decode restore state: {e}")))?;
        match bridge.status.as_str() {
            "complete" => return Ok(RestoreTerminal::Complete),
            "skipped" => return Ok(RestoreTerminal::Skipped),
            "failed" => {
                return Ok(RestoreTerminal::Failed {
                    reason: bridge.reason_code.unwrap_or_else(|| "UNKNOWN".to_string()),
                })
            }
            _ => tokio::time::sleep(POLL_INTERVAL).await,
        }
    }
    Ok(RestoreTerminal::Timeout)
}

/// WebView 侧的薄封装：运行时适配 + 把「未成功」折成错误（调用点全部用 `?` 上抛）。
pub async fn wait_for_restore<R: Runtime>(window: &WebviewWindow<R>) -> AccountManagerResult<()> {
    let terminal = wait_for_restore_terminal(
        |expression: String| async move { evaluate_js(window, &expression).await },
        RESTORE_TIMEOUT,
    )
    .await?;
    match terminal {
        RestoreTerminal::Complete | RestoreTerminal::Skipped => Ok(()),
        RestoreTerminal::Failed { reason } => Err(AccountManagerError::store_fail(format!(
            "storage restore failed ({reason})"
        ))),
        RestoreTerminal::Timeout => Err(AccountManagerError::store_fail("storage restore timeout")),
    }
}

fn decrypt_json_array(
    state: &AccountManagerState,
    blob: Option<&super::crypto::EncryptedBlob>,
    label: &str,
) -> AccountManagerResult<Value> {
    let value = decrypt_json_value(state, blob, label)?.unwrap_or_else(|| json!([]));
    if !value.is_array() {
        return Err(AccountManagerError::store_fail(format!(
            "stored {label} payload is not an array"
        )));
    }
    Ok(value)
}

fn decrypt_json_value(
    state: &AccountManagerState,
    blob: Option<&super::crypto::EncryptedBlob>,
    label: &str,
) -> AccountManagerResult<Option<Value>> {
    let Some(blob) = blob else { return Ok(None) };
    let plaintext = crypto::decrypt(&state.master_key()?, blob)?;
    if plaintext.len() > MAX_BRIDGE_PAYLOAD_BYTES {
        return Err(AccountManagerError::store_fail(format!(
            "stored {label} payload exceeds limit"
        )));
    }
    serde_json::from_str(&plaintext)
        .map(Some)
        .map_err(|e| AccountManagerError::store_fail(format!("decode stored {label}: {e}")))
}

async fn poll_bridge<R: Runtime>(
    window: &WebviewWindow<R>,
    slot: &str,
    timeout: Duration,
) -> AccountManagerResult<BridgeState> {
    let expression = BridgeState::poll_expression(slot);
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let raw = evaluate_js(window, &expression).await?;
        if raw.len() > MAX_BRIDGE_PAYLOAD_BYTES {
            return Err(AccountManagerError::store_fail(
                "storage bridge payload exceeds limit",
            ));
        }
        let bridge = BridgeState::parse(&raw)?;
        if bridge.status != "pending" {
            return Ok(bridge);
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
    Err(AccountManagerError::store_fail("storage capture timeout"))
}

/// 生成一页 capture 脚本（供 WebView `eval` 与 CDP `Runtime.evaluate` 共用）。
pub(crate) fn capture_script(slot: &str) -> AccountManagerResult<String> {
    let slot_json = serde_json::to_string(slot)
        .map_err(|e| AccountManagerError::store_fail(format!("encode capture slot: {e}")))?;
    Ok(CAPTURE_SCRIPT_TEMPLATE.replace("__SLOT__", &slot_json))
}

const CAPTURE_SCRIPT_TEMPLATE: &str = r#"
(function(){
  const slot=__SLOT__;
  window[slot]={status:'pending'};
  const MAX_STORAGE_KEYS=512,MAX_STORAGE_BYTES=2097152,MAX_DATABASES=32;
  const MAX_STORES=128,MAX_RECORDS=10000,MAX_INDEXED_DB_BYTES=8388608;
  const fail=(code)=>{window[slot]={status:'failed',reasonCode:code};};
  const storageEntries=(storage)=>{
    if(storage.length>MAX_STORAGE_KEYS)throw new Error('WEB_STORAGE_KEY_LIMIT');
    const out=[];let bytes=0;
    for(let i=0;i<storage.length;i++){
      const name=storage.key(i);if(name===null)continue;
      const value=storage.getItem(name);if(value===null)continue;
      bytes+=(name.length+value.length)*2;
      if(bytes>MAX_STORAGE_BYTES)throw new Error('WEB_STORAGE_SIZE_LIMIT');
      out.push({name,value});
    }
    return out;
  };
  const bytesToBase64=(bytes)=>{
    let binary='';
    for(let i=0;i<bytes.length;i+=32768){
      binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+32768,bytes.length)));
    }
    return btoa(binary);
  };
  const encode=(value,seen,depth)=>{
    if(depth>64)throw new Error('INDEXED_DB_VALUE_DEPTH_LIMIT');
    if(value===null)return{t:'null'};
    const type=typeof value;
    if(type==='string'||type==='boolean')return{t:type,v:value};
    if(type==='undefined')return{t:'undefined'};
    if(type==='number'){
      if(Number.isNaN(value))return{t:'number',v:'NaN'};
      if(value===Infinity)return{t:'number',v:'Infinity'};
      if(value===-Infinity)return{t:'number',v:'-Infinity'};
      if(Object.is(value,-0))return{t:'number',v:'-0'};
      return{t:'number',v:value};
    }
    if(type==='bigint')return{t:'bigint',v:String(value)};
    if(type!=='object')throw new Error('INDEXED_DB_VALUE_TYPE_UNSUPPORTED');
    if(seen.has(value))throw new Error('INDEXED_DB_CIRCULAR_VALUE_UNSUPPORTED');
    seen.add(value);
    try{
      if(value instanceof Date)return{t:'date',v:value.toISOString()};
      if(value instanceof RegExp)return{t:'regexp',v:value.source,f:value.flags};
      if(value instanceof ArrayBuffer)return{t:'arrayBuffer',v:bytesToBase64(new Uint8Array(value))};
      if(ArrayBuffer.isView(value))return{t:'typedArray',c:value.constructor.name,v:bytesToBase64(new Uint8Array(value.buffer,value.byteOffset,value.byteLength))};
      if(Array.isArray(value))return{t:'array',v:value.map((item)=>encode(item,seen,depth+1))};
      if(value instanceof Map)return{t:'map',v:Array.from(value.entries(),([k,v])=>[encode(k,seen,depth+1),encode(v,seen,depth+1)])};
      if(value instanceof Set)return{t:'set',v:Array.from(value.values(),(item)=>encode(item,seen,depth+1))};
      const proto=Object.getPrototypeOf(value);
      if(proto!==Object.prototype&&proto!==null)throw new Error('INDEXED_DB_VALUE_TYPE_UNSUPPORTED');
      return{t:'object',v:Object.keys(value).map((key)=>[key,encode(value[key],seen,depth+1)])};
    }finally{seen.delete(value);}
  };
  const request=(req)=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('INDEXED_DB_REQUEST_FAILED'));});
  const transactionDone=(tx)=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('INDEXED_DB_TRANSACTION_ABORTED'));tx.onerror=()=>reject(tx.error||new Error('INDEXED_DB_TRANSACTION_FAILED'));});
  const openExisting=(name)=>new Promise((resolve,reject)=>{
    const req=indexedDB.open(name);let created=false;
    req.onupgradeneeded=()=>{created=req.oldVersion===0;try{req.transaction.abort();}catch(_){}}
    req.onsuccess=()=>{if(created){req.result.close();reject(new Error('INDEXED_DB_CHANGED_DURING_CAPTURE'));}else resolve(req.result);};
    req.onerror=()=>reject(req.error||new Error('INDEXED_DB_OPEN_FAILED'));
    req.onblocked=()=>reject(new Error('INDEXED_DB_BLOCKED'));
  });
  const captureIndexedDb=async()=>{
    if(!globalThis.indexedDB||typeof indexedDB.databases!=='function')return{status:'unsupported'};
    try{
      const infos=(await indexedDB.databases()).filter((info)=>typeof info.name==='string'&&info.name.length>0);
      if(infos.length>MAX_DATABASES)return{status:'limited'};
      const databases=[];let totalStores=0,totalRecords=0;
      for(const info of infos){
        const db=await openExisting(info.name);
        try{
          const storeNames=Array.from(db.objectStoreNames);
          totalStores+=storeNames.length;if(totalStores>MAX_STORES)return{status:'limited'};
          if(storeNames.length===0){databases.push({name:db.name,version:db.version,stores:[]});continue;}
          const tx=db.transaction(storeNames,'readonly');
          const stores=storeNames.map((name)=>{
            const store=tx.objectStore(name);
            const indexes=Array.from(store.indexNames,(indexName)=>{const index=store.index(indexName);return{name:index.name,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry};});
            const records=[];
            const read=new Promise((resolve,reject)=>{
              const cursorRequest=store.openCursor();
              cursorRequest.onerror=()=>reject(cursorRequest.error||new Error('INDEXED_DB_CURSOR_FAILED'));
              cursorRequest.onsuccess=()=>{
                const cursor=cursorRequest.result;if(!cursor){resolve();return;}
                totalRecords++;if(totalRecords>MAX_RECORDS){reject(new Error('INDEXED_DB_RECORD_LIMIT'));return;}
                records.push({key:encode(cursor.primaryKey,new Set(),0),value:encode(cursor.value,new Set(),0)});
                cursor.continue();
              };
            });
            return{metadata:{name:store.name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes},records,read};
          });
          await Promise.all(stores.map((store)=>store.read));await transactionDone(tx);
          databases.push({name:db.name,version:db.version,stores:stores.map(({metadata,records})=>({...metadata,records}))});
        }finally{db.close();}
      }
      const snapshot={version:1,databases};
      if(JSON.stringify(snapshot).length*2>MAX_INDEXED_DB_BYTES)return{status:'limited'};
      return{status:'complete',snapshot};
    }catch(error){
      const code=error&&typeof error.message==='string'?error.message:'INDEXED_DB_CAPTURE_FAILED';
      if(code.includes('LIMIT'))return{status:'limited'};
      return{status:'failed'};
    }
  };
  (async()=>{
    try{
      const result={origin:location.origin,localStorage:storageEntries(localStorage),sessionStorage:storageEntries(sessionStorage),indexedDb:await captureIndexedDb()};
      const payload=JSON.stringify(result);
      if(payload.length*2>12582912){fail('STORAGE_CAPTURE_SIZE_LIMIT');return;}
      window[slot]={status:'complete',payload};
    }catch(error){fail(error&&typeof error.message==='string'?error.message:'STORAGE_CAPTURE_FAILED');}
  })();
})();
"#;

/// 恢复脚本模板（WebView `initialization_script` 与 CDP
/// `Page.addScriptToEvaluateOnNewDocument` 共用）。
///
/// `__RESTORE_SLOT__` 由 [`RESTORE_STATE_SLOT`] 替换（等待器读的就是这个槽位，
/// 名字必须同源），`__ORIGIN_BRANCHES__` 由
/// [`restore_initialization_script`] 按会话里的 origin 逐个拼出。
///
/// **IndexedDB 恢复是异步的**（`restoreDatabase` 走 `open` → `transaction` →
/// `complete` 事件链），所以脚本先同步写完 Web Storage、再把 IDB 恢复挂进
/// 微任务，完成 / 失败才把终态写进状态槽位。页面自己的脚本可能抢在那之前读到
/// 空库并把会话判死，因此调用方**必须**等 [`wait_for_restore_terminal`] 到
/// `Complete` 再放行页面（CDP 链路还需二次导航，见 `browser_session::open_for_scope`）。
const RESTORE_SCRIPT_TEMPLATE: &str = r#"
(function(){
  let selected=null;
  __ORIGIN_BRANCHES__
  if(!selected){window.__RESTORE_SLOT__={status:'skipped'};return;}
  window.__RESTORE_SLOT__={status:'pending'};
  const fail=(code)=>{window.__RESTORE_SLOT__={status:'failed',reasonCode:code};};
  const base64ToBytes=(value)=>{const binary=atob(value),out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;};
  const decode=(encoded)=>{
    switch(encoded.t){
      case'null':return null;case'string':case'boolean':return encoded.v;case'undefined':return undefined;
      case'number':return encoded.v==='NaN'?NaN:encoded.v==='Infinity'?Infinity:encoded.v==='-Infinity'?-Infinity:encoded.v==='-0'?-0:encoded.v;
      case'bigint':return BigInt(encoded.v);case'date':return new Date(encoded.v);case'regexp':return new RegExp(encoded.v,encoded.f);
      case'arrayBuffer':return base64ToBytes(encoded.v).buffer;
      case'typedArray':{const bytes=base64ToBytes(encoded.v);const ctor=globalThis[encoded.c];if(typeof ctor!=='function')throw new Error('INDEXED_DB_TYPED_ARRAY_UNSUPPORTED');return new ctor(bytes.buffer);}
      case'array':return encoded.v.map(decode);case'map':return new Map(encoded.v.map(([k,v])=>[decode(k),decode(v)]));case'set':return new Set(encoded.v.map(decode));
      case'object':{const out={};for(const[key,value]of encoded.v)out[key]=decode(value);return out;}
      default:throw new Error('INDEXED_DB_VALUE_ENCODING_UNSUPPORTED');
    }
  };
  const sameKeyPath=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
  const restoreDatabase=(snapshot)=>new Promise((resolve,reject)=>{
    const request=indexedDB.open(snapshot.name,snapshot.version);let upgradeError=null;
    request.onblocked=()=>reject(new Error('INDEXED_DB_BLOCKED'));
    request.onerror=()=>reject(upgradeError||request.error||new Error('INDEXED_DB_OPEN_FAILED'));
    request.onupgradeneeded=()=>{
      const db=request.result;
      try{
        if(request.oldVersion!==0)throw new Error('INDEXED_DB_SCHEMA_VERSION_MISMATCH');
        for(const storeSnapshot of snapshot.stores){
          const store=db.createObjectStore(storeSnapshot.name,{keyPath:storeSnapshot.keyPath,autoIncrement:storeSnapshot.autoIncrement});
          for(const index of storeSnapshot.indexes)store.createIndex(index.name,index.keyPath,{unique:index.unique,multiEntry:index.multiEntry});
        }
      }catch(error){upgradeError=error;try{request.transaction.abort();}catch(_){}}
    };
    request.onsuccess=()=>{
      const db=request.result;
      try{
        const expected=snapshot.stores.map((store)=>store.name).sort();
        const actual=Array.from(db.objectStoreNames).sort();
        if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('INDEXED_DB_STORE_SET_MISMATCH');
        const tx=db.transaction(expected,'readwrite');
        tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error||new Error('INDEXED_DB_TRANSACTION_ABORTED'));};tx.onerror=()=>{};
        for(const storeSnapshot of snapshot.stores){
          const store=tx.objectStore(storeSnapshot.name);
          if(!sameKeyPath(store.keyPath,storeSnapshot.keyPath)||store.autoIncrement!==storeSnapshot.autoIncrement)throw new Error('INDEXED_DB_STORE_SCHEMA_MISMATCH');
          const indexNames=Array.from(store.indexNames).sort(),expectedIndexes=storeSnapshot.indexes.map((index)=>index.name).sort();
          if(JSON.stringify(indexNames)!==JSON.stringify(expectedIndexes))throw new Error('INDEXED_DB_INDEX_SET_MISMATCH');
          for(const indexSnapshot of storeSnapshot.indexes){const index=store.index(indexSnapshot.name);if(!sameKeyPath(index.keyPath,indexSnapshot.keyPath)||index.unique!==indexSnapshot.unique||index.multiEntry!==indexSnapshot.multiEntry)throw new Error('INDEXED_DB_INDEX_SCHEMA_MISMATCH');}
          store.clear();
          for(const record of storeSnapshot.records){const value=decode(record.value);if(store.keyPath===null)store.put(value,decode(record.key));else store.put(value);}
        }
      }catch(error){db.close();reject(error);}
    };
  });
  try{
    localStorage.clear();for(const entry of selected.localStorage)localStorage.setItem(entry.name,entry.value);
    sessionStorage.clear();for(const entry of selected.sessionStorage)sessionStorage.setItem(entry.name,entry.value);
  }catch(error){fail('WEB_STORAGE_RESTORE_FAILED');return;}
  (async()=>{
    try{
      if(selected.indexedDb){if(!globalThis.indexedDB)throw new Error('INDEXED_DB_UNSUPPORTED');for(const database of selected.indexedDb.databases)await restoreDatabase(database);}
      window.__RESTORE_SLOT__={status:'complete'};
    }catch(error){fail(error&&typeof error.message==='string'?error.message:'INDEXED_DB_RESTORE_FAILED');}
  })();
})();
"#;

#[cfg(test)]
mod tests {
    use super::*;

    /// 造一个带存储快照的会话：`with_indexed_db` 决定该 origin 是否有 IDB 快照。
    fn session_with_storage(with_indexed_db: bool) -> AccountSession {
        let key = [7u8; 32];
        let mut session = AccountSession::default();
        session.origins.push(OriginStorage {
            origin: "https://a.test".into(),
            local_storage: Some(
                crypto::encrypt(&key, r#"[{"name":"k","value":"v"}]"#).expect("encrypt local"),
            ),
            session_storage: Some(crypto::encrypt(&key, "[]").expect("encrypt session")),
            indexed_db: with_indexed_db.then(|| {
                crypto::encrypt(
                    &key,
                    r#"{"version":1,"databases":[{"name":"db","version":1,"stores":[]}]}"#,
                )
                .expect("encrypt idb")
            }),
        });
        session
    }

    /// 假页面：按 `script` 顺序吐出恢复状态 JSON，吐完后一直返回 `pending`
    /// （等价于「页面始终没写终态」），让等待器可以在无浏览器的情况下测全部分支。
    fn fake_page(script: &'static [&'static str]) -> impl FnMut(String) -> Ready {
        let mut queue = std::collections::VecDeque::from(script.to_vec());
        move |_expression: String| {
            Ready(Some(Ok(queue
                .pop_front()
                .unwrap_or(r#"{"status":"pending"}"#)
                .to_string())))
        }
    }

    /// 假页面的 future 形态：值已就绪，`poll` 一次即完成。
    struct Ready(Option<AccountManagerResult<String>>);

    impl std::future::Future for Ready {
        type Output = AccountManagerResult<String>;

        fn poll(
            mut self: std::pin::Pin<&mut Self>,
            _cx: &mut std::task::Context<'_>,
        ) -> std::task::Poll<Self::Output> {
            std::task::Poll::Ready(
                self.0
                    .take()
                    .unwrap_or_else(|| Err(AccountManagerError::store_fail("fake page drained"))),
            )
        }
    }

    #[tokio::test]
    async fn restore_waiter_reports_complete_after_pending_polls() {
        let terminal = wait_for_restore_terminal(
            fake_page(&[r#"{"status":"pending"}"#, r#"{"status":"complete"}"#]),
            Duration::from_millis(500),
        )
        .await
        .expect("waiter");
        assert_eq!(terminal, RestoreTerminal::Complete);
        assert_eq!(terminal.as_status(), "complete");
    }

    #[tokio::test]
    async fn restore_waiter_carries_page_reason_on_failure() {
        // 失败原因必须来自页面写的 reasonCode：这是唯一能说清「为什么没登上」的信息。
        let terminal = wait_for_restore_terminal(
            fake_page(&[
                r#"{"status":"pending"}"#,
                r#"{"status":"failed","reasonCode":"INDEXED_DB_BLOCKED"}"#,
            ]),
            Duration::from_millis(500),
        )
        .await
        .expect("waiter");
        assert_eq!(
            terminal,
            RestoreTerminal::Failed {
                reason: "INDEXED_DB_BLOCKED".to_string()
            }
        );
        assert_eq!(terminal.as_status(), "failed:INDEXED_DB_BLOCKED");
    }

    #[tokio::test]
    async fn restore_waiter_times_out_when_page_never_reaches_terminal_state() {
        // IDB 恢复被页面自己的连接阻塞时脚本会一直 pending；等待器必须自己收口，
        // 不能把出向链路挂在轮询上（CDP 路径据此回报 timeout 而不是失败）。
        let terminal = wait_for_restore_terminal(
            fake_page(&[r#"{"status":"pending"}"#; 8]),
            Duration::from_millis(120),
        )
        .await
        .expect("waiter");
        assert_eq!(terminal, RestoreTerminal::Timeout);
        assert_eq!(terminal.as_status(), "timeout");
    }

    #[tokio::test]
    async fn restore_waiter_propagates_channel_errors() {
        // 求值通道坏了 ≠ 恢复失败：不能折成 `failed:`，否则页面根本没跑起来也会
        // 被报成「存储恢复失败」，把排查方向带偏。
        let error = wait_for_restore_terminal(
            |_expression: String| Ready(Some(Err(AccountManagerError::store_fail("eval timeout")))),
            Duration::from_millis(500),
        )
        .await
        .expect_err("channel error");
        assert!(error.message().contains("eval timeout"), "got {error}");
    }

    #[tokio::test]
    async fn restore_waiter_polls_the_shared_slot() {
        // 等待器读的槽位与恢复脚本写的必须是同一个：模板里的占位符若没被常量
        // 替换，等待器就永远读不到终态（表现为「注入成功但报 timeout」）。
        assert_eq!(
            BridgeState::poll_expression(RESTORE_STATE_SLOT),
            r#"JSON.stringify(window["__BENCH_SESSION_RESTORE__"]||{status:'pending'})"#
        );
        let terminal = wait_for_restore_terminal(
            fake_page(&[r#"{"status":"skipped"}"#]),
            Duration::from_millis(500),
        )
        .await
        .expect("waiter");
        assert_eq!(terminal, RestoreTerminal::Skipped);
        assert_eq!(terminal.as_status(), "skipped");
    }

    #[test]
    fn restore_script_writes_the_slot_the_waiter_polls() {
        let state = AccountManagerState::new();
        state
            .initialize_master_key_for_tests([7u8; 32])
            .expect("test master key");
        let session = session_with_storage(true);
        let script = restore_initialization_script(&state, &session)
            .expect("script")
            .expect("non-empty");
        assert!(
            !script.contains("__RESTORE_SLOT__"),
            "占位符未被替换，恢复脚本会写进一个错误的全局名"
        );
        assert!(script.contains(&format!("window.{RESTORE_STATE_SLOT}={{status:'pending'}}")));
        assert!(script.contains(&format!(
            "window.{RESTORE_STATE_SLOT}={{status:'complete'}}"
        )));
    }

    #[test]
    fn has_indexed_db_snapshot_only_true_when_a_snapshot_exists() {
        // 只有 localStorage 的站点不需要二次导航：Web Storage 是同步写的。
        assert!(has_indexed_db_snapshot(&session_with_storage(true)));
        assert!(!has_indexed_db_snapshot(&session_with_storage(false)));
        assert!(!has_indexed_db_snapshot(&AccountSession::default()));
    }

    #[test]
    fn storage_restore_payload_includes_indexed_db_branch() {
        let state = AccountManagerState::new();
        let key = [7u8; 32];
        state
            .initialize_master_key_for_tests(key)
            .expect("test master key");
        let local = crypto::encrypt(&key, r#"[{"name":"k","value":"v"}]"#).expect("encrypt local");
        let session_storage = crypto::encrypt(&key, r#"[]"#).expect("encrypt session");
        let indexed_db = crypto::encrypt(
            &key,
            r#"{"version":1,"databases":[{"name":"db","version":1,"stores":[]}]}"#,
        )
        .expect("encrypt idb");
        let mut session = AccountSession::default();
        session.origins.push(OriginStorage {
            origin: "http://127.0.0.1:7242".into(),
            local_storage: Some(local),
            session_storage: Some(session_storage),
            indexed_db: Some(indexed_db),
        });

        let payload = storage_restore_payload(&state, &session)
            .expect("payload")
            .expect("non-empty");
        assert_eq!(payload.len(), 1);
        let branch = &payload[0];
        assert_eq!(branch["origin"], json!("http://127.0.0.1:7242"));
        assert_eq!(
            branch["localStorage"],
            json!([{ "name": "k", "value": "v" }])
        );
        assert_eq!(branch["sessionStorage"], json!([]));
        // D-033：IndexedDB 快照必须随载荷下发，扩展侧（≥0.5）据此恢复。
        assert_eq!(
            branch["indexedDb"],
            json!({"version":1,"databases":[{"name":"db","version":1,"stores":[]}]})
        );
    }

    #[test]
    fn storage_restore_payload_null_indexed_db_when_missing() {
        let state = AccountManagerState::new();
        state
            .initialize_master_key_for_tests([9u8; 32])
            .expect("test master key");
        let mut session = AccountSession::default();
        session.origins.push(OriginStorage {
            origin: "https://a.test".into(),
            ..Default::default()
        });
        let payload = storage_restore_payload(&state, &session)
            .expect("payload")
            .expect("non-empty");
        assert!(payload[0]["indexedDb"].is_null());
    }

    #[test]
    fn merge_origin_replaces_only_the_matching_origin() {
        let mut session = AccountSession::default();
        session.origins.push(OriginStorage {
            origin: "https://a.test".into(),
            ..Default::default()
        });
        session.origins.push(OriginStorage {
            origin: "https://b.test".into(),
            ..Default::default()
        });

        merge_origin(
            &mut session,
            OriginStorage {
                origin: "https://a.test".into(),
                indexed_db: Some(super::super::crypto::EncryptedBlob {
                    v: 1,
                    nonce: "nonce".into(),
                    ct: "ciphertext".into(),
                }),
                ..Default::default()
            },
        );

        assert_eq!(session.origins.len(), 2);
        assert!(session.origins[0].indexed_db.is_some());
        assert_eq!(session.origins[1].origin, "https://b.test");
    }

    #[test]
    fn capture_script_uses_an_encoded_random_slot() {
        let script = capture_script("slot-with-'quotes").expect("script");
        assert!(script.contains("const slot=\"slot-with-'quotes\""));
        assert!(!script.contains("__SLOT__"));
    }

    #[test]
    fn canonical_origin_check_accepts_only_normalized_http_origins() {
        assert!(ensure_canonical_http_origin("https://www.trae.cn").is_ok());
        assert!(ensure_canonical_http_origin("http://localhost:1420").is_ok());
        // 非法 scheme / 带路径与 query 的非 canonical 形态一律拒绝：
        // 扩展按该 origin 精确匹配分支，脏数据会导致注入打偏。
        assert!(ensure_canonical_http_origin("ftp://www.trae.cn").is_err());
        assert!(ensure_canonical_http_origin("https://www.trae.cn/app").is_err());
        assert!(ensure_canonical_http_origin("not a url").is_err());
    }
}

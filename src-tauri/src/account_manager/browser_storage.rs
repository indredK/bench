use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{Runtime, WebviewWindow};

use super::crypto;
use super::session::evaluate_js;
use super::state::AccountManagerState;
use super::types::{AccountManagerError, AccountManagerResult, AccountSession, OriginStorage};

const CAPTURE_TIMEOUT: Duration = Duration::from_secs(10);
const RESTORE_TIMEOUT: Duration = Duration::from_secs(10);
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const MAX_BRIDGE_PAYLOAD_BYTES: usize = 12 * 1024 * 1024;
const MAX_RESTORE_SCRIPT_BYTES: usize = 16 * 1024 * 1024;

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeState {
    status: String,
    #[serde(default)]
    payload: Option<String>,
    #[serde(default)]
    reason_code: Option<String>,
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
    if !matches!(allowed.scheme(), "http" | "https")
        || allowed.origin().ascii_serialization() != expected_origin
    {
        return Ok(None);
    }
    let slot = format!("__BENCH_STORAGE_CAPTURE_{}", uuid::Uuid::new_v4().simple());
    let script = capture_script(&slot)?;
    window
        .eval(script)
        .map_err(|e| AccountManagerError::store_fail(format!("start storage capture: {e}")))?;

    let bridge = poll_bridge(window, &slot, CAPTURE_TIMEOUT).await?;
    let _ = window.eval(format!("delete window[{}]", json!(slot)));
    if bridge.status != "complete" {
        return Err(AccountManagerError::store_fail(format!(
            "storage capture failed ({})",
            bridge.reason_code.as_deref().unwrap_or("UNKNOWN")
        )));
    }
    let payload = bridge
        .payload
        .ok_or_else(|| AccountManagerError::store_fail("storage capture payload missing"))?;
    if payload.len() > MAX_BRIDGE_PAYLOAD_BYTES {
        return Err(AccountManagerError::store_fail(
            "storage capture payload exceeds limit",
        ));
    }
    let captured: BrowserCapture = serde_json::from_str(&payload)
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

    Ok(Some(OriginCaptureResult {
        storage: OriginStorage {
            origin: expected_origin,
            local_storage: Some(crypto::encrypt(&key, &local_json)?),
            session_storage: Some(crypto::encrypt(&key, &session_json)?),
            indexed_db,
        },
        indexed_db_status,
        has_data,
    }))
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
        let parsed = url::Url::parse(&origin.origin)
            .map_err(|_| AccountManagerError::store_fail("stored Web Storage origin is invalid"))?;
        if !matches!(parsed.scheme(), "http" | "https")
            || parsed.origin().ascii_serialization() != origin.origin
        {
            return Err(AccountManagerError::store_fail(
                "stored Web Storage origin is not canonical",
            ));
        }
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

    let script = RESTORE_SCRIPT_TEMPLATE.replace("__ORIGIN_BRANCHES__", &branches);
    if script.len() > MAX_RESTORE_SCRIPT_BYTES {
        return Err(AccountManagerError::store_fail(
            "storage restore script exceeds limit",
        ));
    }
    let _ = key;
    Ok(Some(script))
}

pub async fn wait_for_restore<R: Runtime>(window: &WebviewWindow<R>) -> AccountManagerResult<()> {
    let deadline = Instant::now() + RESTORE_TIMEOUT;
    while Instant::now() < deadline {
        let raw = evaluate_js(
            window,
            "JSON.stringify(window.__BENCH_SESSION_RESTORE__||{status:'pending'})",
        )
        .await?;
        let bridge: BridgeState = serde_json::from_str(&raw)
            .map_err(|e| AccountManagerError::store_fail(format!("decode restore state: {e}")))?;
        match bridge.status.as_str() {
            "complete" | "skipped" => return Ok(()),
            "failed" => {
                return Err(AccountManagerError::store_fail(format!(
                    "storage restore failed ({})",
                    bridge.reason_code.as_deref().unwrap_or("UNKNOWN")
                )))
            }
            _ => tokio::time::sleep(POLL_INTERVAL).await,
        }
    }
    Err(AccountManagerError::store_fail("storage restore timeout"))
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
    let expression = format!(
        "JSON.stringify(window[{}]||{{status:'pending'}})",
        json!(slot)
    );
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let raw = evaluate_js(window, &expression).await?;
        if raw.len() > MAX_BRIDGE_PAYLOAD_BYTES {
            return Err(AccountManagerError::store_fail(
                "storage bridge payload exceeds limit",
            ));
        }
        let bridge: BridgeState = serde_json::from_str(&raw)
            .map_err(|e| AccountManagerError::store_fail(format!("decode storage bridge: {e}")))?;
        if bridge.status != "pending" {
            return Ok(bridge);
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
    Err(AccountManagerError::store_fail("storage capture timeout"))
}

fn capture_script(slot: &str) -> AccountManagerResult<String> {
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

const RESTORE_SCRIPT_TEMPLATE: &str = r#"
(function(){
  let selected=null;
  __ORIGIN_BRANCHES__
  if(!selected){window.__BENCH_SESSION_RESTORE__={status:'skipped'};return;}
  window.__BENCH_SESSION_RESTORE__={status:'pending'};
  const fail=(code)=>{window.__BENCH_SESSION_RESTORE__={status:'failed',reasonCode:code};};
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
      window.__BENCH_SESSION_RESTORE__={status:'complete'};
    }catch(error){fail(error&&typeof error.message==='string'?error.message:'INDEXED_DB_RESTORE_FAILED');}
  })();
})();
"#;

#[cfg(test)]
mod tests {
    use super::*;

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
}

/*!
 * oet-sdk.js 1.1.0 — 線下活動工具箱 JS 套件（headless，契約 v4.0／v4.0.1）
 * ES5、單檔、無外部依賴。UI 由使用者自己畫；這裡只負責身份、呼叫後端、錯誤分類、重送規則。
 *
 * 用法（完整說明見同資料夾 README.md）：
 *   <script src="https://events.swag.app/offline-event/sdk/v1/oet-sdk.js"></script>
 *   OET.init({ env: 'mock' });                // 'live'（要 eventId）| 'test'（測試沙盒）| 'mock'（不連網）
 *   OET.on('auth', function (a) { ... });     // a.state: 'ready' | 'need_code' | 'pending'
 *   OET.state().then(function (r) { if (r.ok) draw(r.data); else showMsg(r.message); });
 *
 * ── 寫給維護者的規矩（改之前先讀）────────────────────────────────────────
 * 1. 每個功能都 resolve { ok, state, data, message }。業務失敗（鑽石不足、未報到、序號錯、活動已結束…）
 *    一律 resolve，不 reject、不吞掉。只有「呼叫方式錯了」（沒 init、參數型別錯）才 reject。
 * 2. 會動錢的呼叫（buy／spend／redeem）：txn_id 由 SDK 產生（或呼叫端帶回舊的）。逾時、斷線、5xx 結果不明
 *    → 用**同一個** txn_id、同一份 body 重送一次；第二次仍不明 → resolve { ok:false, state:'unknown', txnId }。
 *    🔴 任何情況都不換 txn_id 重送（換了就是重複扣鑽）。
 *    第一次不明之後，第二次的回應只接受「關於這筆交易本身」的答案（buy：settled／failed／pending；
 *    spend：settled；redeem：redeemed／not_found／forbidden）。其他答案（例如 insufficient_diamonds、
 *    balance_unavailable、closed）可能是第一次還在伺服器上跑的時候拿到的，不能證明第一次沒成功 → 一律 unknown。
 * 3. 伺服器給什麼就交什麼：餘額、張數、金額一律原樣放進 data，SDK 不自己加減。
 * 4. mock 模式走跟真的一樣的回應解析與重送流程（只是把網路換成記憶體裡的假後端），形狀照 bff_main.py 的 docstring。
 * 5. 身份握手（IFRAME_READY／SET_TOKEN、風控 fpid）、序號登入、直連模式導頁，照 index.html v3.2 已上線的做法。
 * 6. 不用 alert／confirm／prompt（iframe 沙箱不能用），不載任何外部資源。
 */
(function (root) {
  'use strict';

  if (root.OET && root.OET.version) return;          // 同一頁載入兩次：保留第一份（不然狀態會被洗掉）

  var VERSION = '1.1.0';
  var CONTRACT = 'v4.0';
  // 正式 BFF。不從網址參數讀（從網址讀等於讓任何人把用戶的憑證送到任意網域）。
  var DEFAULT_API = 'https://offline-event-bff-905468082258.asia-east1.run.app';
  var SWAG = 'https://swag.live';
  var KNOCKS = [0, 300, 1000, 2000, 3500];           // IFRAME_READY 敲門節奏（index.html 實測）
  var HANDSHAKE_MS = 6000;                           // 等 SET_TOKEN 的上限
  var READ_TIMEOUT_MS = 15000;
  // 買券在伺服器上最慢是 /me 8 秒＋查餘額 8 秒＋扣鑽 12 秒。逾時了也沒關係：重送用同一個 txn_id，
  // 伺服器會回那筆的現況（處理中／完成），不會再扣一次。
  var MONEY_TIMEOUT_MS = 25000;
  var RETRY_DELAY_MS = 800;
  var LS = 'oet:v1:';
  var SECTION_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;
  var TXN_RE = /^[A-Za-z0-9_-]{6,100}$/;
  var ACTIONS = { bootstrap: 1, login: 1, checkin: 1, purchase: 1, spend: 1, redeem: 1, feed: 1, wrapup: 1, me: 1, menu: 1 };

  // 5xx 裡「伺服器明講什麼都還沒發生」的 state：不算結果不明，不重送，原樣交給呼叫端（可以換新 txn_id 再試）。
  var NOTHING_HAPPENED = { balance_unavailable: 1, misconfigured: 1, sandbox_not_configured: 1 };
  // 第一次結果不明之後，第二次只接受這些 state 當成最終答案（理由見檔頭第 2 條）。
  var RESUME_FINAL = {
    purchase: { settled: 1, failed: 1, pending: 1 },
    spend: { settled: 1 },
    redeem: { redeemed: 1, not_found: 1, forbidden: 1 }
  };

  // 預設訊息：只在伺服器沒給 message 時用。短：一句話講完狀態。
  var MSG = {
    network: '連線失敗，請確認網路',
    timeout: '連線逾時，請稍後再試',
    unparsed: '伺服器暫時無法回應，請稍後再試',
    unavailable: '暫時無法處理，請稍後再試',
    unknown: '結果不明，請重新整理查看',
    unauthorized: '無法取得登入身份',
    session_invalid: '請重新輸入序號',
    need_code: '請輸入序號',
    logged_out: '已登出',
    busy: '上一筆還在處理中',
    forbidden: '沒有權限',
    not_found: '找不到資料',
    popup_blocked: '新分頁沒有打開',
    no_pack: '這場活動沒有禮包',
    preview: '預覽模式，不會送出',
    error: '暫時無法完成，請稍後再試'
  };

  // ══ 小工具 ══════════════════════════════════════════════════════════
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isStr(v) { return typeof v === 'string'; }
  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isObj(v) { return !!v && typeof v === 'object' && !isArr(v); }
  function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }
  function copy(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function later(fn, ms) { return setTimeout(fn, ms || 0); }
  function warn(m) { try { if (root.console && root.console.warn) root.console.warn('[OET] ' + m); } catch (e) {} }
  function rejectWith(m) { return Promise.reject(new TypeError('[OET] ' + m)); }
  function inFrame() { try { return root.parent && root.parent !== root; } catch (e) { return true; } }
  function nowIso() { return new Date().toISOString().replace('Z', '000+00:00'); }   // 跟 BFF 的 now_iso() 同格式

  function rand36(n) {
    var s = '', i, a, c = root.crypto || root.msCrypto;
    try { a = new Uint8Array(n); c.getRandomValues(a); for (i = 0; i < n; i++) s += (a[i] % 36).toString(36); }
    catch (e) { s = ''; for (i = 0; i < n; i++) s += Math.floor(Math.random() * 36).toString(36); }
    return s;
  }
  // 每一次 buy／spend 呼叫都產生全新的 id，只有「同一次呼叫的逾時重送」沿用。前綴標動作（tb_＝買券、ts_＝付券）：
  // BFF 的買券與付券共用同一個帳本集合。v4.0 以前拿買券的 id 去付券會回「settled resumed」但其實沒付；v4.0.1 起改回
  // 409 txn_id_conflict（什麼都沒做，見 sdk/STATES.md）。前綴檢查照留：呼叫端帶回來的 txnId 前綴對不上動作就 reject，
  // 不送出去（舊版 BFF 上仍是「假成功」）。
  var TXN_PREFIX = { purchase: 'tb_', spend: 'ts_' };
  function newTxnId(action) { return TXN_PREFIX[action] + Date.now().toString(36) + '_' + rand36(12); }
  function badTxn(action, t) { return t != null && !(isStr(t) && TXN_RE.test(t) && t.indexOf(TXN_PREFIX[action]) === 0); }

  // localStorage／sessionStorage：讀寫都包 try（隱私模式、iframe 儲存分割），不能用時退回記憶體（至少這一頁能用）。
  var mem = {};
  function store(kind) { try { return root[kind]; } catch (e) { return null; } }
  function sGet(kind, k) {
    var s = store(kind);
    if (s) { try { var v = s.getItem(k); if (v != null) return v; } catch (e) {} }
    return has(mem, kind + k) ? mem[kind + k] : null;
  }
  function sSet(kind, k, v) {
    var s = store(kind);
    if (s) { try { s.setItem(k, v); delete mem[kind + k]; return; } catch (e) {} }
    mem[kind + k] = v;
  }
  function sDel(kind, k) {
    delete mem[kind + k];
    var s = store(kind);
    if (s) { try { s.removeItem(k); } catch (e) {} }
  }

  // 裝置 id：BFF 拿來數「同一人同時登入幾台」，不是風控指紋（fpid）。跟 index.html 的 oe:dev 同格式、不同 key。
  function deviceId() {
    var v = sGet('localStorage', LS + 'dev');
    if (v && /^[A-Za-z0-9_-]{16,64}$/.test(v)) return v;
    v = rand36(22);
    sSet('localStorage', LS + 'dev', v);
    return v;
  }

  // ══ 狀態 ════════════════════════════════════════════════════════════
  var S = {
    inited: false,
    env: null, eventId: '', apiBase: DEFAULT_API, entry: '', returnUrl: '',
    readTimeout: READ_TIMEOUT_MS, moneyTimeout: MONEY_TIMEOUT_MS, handshakeMs: HANDSHAKE_MS, autoRefresh: true,
    frame: false, loggedOut: false,
    token: null, via: null, auth: 'pending',
    gen: 0,                      // 登出／失效／換人時 +1：之前發出、之後才回來的讀取一律作廢
    knockGen: 0, hsTimer: null, waiters: [],
    fpid: '', fp: { sent: false, inflight: false, tries: 0 },
    last: null,                  // 最後一次 state() 的 data（openPack 預設禮包、fpid 補送、tickets 用）
    checkedIn: '',               // 已確認報到的 user_id（checkin 成功或 state 說 checked_in）
    busy: {}, refreshT: null,
    listeners: { auth: [], state: [] },
    mock: null
  };

  function sessKey() { return LS + 'sess:' + S.env + ':' + (S.env === 'test' ? 'sandbox' : S.eventId); }
  function fpKey() { return LS + 'fpsent:' + S.env + ':' + (S.env === 'test' ? 'sandbox' : S.eventId); }
  function sessOk(s) { return isStr(s) && s.length < 4096 && /^oes1\.\S+$/.test(s); }

  // ══ 事件 ════════════════════════════════════════════════════════════
  function emit(name, payload) {
    var fns = (S.listeners[name] || []).slice(), i;
    for (i = 0; i < fns.length; i++) {
      try { fns[i](payload); }
      catch (e) { later(function (err) { return function () { throw err; }; }(e)); }   // 同事的 handler 出錯不能弄壞 SDK，但要看得到
    }
  }
  function authInfo(reason) { return { state: S.auth, via: S.via, reason: reason || '' }; }
  function setAuth(state, via, reason) {
    var changed = S.auth !== state || S.via !== via;
    S.auth = state; S.via = via;
    if (state !== 'pending') {
      var w = S.waiters; S.waiters = [];
      for (var i = 0; i < w.length; i++) w[i]();
    }
    if (changed || reason === 'login' || reason === 'session_invalid') emit('auth', authInfo(reason));
  }
  function whenAuth() {
    if (S.auth !== 'pending') return Promise.resolve();
    return new Promise(function (res) { S.waiters.push(res); });
  }

  // ══ 身份：檢視器握手（照 index.html v3.2 ⑬-G）════════════════════════
  function knock(i, g) {
    if (g !== S.knockGen || (S.auth === 'ready' && S.via === 'swag')) return;
    var msg = { type: 'IFRAME_READY' };
    // 父層對每一則帶 needsRiskGate 的 IFRAME_READY 都跑一次風控＋指紋，不去重：只有第一次與最後一次（還沒拿到 fpid 時）帶
    if ((i === 0 || i === KNOCKS.length - 1) && !S.fpid) { msg.needsRiskGate = true; msg.riskCheckTriggerType = 'STORE'; }
    try { root.parent.postMessage(msg, '*'); } catch (e) {}
  }
  function beginHandshake() {
    var g = ++S.knockGen, i;
    for (i = 0; i < KNOCKS.length; i++) later(function (n) { return function () { knock(n, g); }; }(i), KNOCKS[i]);
    clearTimeout(S.hsTimer);
    S.hsTimer = later(function () {
      if (g !== S.knockGen || S.auth === 'ready') return;
      // 拿不到 SWAG token（沒登入、LINE 內建瀏覽器等）：退回序號。存著的序號憑證這時才看（握手優先）。
      var s = sGet('localStorage', sessKey());
      if (sessOk(s)) { S.token = s; setAuth('ready', 'code', 'stored'); return; }
      setAuth('need_code', null, 'handshake_timeout');
    }, S.handshakeMs);
  }
  function onMessage(ev) {
    var d = ev && ev.data;
    if (!S.inited || S.env === 'mock' || !S.frame || !d || typeof d !== 'object' || !d.type) return;
    if (d.type === 'SET_TOKEN' && isStr(d.token) && d.token) {
      if (S.via === 'code' || S.loggedOut) return; // 已經用序號登入或按過登出：不讓晚到的 token 默默換掉身份
      S.token = d.token;                           // 父層在 token 快過期時會重送：已經 ready 就只默默更新
      clearTimeout(S.hsTimer);
      if (S.auth !== 'ready') setAuth('ready', 'swag', 'token');
      return;
    }
    if (d.type === 'RISK_GATE_RESULT') {
      // 只拿 fpid（同裝置多帳號比對用）；status 不拿來擋任何事。可能比 SET_TOKEN 晚到、也可能不來，任何流程都不等它。
      var f = isStr(d.fpid) ? trim(d.fpid) : '';
      if (f && !S.fpid) { S.fpid = f.slice(0, 128); sendFpid(); }
    }
  }

  // ══ 傳輸 ════════════════════════════════════════════════════════════
  // 回傳一律是 {kind:'http', status, text} | {kind:'network'} | {kind:'timeout'}。真的與 mock 共用之後的所有流程。
  function xhrSend(method, url, headers, bodyStr, timeout) {
    return new Promise(function (resolve) {
      var x, done = false, k;
      function fin(r) { if (done) return; done = true; resolve(r); }
      try { x = new XMLHttpRequest(); x.open(method, url, true); }
      catch (e) { fin({ kind: 'network' }); return; }
      for (k in headers) if (has(headers, k)) { try { x.setRequestHeader(k, headers[k]); } catch (e) {} }
      try { x.timeout = timeout; } catch (e) {}
      x.ontimeout = function () { fin({ kind: 'timeout' }); };
      x.onerror = function () { fin({ kind: 'network' }); };
      x.onabort = function () { fin({ kind: 'network' }); };
      x.onload = function () {
        if (!x.status) return fin({ kind: 'network' });
        fin({ kind: 'http', status: x.status, text: x.responseText });
      };
      // 舊 WebView 可能不支援 xhr.timeout：自己再計一次
      later(function () { if (!done) { fin({ kind: 'timeout' }); try { x.abort(); } catch (e) {} } }, timeout + 1500);
      try { x.send(bodyStr == null ? null : bodyStr); } catch (e) { fin({ kind: 'network' }); }
    });
  }
  function actionPath(action) {
    if (S.env === 'test') return '/v1/test/' + action;
    return '/v1/event/' + encodeURIComponent(S.eventId) + '/' + action;
  }
  function qstr(q) {
    var out = [], k;
    for (k in q) if (has(q, k) && q[k] != null) out.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(q[k])));
    return out.length ? '?' + out.join('&') : '';
  }
  // req = { action, method, query, body, auth(bool), timeout }
  function transport(req) {
    var headers = {}, token = req.auth ? S.token : null;
    if (token) headers.Authorization = 'Bearer ' + token;
    if (S.mock) return S.mock._send(req, token);
    if (req.body != null) headers['Content-Type'] = 'application/json';
    return xhrSend(req.method, S.apiBase + actionPath(req.action) + qstr(req.query || {}), headers,
      req.body != null ? JSON.stringify(req.body) : null, req.timeout);
  }

  // ══ 回應分類 ════════════════════════════════════════════════════════
  // 回 { res: {ok,state,data,message}, indet: bool }。indet ＝ 結果不明（可能已經在伺服器上做了）。
  function classify(raw) {
    if (raw.kind === 'network') return { res: mk(false, 'network', {}, ''), indet: true };
    if (raw.kind === 'timeout') return { res: mk(false, 'timeout', {}, ''), indet: true };
    var j = null;
    try { j = JSON.parse(raw.text); } catch (e) {}
    if (!j || typeof j !== 'object' || typeof j.ok !== 'boolean') {
      // 看不懂的內容（HTML 錯誤頁）：5xx 與 2xx 算結果不明（可能已經做了）；
      // 4xx（例如 Google 前端擋下、路徑不存在）請求沒進到服務，不算。
      return { res: mk(false, 'unparsed', { httpStatus: raw.status }, ''), indet: !(raw.status >= 400 && raw.status < 500) };
    }
    var st = isStr(j.state) && j.state ? j.state : (j.ok ? 'ok' : 'error');
    var data = {}, k;
    for (k in j) if (has(j, k) && k !== 'ok' && k !== 'state' && k !== 'message') data[k] = j[k];
    data.httpStatus = raw.status;
    // 業務結果看 body（ok／state），HTTP 狀態碼只用來判斷「5xx 而且沒講清楚」＝結果不明。
    var indet = raw.status >= 500 && !NOTHING_HAPPENED[st];
    return { res: mk(j.ok === true, st, data, isStr(j.message) ? j.message : ''), indet: indet };
  }
  function mk(ok, state, data, message) {
    return { ok: ok, state: state, data: data || {}, message: message || (ok ? '' : (MSG[state] || MSG.error)) };
  }

  // 每個回應都要過這裡：憑證失效 → 清掉、回 need_code；SWAG token 失效 → 重新握手
  function afterAuthFailure(res, g, token) {
    if (g !== S.gen || token !== S.token) return;   // 已經換人／登出：舊請求的失效不能把新身份踢掉
    if (res.state === 'session_invalid' || (res.state === 'unauthorized' && S.via === 'code')) {
      dropSession('session_invalid');
    } else if (res.state === 'unauthorized' && S.via === 'swag') {
      S.token = null; S.gen++;
      setAuth('pending', null, 'unauthorized');
      beginHandshake();
    }
  }
  function dropSession(reason) {
    sDel('localStorage', sessKey());
    S.token = null; S.gen++; S.last = null; S.checkedIn = '';
    S.fp = { sent: false, inflight: false, tries: 0 };
    setAuth('need_code', null, reason);
  }

  // 一般呼叫（不動錢）：不重送
  function call(req) {
    req.timeout = req.timeout || S.readTimeout;
    return ready(req).then(function (blocked) {
      if (blocked) return blocked;
      var g = S.gen, token = req.auth ? S.token : null;
      return transport(req).then(function (raw) {
        var res = classify(raw).res;
        if (req.auth) afterAuthFailure(res, g, token);
        if (req.auth && g !== S.gen && res.state !== 'session_invalid' && res.state !== 'unauthorized') {
          return mk(false, 'logged_out', {}, '');   // 請求出去之後換了人：不把上一個人的資料交出去
        }
        return res;
      });
    });
  }
  // 要身份的呼叫先等握手；沒有身份就直接 resolve need_code（不送請求）
  function ready(req) {
    if (!req.auth) return Promise.resolve(null);
    return whenAuth().then(function () {
      if (S.auth === 'ready' && S.token) return null;
      return mk(false, 'need_code', {}, '');
    });
  }

  // 會動錢的呼叫：結果不明時用同一個 txn_id、同一份 body 重送一次（檔頭第 2 條）
  function money(action, body) {
    var txnId = body.txn_id;
    var req = { action: action, method: 'POST', body: body, auth: true, timeout: S.moneyTimeout };
    function withTxn(res) { res.txnId = txnId; return res; }
    return ready(req).then(function (blocked) {
      if (blocked) return blocked;                 // 沒送出去：不附 txnId（沒有「這筆」可查）
      var g = S.gen, token = S.token;
      return transport(req).then(function (raw1) {
        var c1 = classify(raw1);
        afterAuthFailure(c1.res, g, token);
        if (!c1.indet) return withTxn(c1.res);
        // 結果不明：等一下，用同一份 body（同一個 txn_id）再送一次。這中間換了人就不送（憑證已經不是他的）。
        return new Promise(function (r) { later(r, RETRY_DELAY_MS); }).then(function () {
          if (g !== S.gen || token !== S.token) {
            return withTxn(mk(false, 'unknown', { first: c1.res.state, second: 'not_sent' }, ''));
          }
          return transport(req).then(function (raw2) {
            var c2 = classify(raw2);
            afterAuthFailure(c2.res, g, token);
            if (!c2.indet && RESUME_FINAL[action][c2.res.state]) return withTxn(c2.res);
            return withTxn(mk(false, 'unknown', { first: c1.res.state, second: c2.res.state }, ''));
          });
        });
      });
    });
  }

  // 動錢之後、報到之後：背景重抓一次 state，讓 on('state') 拿到伺服器的新數字（畫面不用自己加減）
  function scheduleRefresh() {
    if (!S.autoRefresh) return;
    clearTimeout(S.refreshT);
    S.refreshT = later(function () { if (S.auth === 'ready') api.state(); }, 300);
  }
  function guard(name, fn) {
    if (S.busy[name]) return Promise.resolve(mk(false, 'busy', {}, ''));
    S.busy[name] = true;
    var p;
    try { p = fn(); } catch (e) { S.busy[name] = false; return Promise.reject(e); }
    return p.then(function (r) { S.busy[name] = false; return r; }, function (e) { S.busy[name] = false; throw e; });
  }
  function needInit() { return S.inited ? null : rejectWith('請先呼叫 OET.init()'); }

  // ══ fpid 補送（照 index.html ⑬-F）═════════════════════════════════════
  // 已報到的一般用戶本次才第一次拿到 fpid → 背景再打一次 checkin 帶 fpid（冪等）。同一個分頁只補一次。
  // 🔴 還沒報到的人不送：那等於替他報到。
  function sendFpid() {
    var me = S.last && S.last.me;
    if (!S.fpid || S.via !== 'swag' || S.auth !== 'ready' || S.fp.sent || S.fp.inflight || S.fp.tries >= 3) return;
    if (!me || me.is_creator || !S.checkedIn || String(me.user_id) !== S.checkedIn) return;
    if (sGet('sessionStorage', fpKey()) === S.checkedIn) { S.fp.sent = true; return; }
    S.fp.inflight = true; S.fp.tries++;
    var uid = S.checkedIn;
    call({ action: 'checkin', method: 'POST', body: checkinBody(false), auth: true }).then(function (r) {
      S.fp.inflight = false;
      if (r.ok) { S.fp.sent = true; sSet('sessionStorage', fpKey(), uid); return; }
      if (r.state === 'network' || r.state === 'timeout' || r.state === 'unparsed' || r.state === 'unavailable') later(sendFpid, 3000);
    });
  }
  function checkinBody(withEntry) {
    var b = {}, ua = '';
    if (S.fpid) b.fpid = S.fpid;                     // 還沒到就不帶，不等
    try { ua = String(root.navigator.userAgent || ''); } catch (e) {}
    if (ua) b.ua = ua.slice(0, 300);
    if (S.via === 'code') b.device_id = deviceId();
    if (withEntry && S.entry) b.entry = S.entry;
    return b;
  }

  // ══ 導頁（儲值、禮包）═════════════════════════════════════════════════
  function b64campaign(sectionId) {
    try { return encodeURIComponent(root.btoa(JSON.stringify({ sections: ['section=' + sectionId] }))); }
    catch (e) { return ''; }
  }
  function returnUrl() {
    if (S.returnUrl) return S.returnUrl;
    try { return root.location.origin + root.location.pathname + root.location.search; } catch (e) { return ''; }
  }
  // 直連（頂層、沒有父層接 postMessage）：新分頁開 swag.live。不帶 noopener 第三參數（帶了一律回 null，判斷不出被擋）
  function openTab(url) {
    if (S.mock) { S.mock.opened.push(url); return mk(true, 'opened', { url: url, via: 'tab' }, ''); }
    var w = null;
    try { w = root.open(url, '_blank'); } catch (e) { w = null; }
    if (w) { try { w.opener = null; } catch (e) {} return mk(true, 'opened', { url: url, via: 'tab' }, ''); }
    return mk(false, 'popup_blocked', { url: url }, '');   // 呼叫端畫一個 <a target="_blank"> 讓用戶自己點
  }
  function postParent(msg) {
    if (S.mock) { S.mock.posted.push(copy(msg)); return; }
    try { root.parent.postMessage(msg, '*'); } catch (e) {}
  }
  // 檢視器裡（父層會接）＝ in frame 且身份來自 SWAG token。mock 照「目前開在哪」判斷，方便本機看兩種行為。
  function viaParent() { return S.frame && (S.mock ? true : S.via === 'swag'); }

  // ══ 公開 API ═══════════════════════════════════════════════════════
  var api = {
    version: VERSION,
    contract: CONTRACT,
    mock: null,

    init: function (o) {
      if (S.inited) throw new Error('[OET] init 只能呼叫一次');
      if (typeof Promise === 'undefined') throw new Error('[OET] 這個瀏覽器沒有 Promise');
      o = o || {};
      var env = o.env;
      if (env !== 'live' && env !== 'test' && env !== 'mock') throw new TypeError("[OET] env 要是 'live'、'test' 或 'mock'");
      if (env === 'live' && !(isStr(o.eventId) && trim(o.eventId))) throw new TypeError('[OET] live 要帶 eventId');
      S.env = env;
      S.eventId = env === 'live' ? trim(o.eventId) : (env === 'mock' ? (trim(o.eventId) || 'mock-event') : '');
      if (o.apiBase != null) {
        if (!isStr(o.apiBase) || !/^https?:\/\/[^\s/]+/.test(o.apiBase)) throw new TypeError('[OET] apiBase 要是 http(s) 網址');
        S.apiBase = o.apiBase.replace(/\/+$/, '');
      }
      S.entry = isStr(o.entry) ? trim(o.entry) : '';
      S.returnUrl = isStr(o.returnUrl) ? o.returnUrl : '';
      if (typeof o.timeoutMs === 'number' && o.timeoutMs >= 1000) S.readTimeout = o.timeoutMs;
      if (typeof o.moneyTimeoutMs === 'number' && o.moneyTimeoutMs >= 1000) S.moneyTimeout = o.moneyTimeoutMs;
      if (typeof o.handshakeMs === 'number' && o.handshakeMs >= 500) S.handshakeMs = o.handshakeMs;
      if (o.autoRefresh === false) S.autoRefresh = false;
      S.frame = inFrame();
      S.inited = true;
      try { root.addEventListener('message', onMessage); } catch (e) {}

      if (env === 'mock') S.mock = api.mock = createMock(S.eventId, o.mock || {});
      // 初始身份當下就定好（init 一回來 auth.state() 就是對的），'auth' 事件晚一拍發，讓 init 之後才掛的 on('auth') 也收得到。
      // 檢視器裡（mock 除外）：握手優先，拿不到 token 才看存著的序號（見 beginHandshake）。
      if (S.frame && env !== 'mock') {
        S.auth = 'pending';
        beginHandshake();
      } else {
        var s = sGet('localStorage', sessKey());
        if (sessOk(s)) { S.token = s; S.auth = 'ready'; S.via = 'code'; }
        else { if (s) sDel('localStorage', sessKey()); S.auth = 'need_code'; }
      }
      var a0 = S.auth, v0 = S.via;
      later(function () { if (S.auth === a0 && S.via === v0) emit('auth', authInfo('init')); }, 0);
      return api;
    },

    on: function (name, fn) {
      if (!has(S.listeners, name)) throw new TypeError("[OET] 事件只有 'auth' 與 'state'");
      if (typeof fn !== 'function') throw new TypeError('[OET] on 的第二個參數要是函式');
      S.listeners[name].push(fn);
      return function () { api.off(name, fn); };
    },
    off: function (name, fn) {
      var a = S.listeners[name] || [], i;
      for (i = a.length - 1; i >= 0; i--) if (a[i] === fn) a.splice(i, 1);
    },

    auth: {
      state: function () { return S.auth; },
      via: function () { return S.via; },
      // 給同事轉送到他自己後端用；他的後端拿去打 GET /v1/event/<eid>/me（或 /v1/test/me）驗身份
      header: function () { return S.auth === 'ready' && S.token ? 'Bearer ' + S.token : null; },
      login: function (code) {
        var bad = needInit(); if (bad) return bad;
        // 全形轉半形、去掉非數字（貼上「序號：123 456」也能用）
        var c = String(code == null ? '' : code).replace(/[０-９]/g, function (x) {
          return String.fromCharCode(x.charCodeAt(0) - 0xFEE0);
        }).replace(/\D/g, '');
        if (!/^\d{6}$/.test(c)) return Promise.resolve(mk(false, 'bad_request', {}, '序號要是 6 位數字'));
        var body = { code: c, entry: S.entry || '', device_id: deviceId() };
        var g = S.gen;
        return call({ action: 'login', method: 'POST', body: body, auth: false }).then(function (r) {
          var sess = r.data && r.data.session;
          if (r.data) delete r.data.session;         // 憑證不放進 data（要用請走 auth.header()）
          if (r.ok && !sessOk(sess)) return mk(false, 'error', {}, '暫時無法登入，請稍後再試');
          if (!r.ok) {
            if (r.state === 'entry_required' || r.state === 'entry_expired') S.entry = '';
            return r;
          }
          S.gen++;                                   // 換人：之前還在飛的讀取作廢
          clearTimeout(S.hsTimer); S.knockGen++;     // 檢視器裡改用序號登入：停止等 token
          S.token = sess; S.last = null; S.checkedIn = ''; S.loggedOut = false;
          sSet('localStorage', sessKey(), sess);
          setAuth('ready', 'code', 'login');
          return r;
        });
      },
      logout: function () {
        if (!S.inited) return;
        sDel('localStorage', sessKey());
        S.token = null; S.gen++; S.last = null; S.checkedIn = ''; S.loggedOut = true;
        clearTimeout(S.hsTimer); S.knockGen++;
        setAuth('need_code', null, 'logout');
      }
    },

    state: function () {
      var bad = needInit(); if (bad) return bad;
      var g = S.gen;
      return call({ action: 'bootstrap', method: 'GET', auth: true }).then(function (r) {
        if (r.ok && g === S.gen) {
          S.last = r.data;
          var me = r.data.me || {};
          if (!me.is_creator && me.checked_in === true) S.checkedIn = String(me.user_id);
          emit('state', r.data);
          sendFpid();
        }
        return r;
      });
    },

    checkin: function () {
      var bad = needInit(); if (bad) return bad;
      var hadFp = !!S.fpid;
      return call({ action: 'checkin', method: 'POST', body: checkinBody(true), auth: true }).then(function (r) {
        if (r.ok) {
          S.entry = '';
          var me = S.last && S.last.me;
          if (me && !me.is_creator) S.checkedIn = String(me.user_id);
          if (hadFp && me) { S.fp.sent = true; sSet('sessionStorage', fpKey(), String(me.user_id)); }
          scheduleRefresh();
          sendFpid();
        } else if (r.state === 'entry_required' || r.state === 'entry_expired') {
          S.entry = '';
        }
        return r;
      });
    },

    buy: function (productId, qty, opts) {
      var bad = needInit(); if (bad) return bad;
      if (!isStr(productId) || !productId) return rejectWith('buy(productId, qty)：productId 要是字串');
      if (typeof qty !== 'number' || qty % 1 !== 0 || qty <= 0) return rejectWith('buy(productId, qty)：qty 要是正整數');
      var txnId = opts && opts.txnId;          // 只用來「查詢結果」：帶回上一次 buy 結果的 txnId（tb_ 開頭）
      if (badTxn('purchase', txnId)) return rejectWith('buy 的 txnId 只能是上一次 buy 回來的 txnId（tb_ 開頭）');
      return guard('buy', function () {
        return money('purchase', { txn_id: txnId || newTxnId('purchase'), product_id: productId, qty: qty }).then(function (r) {
          if (r.ok || r.state === 'pending' || r.state === 'unknown') scheduleRefresh();
          return r;
        });
      });
    },

    spend: function (creatorId, menuItemId, opts) {
      var bad = needInit(); if (bad) return bad;
      if (!isStr(creatorId) || !creatorId || !isStr(menuItemId) || !menuItemId) {
        return rejectWith('spend(creatorId, menuItemId)：兩個都要是字串');
      }
      var txnId = opts && opts.txnId;          // 只用來「查詢結果」：帶回上一次 spend 結果的 txnId（ts_ 開頭）
      if (badTxn('spend', txnId)) return rejectWith('spend 的 txnId 只能是上一次 spend 回來的 txnId（ts_ 開頭）');
      return guard('spend', function () {
        return money('spend', { txn_id: txnId || newTxnId('spend'), creator_id: creatorId, menu_item_id: menuItemId }).then(function (r) {
          if (r.ok || r.state === 'unknown') scheduleRefresh();
          return r;
        });
      });
    },

    // 核銷：txnId 是付券那筆（tickets() 裡的 txn_id）。核銷本身就以它為鍵，所以重送天然是同一筆。
    redeem: function (txnId) {
      var bad = needInit(); if (bad) return bad;
      if (!isStr(txnId) || !txnId) return rejectWith('redeem(txnId)：txnId 要是字串');
      return guard('redeem:' + txnId, function () {
        return money('redeem', { txn_id: txnId }).then(function (r) {
          if (r.ok || r.state === 'unknown') scheduleRefresh();
          return r;
        });
      });
    },

    // 票券夾：從 state() 的 my_txns 取出付券紀錄。pending＝待核銷、redeemed＝已核銷。
    // ⚠️ my_txns 最多 100 筆（伺服器截斷）；待核銷總數以 data.pendingCount（＝me.tickets_pending，截斷前數）為準。
    tickets: function () {
      var bad = needInit(); if (bad) return bad;
      return api.state().then(function (r) {
        if (!r.ok) return r;
        var rows = r.data.my_txns || [], pending = [], redeemed = [], i, t;
        for (i = 0; i < rows.length; i++) {
          t = rows[i];
          if (t.type !== 'spend' || t.state !== 'settled') continue;
          if (t.redeem_state === 'pending') pending.push(t);
          else if (t.redeem_state === 'redeemed') redeemed.push(t);
        }
        var me = r.data.me || {};
        return mk(true, 'ok', {
          pending: pending, redeemed: redeemed,
          pendingCount: typeof me.tickets_pending === 'number' ? me.tickets_pending : null,
          event: r.data.event
        }, '');
      });
    },

    wrapup: function () {
      var bad = needInit(); if (bad) return bad;
      return call({ action: 'wrapup', method: 'GET', auth: true });
    },

    // 主播收款。cursor：上一次結果的 data.next（或 null／不帶＝從頭）。也接受字串（＝since）。
    creatorFeed: function (cursor) {
      var bad = needInit(); if (bad) return bad;
      var since = '', sinceR = '';
      if (isStr(cursor)) since = cursor;
      else if (cursor && typeof cursor === 'object') {
        since = isStr(cursor.since) ? cursor.since : '';
        sinceR = isStr(cursor.since_redeemed) ? cursor.since_redeemed : '';
      } else if (cursor != null) return rejectWith('creatorFeed(cursor)：cursor 要是上一次的 data.next、字串或 null');
      // since_redeemed 一定帶（空字串＝從頭）：不帶的話伺服器不回已核銷通知，畫面上的票永遠不會變成已核銷
      return call({ action: 'feed', method: 'GET', auth: true, query: { since: since, since_redeemed: sinceR } }).then(function (r) {
        if (r.ok) r.data.next = { since: isStr(r.data.cursor) ? r.data.cursor : since,
                                  since_redeemed: isStr(r.data.cursor_redeemed) ? r.data.cursor_redeemed : sinceR };
        return r;
      });
    },

    me: function () {
      var bad = needInit(); if (bad) return bad;
      return call({ action: 'me', method: 'GET', auth: true });
    },

    // 主播本人目前的菜單（重抓一次 state）。data：{ items, editable, closed, status, products }
    //   items    ＝ creators[] 裡自己那一筆的 menu（伺服器給什麼就是什麼，複本，改了不影響 SDK）
    //   editable ＝ event.menu_editable（只有 === false 才算鎖住；舊版 BFF 沒帶這欄＝可以改，跟 index.html 一樣）
    //   closed   ＝ event.status 是 ended（BFF 會回 409 closed）。draft 可以改
    //   products ＝ 上架中的商品（品項的「收哪種券」從這裡選）
    // bootstrap 只回 active 的品項；saveMenu 不接受下架（見 saveMenu），所以這裡拿到的就是完整菜單。
    // 不是本場主播 → { ok:false, state:'forbidden' }（不送請求以外的東西，state() 已經打過了）。
    menu: function () {
      var bad = needInit(); if (bad) return bad;
      return api.state().then(function (r) {
        if (!r.ok) return r;
        var me = r.data.me || {}, ev = r.data.event || {}, cs = r.data.creators || [], mine = null, i;
        if (me.is_creator !== true) return mk(false, 'forbidden', {}, '');
        for (i = 0; i < cs.length; i++) if (cs[i] && String(cs[i].user_id) === String(me.user_id)) mine = cs[i];
        return mk(true, 'ok', {
          items: copy((mine && mine.menu) || []),
          editable: ev.menu_editable !== false,
          closed: ev.status === 'ended',
          status: ev.status,
          products: copy(r.data.products || [])
        }, '');
      });
    },

    // 主播改菜單：整份取代。items：[{ id?, name, product_id, qty, description?, active? }]
    //   id 沿用 menu() 給的（付過券的票靠 id 對品項）；新品項不帶 id，伺服器產生。
    //   不支援下架：任一品項 active === false → 不送出，resolve { ok:false, state:'bad_request' }。要下架就刪除品項。
    //   （bootstrap 只回 active 的品項，存了下架品項之後主播自己看不到，下一次整份取代就把它刪了；跟 index.html 一樣不提供下架。）
    //   成功：data.menu ＝ 伺服器**實際存進去**的菜單（拿它重畫，不要用自己送出去的那份）；
    //         data.dropped ＝ 送出幾個、存了幾個的差（伺服器會靜默丟掉名稱空白、沒有 product_id、qty 不是正整數的品項，
    //         超過上限的也丟），> 0 就要告訴主播有品項沒存進去。
    //   業務失敗一律 resolve：menu_locked（工作人員鎖了）、closed（活動已結束）、forbidden（不是主播）、bad_request。
    // 不動錢：不帶 txn_id、結果不明不自動重送（整份取代，主播再按一次儲存就好）。送出中再呼叫 → busy。
    // 型別錯（qty 是字串、active 不是布林）才 reject：伺服器收到字串 qty 會靜默丟掉、收到 "false" 會當成上架。
    saveMenu: function (items) {
      var bad = needInit(); if (bad) return bad;
      if (!isArr(items)) return rejectWith('saveMenu(items)：items 要是陣列');
      var out = [], i, m;
      for (i = 0; i < items.length; i++) {
        m = items[i];
        if (!isObj(m)) return rejectWith('saveMenu：第 ' + (i + 1) + ' 項要是物件');
        if (!isStr(m.name)) return rejectWith('saveMenu：第 ' + (i + 1) + ' 項的 name 要是字串');
        if (!isStr(m.product_id)) return rejectWith('saveMenu：第 ' + (i + 1) + ' 項的 product_id 要是字串');
        if (typeof m.qty !== 'number' || !isFinite(m.qty)) return rejectWith('saveMenu：第 ' + (i + 1) + ' 項的 qty 要是數字');
        if (m.id != null && !isStr(m.id)) return rejectWith('saveMenu：第 ' + (i + 1) + ' 項的 id 要是字串');
        if (m.description != null && !isStr(m.description)) return rejectWith('saveMenu：第 ' + (i + 1) + ' 項的 description 要是字串');
        if (m.active != null && typeof m.active !== 'boolean') return rejectWith('saveMenu：第 ' + (i + 1) + ' 項的 active 要是 true 或 false');
        out.push(copy(m));
      }
      for (i = 0; i < out.length; i++) {
        if (out[i].active === false) return Promise.resolve(mk(false, 'bad_request', {}, '要下架請直接刪除品項'));
      }
      return guard('menu', function () {
        return call({ action: 'menu', method: 'POST', body: { menu: out }, auth: true }).then(function (r) {
          if (r.ok) {
            var saved = isArr(r.data.menu) ? r.data.menu.length : null;
            r.data.dropped = saved == null ? null : Math.max(0, out.length - saved);
            scheduleRefresh();
          }
          return r;
        });
      });
    },

    // 儲值：檢視器裡發 ADDVALUE（原生購買 modal 蓋在頁面上）；直連開新分頁到 SWAG 完整商城。
    topup: function () {
      var bad = needInit(); if (bad) return bad;
      var r;
      if (viaParent()) {
        // entrypoint 一定是 'addvalue'：其他值平台當 quickpay 區塊，沒人設就開出空的 modal（index.html ⑯-3）
        postParent({ type: 'ADDVALUE', entrypoint: 'addvalue', via: 'direct' });
        r = mk(true, 'opened', { via: 'addvalue' }, '');
      } else {
        r = openTab(SWAG + '/?campaign-id=checkout-diamondpack');   // 不帶 campaign → 完整商城
      }
      if (r.ok) later(function () { if (S.autoRefresh && S.auth === 'ready') api.state(); }, 3000);   // 買完回來不會有通知，靠重抓
      return Promise.resolve(r);
    },

    // 活動禮包：sectionId 不帶就用 state() 的 event.shop（enabled 且有 section_id 才有）。
    openPack: function (sectionId) {
      var bad = needInit(); if (bad) return bad;
      var id = sectionId;
      if (id == null) {
        var shop = S.last && S.last.event && S.last.event.shop;
        if (!shop || shop.enabled !== true || !shop.section_id) return Promise.resolve(mk(false, 'no_pack', {}, ''));
        id = shop.section_id;
      }
      if (!isStr(id) || !SECTION_RE.test(id)) return rejectWith('openPack(sectionId)：section id 只能用小寫英數與 _ -');
      var enc = b64campaign(id), r;
      if (viaParent()) {
        var url = SWAG + '/iframe/?source=' + encodeURIComponent(returnUrl()) +
          '&campaign-id=checkout-diamondpack&campaign=' + enc;
        postParent({ type: 'IFRAME_NAVIGATE', url: url });
        r = mk(true, 'opened', { url: url, via: 'navigate' }, '');
      } else {
        r = openTab(SWAG + '/?campaign-id=checkout-diamondpack&campaign=' + enc);
      }
      return Promise.resolve(r);
    },

    // 簡單輪詢：立刻跑一次，fn 回 Promise 就等它結束才排下一次；頁面隱藏時暫停、回前景立刻補一次。
    poll: function (fn, ms) {
      if (typeof fn !== 'function') throw new TypeError('[OET] poll(fn, ms)：fn 要是函式');
      ms = typeof ms === 'number' && ms >= 1000 ? ms : (ms == null ? 10000 : 1000);
      var stopped = false, timer = null, running = false, doc = root.document;
      function hidden() { try { return !!doc && doc.hidden === true; } catch (e) { return false; } }
      function schedule() { if (!stopped && !timer) timer = later(tick, ms); }
      function tick() {
        timer = null;
        if (stopped || running || hidden()) return;   // 隱藏時不排下一次；回前景由 onVis 接手
        running = true;
        var p;
        try { p = fn(); } catch (e) { later(function () { throw e; }); p = null; }
        Promise.resolve(p).then(done, done);
      }
      function done() { running = false; schedule(); }
      function onVis() {
        if (stopped || hidden() || running) return;
        clearTimeout(timer); timer = null; tick();
      }
      if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVis);
      tick();
      return {
        stop: function () {
          stopped = true; clearTimeout(timer); timer = null;
          if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onVis);
        }
      };
    }
  };

  // ══ mock：記憶體裡的假後端 ═════════════════════════════════════════════
  // 形狀、HTTP 狀態碼、檢查順序照 bff_main.py 各端點的 docstring。不打網路、不載圖。
  // 序號：123456＝一般用戶、654321＝主播（兩個在真的後端都被排除，不會撞到真序號）。
  // 控制台（只在 env:'mock' 有）：OET.mock.failNext(action, kind, {executed}) 等，見 README。
  function createMock(eid, o) {
    var U = '64f00000000000000000a001';
    var C = ['64f00000000000000000c001', '64f00000000000000000c002', '64f00000000000000000c003'];
    var W, fails, loginFails;

    function world() {
      var diamonds = {};
      diamonds[U] = typeof o.diamonds === 'number' ? o.diamonds : 1000;
      return {
        event: {
          id: eid, name: '【模擬】電子雞見面會', status: 'live', status_raw: 'live', ended_by_time: false,
          visual: { cover_url: '', theme_color: '', button_color_user: '', button_color_creator: '' },
          shop: { section_id: 'mock-pack', enabled: true, title: '活動限定禮包' },
          entry_gate: false,
          info: { title: '活動資訊', blocks: [{ type: 'text', text: '這是模擬資料。' }] },
          roster_only: false, menu_editable: true, starts_at: '', ends_at: ''
        },
        products: [
          { id: 'p_ticket', name: '互動券', price_diamonds: 100, active: true, sort_order: 0 },
          { id: 'p_photo', name: '合照券', price_diamonds: 300, active: true, sort_order: 1 }
        ],
        // 主播是裝飾用的假角色（mock 專用）。真的後端的主播名字一律來自後台名單。
        creators: [
          { user_id: C[0], display_name: '小雞主播', username: 'mock_chick', avatar_url: '', sort_order: 0,
            menu: [{ id: 'm_hi', name: '打招呼', product_id: 'p_ticket', qty: 1, description: '', active: true },
                   { id: 'm_feed', name: '餵電子雞', product_id: 'p_ticket', qty: 2, description: '', active: true },
                   { id: 'm_photo', name: '合照一張', product_id: 'p_photo', qty: 1, description: '', active: true }],
            fees: { travel: 0, attendance: 500 } },
          { user_id: C[1], display_name: '蛋蛋主播', username: 'mock_egg', avatar_url: '', sort_order: 1,
            menu: [{ id: 'm_sign', name: '簽名', product_id: 'p_ticket', qty: 1, description: '', active: true }],
            fees: { travel: 0, attendance: 0 } },
          { user_id: C[2], display_name: '', username: 'mock_hen', avatar_url: '', sort_order: 2,
            menu: [{ id: 'm_off', name: '已下架品項', product_id: 'p_ticket', qty: 1, description: '', active: false }],
            fees: { travel: 0, attendance: 0 } }
        ],
        users: (function () { var u = {}; u[U] = { username: 'mock_user', display_name: '模擬用戶' }; return u; }()),
        codes: (function () { var c = {}; c['123456'] = { uid: U, role: 'user' }; c['654321'] = { uid: C[0], role: 'creator' }; return c; }()),
        diamonds: diamonds,
        attendees: {},              // uid → { first_seen_at, balance:{pid:n} }
        txns: {},                   // txn_id → 帳本
        received: {},               // cid → { txn_id → 鏡像 }
        tally: {},                  // cid → tally
        revoked: {},
        wrapup: { rates: { p_ticket: 50, p_photo: 200 }, creator_text: '辛苦了，結算明細如下。',
                  user_title: '謝謝參加', user_blocks: [{ type: 'text', text: '下次見！' }] }
      };
    }
    function reset() { W = world(); fails = {}; loginFails = 0; }
    reset();

    function resp(status, body) { return { status: status, body: body }; }
    function isCreator(uid) { for (var i = 0; i < W.creators.length; i++) if (W.creators[i].user_id === uid) return W.creators[i]; return null; }
    function nameOf(uid) {
      var c = isCreator(uid); if (c) return { username: c.username, display_name: c.display_name || c.username };
      return W.users[uid] || { username: '', display_name: '' };
    }
    function checkedIn(uid) { return !!(W.attendees[uid] && W.attendees[uid].first_seen_at); }
    function tallyOf(cid) {
      var t = W.tally[cid] || {};
      return { received_total: t.received_total || 0, by_item: copy(t.by_item || {}), by_product: copy(t.by_product || {}),
               pending_total: t.pending_total || 0, pending_by_item: copy(t.pending_by_item || {}) };
    }
    function b64u(s) { return root.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return root.atob(s); }
    function makeSession(uid) {
      var p = { eid: eid, uid: uid, sid: rand36(16), exp: Math.floor(Date.now() / 1000) + 72 * 3600 };
      return 'oes1.' + b64u(JSON.stringify(p)) + '.mock';
    }
    // require_user：oes1 → session_invalid；其他 → unauthorized
    function who(token) {
      if (!token) return { err: resp(401, { ok: false, state: 'unauthorized' }) };
      if (token.indexOf('oes1.') !== 0) return { err: resp(401, { ok: false, state: 'unauthorized' }) };
      var parts = token.split('.'), p = null;
      try { p = JSON.parse(unb64u(parts[1])); } catch (e) {}
      if (parts.length !== 3 || parts[2] !== 'mock' || !p || p.eid !== eid || W.revoked[p.sid] ||
          !(W.users[p.uid] || isCreator(p.uid))) {
        return { err: resp(401, { ok: false, state: 'session_invalid', message: '請重新輸入序號' }) };
      }
      var n = nameOf(p.uid);
      return { me: { id: p.uid, username: n.username, displayName: n.display_name, sid: p.sid } };
    }
    function live() { return W.event.status === 'live'; }
    function txnRows(uid) {
      var rows = [], k, d, pend = 0, names = {};
      for (var i = 0; i < W.creators.length; i++) names[W.creators[i].user_id] = W.creators[i].display_name || W.creators[i].username || '';
      for (k in W.txns) if (has(W.txns, k)) {
        d = W.txns[k];
        if (d.user_id !== uid) continue;
        var spend = d.type === 'spend';
        if (spend && d.state === 'settled' && d.redeem_state === 'pending') pend++;
        var row = { txn_id: k, type: d.type, state: d.state, product_id: d.product_id, product_name: d.product_name,
                    qty: d.qty, diamonds: d.type === 'purchase' ? d.diamonds : 0,
                    creator_id: spend ? d.creator_id : '', creator_name: spend ? (names[d.creator_id] || '') : '',
                    menu_item_name: spend ? d.menu_item_name : '', created_at: d.created_at };
        if (spend) { row.redeem_state = d.redeem_state; row.redeemed_at = d.redeemed_at; }
        rows.push(row);
      }
      rows.sort(function (a, b) { var x = a.created_at + a.txn_id, y = b.created_at + b.txn_id; return x < y ? 1 : x > y ? -1 : 0; });
      return { rows: rows.slice(0, 100), pending: pend };
    }
    function conflict() { return resp(409, { ok: false, state: 'txn_id_conflict', message: '這筆交易編號已經用過，請重新操作' }); }
    function productName(pid) { for (var i = 0; i < W.products.length; i++) if (W.products[i].id === pid) return W.products[i].name; return pid; }

    var H = {
      login: function (req) {
        var b = req.body || {}, code = b.code;
        if (!(isStr(code) && /^\d{6}$/.test(code))) return resp(400, { ok: false, state: 'bad_request', message: '序號要是 6 位數字' });
        if (loginFails >= 10) return resp(429, { ok: false, state: 'rate_limited', retry_after_sec: 600, message: '嘗試太多次，請稍後再試' });
        var hit = W.codes[code];
        if (!hit) { loginFails++; return resp(401, { ok: false, state: 'bad_code', message: '序號不對' }); }
        var n = nameOf(hit.uid);
        return resp(200, { ok: true, state: 'ok', session: makeSession(hit.uid), role: hit.role,
                           user: { user_id: hit.uid, username: n.username, display_name: n.display_name } });
      },
      bootstrap: function (req, me) {
        var uid = me.id, c = isCreator(uid), out = copy({ event: W.event });
        var products = [], creators = [], i;
        for (i = 0; i < W.products.length; i++) if (W.products[i].active) products.push(copy(W.products[i]));
        products.sort(function (a, b) { return a.sort_order - b.sort_order; });
        var cs = W.creators.slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
        for (i = 0; i < cs.length; i++) {
          var menu = [];
          for (var j = 0; j < cs[i].menu.length; j++) if (cs[i].menu[j].active !== false) menu.push(copy(cs[i].menu[j]));
          creators.push({ user_id: cs[i].user_id, display_name: cs[i].display_name, username: cs[i].username,
                          avatar_url: cs[i].avatar_url, menu: menu });
        }
        var tr = txnRows(uid);
        var body = { ok: true, state: 'ok', event: out.event, products: products, creators: creators,
                     me: { user_id: uid, username: me.username, display_name: me.displayName || me.username,
                           is_creator: !!c, checked_in: c ? true : checkedIn(uid), tickets_pending: tr.pending },
                     balance: c ? {} : copy((W.attendees[uid] || {}).balance || {}),
                     diamonds: has(W.diamonds, uid) ? W.diamonds[uid] : 0,
                     my_txns: tr.rows, server_time: nowIso() };
        if (c) {
          var t = tallyOf(uid), n = 0, k;
          for (k in (W.received[uid] || {})) if (has(W.received[uid], k)) n++;
          t.txn_count = n;
          body.me.tally = t;
        }
        return resp(200, body);
      },
      checkin: function (req, me) {
        if (!live()) return resp(409, { ok: false, state: 'closed', message: '活動尚未開始或已結束' });
        if (isCreator(me.id)) return resp(200, { ok: true, state: 'ok', checked_in: true });
        var a = W.attendees[me.id] = W.attendees[me.id] || { balance: {} };
        var first = !a.first_seen_at;
        if (first) a.first_seen_at = nowIso();
        var b = req.body || {};
        if (isStr(b.fpid) && b.fpid) a.fpid = b.fpid;
        return resp(200, { ok: true, state: 'ok', checked_in: true, first_time: first });
      },
      purchase: function (req, me, flag) {
        var b = req.body || {}, txn = trim(b.txn_id), pid = trim(b.product_id), qty = b.qty, i, p = null;
        if (!txn) return resp(400, { ok: false, state: 'bad_request', message: '缺少 txn_id' });
        if (!pid) return resp(400, { ok: false, state: 'bad_request', message: '缺少 product_id' });
        if (typeof qty !== 'number' || qty % 1 !== 0 || qty <= 0) return resp(400, { ok: false, state: 'bad_request', message: '數量無效' });
        if (!live()) return resp(409, { ok: false, state: 'closed', message: '活動尚未開始或已結束' });
        if (!checkedIn(me.id)) return resp(403, { ok: false, state: 'not_checked_in', message: '請先確認進入活動' });
        for (i = 0; i < W.products.length; i++) if (W.products[i].id === pid && W.products[i].active) p = W.products[i];
        if (!p) return resp(404, { ok: false, state: 'not_found', message: '商品不存在或已下架' });
        var total = p.price_diamonds * qty;
        if (total > 100000) return resp(400, { ok: false, state: 'too_large', message: '單筆上限 100000' });
        var cur = W.txns[txn];
        if (cur) {                                    // 重送：回那筆的現況，不查餘額（不帶 diamonds／balance）
          // v4.0.1：已存在但不是本人的買券（付券的 id、別人的 id）→ 409，什麼都不做
          if (cur.type !== 'purchase' || cur.user_id !== me.id) return conflict();
          if (cur.state === 'settled') return resp(200, { ok: true, state: 'settled', resumed: true, message: '這筆已經完成了' });
          if (cur.state === 'failed') return resp(200, { ok: false, state: 'failed', resumed: true, message: '扣鑽失敗' });
          return resp(200, { ok: false, state: 'pending', resumed: true, message: '這筆交易還在處理中，請先不要重送。' });
        }
        var have = W.diamonds[me.id] || 0;
        if (have < total) return resp(409, { ok: false, state: 'insufficient_diamonds', message: '鑽石不足', need: total, have: have });
        cur = W.txns[txn] = { type: 'purchase', state: 'pending', user_id: me.id, product_id: pid, product_name: p.name,
                              qty: qty, diamonds: total, created_at: nowIso() };
        if (flag === 'rpc_failed') { cur.state = 'failed'; return resp(200, { ok: false, state: 'failed', message: '扣鑽失敗' }); }
        if (flag === 'rpc_unknown') {
          return resp(200, { ok: false, state: 'pending', message: '這筆交易還在處理中，請先不要重送，找現場工作人員確認。' });
        }
        W.diamonds[me.id] = have - total;
        var a = W.attendees[me.id] = W.attendees[me.id] || { balance: {} };
        a.balance[pid] = (a.balance[pid] || 0) + qty;
        cur.state = 'settled';
        var g = {}; g[pid] = qty;
        return resp(200, { ok: true, state: 'settled', txn_id: txn, granted: g, balance: copy(a.balance), diamonds: have - total });
      },
      spend: function (req, me) {
        var b = req.body || {}, txn = trim(b.txn_id), cid = trim(b.creator_id), iid = trim(b.menu_item_id), i;
        if (!(txn && cid && iid)) return resp(400, { ok: false, state: 'bad_request', message: '缺少 txn_id / creator_id / menu_item_id' });
        if (!live()) return resp(409, { ok: false, state: 'closed', message: '活動尚未開始或已結束' });
        if (!checkedIn(me.id) && !isCreator(me.id)) return resp(403, { ok: false, state: 'not_checked_in', message: '請先確認進入活動' });
        var c = isCreator(cid);
        if (!c) return resp(404, { ok: false, state: 'not_found', message: '這位創作者不在這場活動' });
        var item = null;
        for (i = 0; i < c.menu.length; i++) if (c.menu[i].id === iid && c.menu[i].active !== false) item = c.menu[i];
        if (!item) return resp(404, { ok: false, state: 'not_found', message: '品項不存在或已下架' });
        var a = W.attendees[me.id] = W.attendees[me.id] || { balance: {} };
        if (W.txns[txn]) {
          // v4.0.1：已存在但不是本人的付券（買券的 id、別人的 id）→ 409，不扣券、不產生票券
          if (W.txns[txn].type !== 'spend' || W.txns[txn].user_id !== me.id) return conflict();
          return resp(200, { ok: true, state: 'settled', resumed: true, message: '這筆已經送出過了',
                             redeem_state: W.txns[txn].redeem_state || 'redeemed', balance: copy(a.balance) });
        }
        var have = a.balance[item.product_id] || 0, need = item.qty;
        if (have < need) return resp(409, { ok: false, state: 'insufficient', message: '券不夠（需要 ' + need + '，剩 ' + have + '）' });
        a.balance[item.product_id] = have - need;
        var t = W.tally[cid] = tallyOf(cid);
        t.pending_total += need;
        t.pending_by_item[iid] = (t.pending_by_item[iid] || 0) + need;
        var ts = nowIso(), n = nameOf(me.id);
        W.txns[txn] = { type: 'spend', state: 'settled', redeem_state: 'pending', redeemed_at: '', user_id: me.id,
                        creator_id: cid, menu_item_id: iid, menu_item_name: item.name, product_id: item.product_id,
                        product_name: productName(item.product_id), qty: need, created_at: ts };
        W.received[cid] = W.received[cid] || {};
        W.received[cid][txn] = { display_name: n.display_name || n.username, menu_item_name: item.name, qty: need,
                                 created_at: ts, redeem_state: 'pending', redeemed_at: '' };
        return resp(200, { ok: true, state: 'settled', txn_id: txn, redeem_state: 'pending', balance: copy(a.balance) });
      },
      redeem: function (req, me) {
        var b = req.body || {}, txn = trim(b.txn_id);
        if (!txn) return resp(400, { ok: false, state: 'bad_request', message: '缺少 txn_id' });
        var t = W.txns[txn], mine = !!t && t.type === 'spend' && t.user_id === me.id;
        if (!live()) {
          if (mine && t.redeem_state === 'redeemed') return resp(200, { ok: true, state: 'redeemed', resumed: true, txn_id: txn, redeemed_at: t.redeemed_at });
          return resp(409, { ok: false, state: 'closed', message: '活動已結束，無法核銷' });
        }
        if (!t || t.type !== 'spend') return resp(404, { ok: false, state: 'not_found', message: '找不到這張票券' });
        if (!mine) return resp(403, { ok: false, state: 'forbidden', message: '這不是你的票券' });
        if (t.redeem_state === 'redeemed') return resp(200, { ok: true, state: 'redeemed', resumed: true, txn_id: txn, redeemed_at: t.redeemed_at });
        var ts = nowIso();
        t.redeem_state = 'redeemed'; t.redeemed_at = ts;
        var r = W.received[t.creator_id] && W.received[t.creator_id][txn];
        if (r) { r.redeem_state = 'redeemed'; r.redeemed_at = ts; }
        var ta = W.tally[t.creator_id] = tallyOf(t.creator_id);
        ta.pending_total = Math.max(0, ta.pending_total - t.qty);
        ta.pending_by_item[t.menu_item_id] = Math.max(0, (ta.pending_by_item[t.menu_item_id] || 0) - t.qty);
        ta.received_total += t.qty;
        ta.by_item[t.menu_item_id] = (ta.by_item[t.menu_item_id] || 0) + t.qty;
        ta.by_product[t.product_id] = (ta.by_product[t.product_id] || 0) + t.qty;
        return resp(200, { ok: true, state: 'redeemed', txn_id: txn, redeemed_at: ts });
      },
      feed: function (req, me) {
        if (!isCreator(me.id)) return resp(403, { ok: false, state: 'forbidden' });
        var q = req.query || {}, since = q.since || '', sr = q.since_redeemed, rec = W.received[me.id] || {}, k;
        var items = [], red = [];
        for (k in rec) if (has(rec, k)) {
          if (rec[k].created_at > since) items.push({ txn_id: k, display_name: rec[k].display_name, menu_item_name: rec[k].menu_item_name,
            qty: rec[k].qty, created_at: rec[k].created_at, redeem_state: rec[k].redeem_state, redeemed_at: rec[k].redeemed_at });
          if (sr != null && rec[k].redeemed_at && rec[k].redeemed_at > sr) red.push({ txn_id: k, redeemed_at: rec[k].redeemed_at });
        }
        items.sort(function (a, b) { return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0; });
        red.sort(function (a, b) { return a.redeemed_at < b.redeemed_at ? -1 : a.redeemed_at > b.redeemed_at ? 1 : 0; });
        items = items.slice(0, 100); red = red.slice(0, 200);
        return resp(200, { ok: true, state: 'ok', items: items, cursor: items.length ? items[items.length - 1].created_at : since,
                           redeemed: red, cursor_redeemed: red.length ? red[red.length - 1].redeemed_at : (sr || ''),
                           tally: tallyOf(me.id) });
      },
      wrapup: function (req, me) {
        if (W.event.status !== 'ended') return resp(409, { ok: false, state: 'not_ended', message: '活動還沒結束' });
        var w = W.wrapup, k, d, c = isCreator(me.id);
        if (c) {
          var qtyBy = {}, pending = 0, lines = [], sub = 0, i;
          for (k in W.txns) if (has(W.txns, k)) {
            d = W.txns[k];
            if (d.creator_id !== me.id || d.type !== 'spend' || d.state !== 'settled') continue;
            if (d.redeem_state === 'redeemed') qtyBy[d.product_id] = (qtyBy[d.product_id] || 0) + d.qty; else pending += d.qty;
          }
          for (i = 0; i < W.products.length; i++) {
            var p = W.products[i], rate = w.rates[p.id] || 0, q = qtyBy[p.id] || 0;
            if (q > 0 || rate > 0) { lines.push({ product_id: p.id, product_name: p.name, rate: rate, qty: q, amount: rate * q }); sub += rate * q; }
          }
          return resp(200, { ok: true, state: 'ok', role: 'creator', text: w.creator_text, lines: lines, fees: copy(c.fees),
                             subtotal: sub, total: sub + c.fees.travel + c.fees.attendance, pending_qty: pending });
        }
        var n = { purchased_qty: 0, spent_qty: 0, redeemed_qty: 0, pending_qty: 0, purchased_diamonds: 0 };
        for (k in W.txns) if (has(W.txns, k)) {
          d = W.txns[k];
          if (d.user_id !== me.id || d.state !== 'settled') continue;
          if (d.type === 'purchase') { n.purchased_qty += d.qty; n.purchased_diamonds += d.diamonds; }
          else if (d.type === 'spend') { n.spent_qty += d.qty; n[d.redeem_state === 'redeemed' ? 'redeemed_qty' : 'pending_qty'] += d.qty; }
        }
        return resp(200, { ok: true, state: 'ok', role: 'user', title: w.user_title, blocks: copy(w.user_blocks),
                           purchased_qty: n.purchased_qty, spent_qty: n.spent_qty, redeemed_qty: n.redeemed_qty,
                           pending_qty: n.pending_qty, purchased_diamonds: n.purchased_diamonds });
      },
      // 主播改菜單（bff_main.py update_menu）。順序：非主播 403 → ended 409 closed → 鎖 403 menu_locked → body 400 → 整份取代。
      // 清洗規則照 BFF：只看前 50 個；不是物件、名稱空白、沒有 product_id、qty 不是正整數 → 靜默丟掉（不報錯）。
      menu: function (req, me) {
        var c = isCreator(me.id), b = req.body, i, m;
        if (!c) return resp(403, { ok: false, state: 'forbidden' });
        if (W.event.status === 'ended') return resp(409, { ok: false, state: 'closed', message: '活動已結束' });
        if (W.event.menu_editable === false) return resp(403, { ok: false, state: 'menu_locked', message: '菜單已鎖定，請洽工作人員' });
        var menu = isObj(b) ? b.menu : undefined;
        if (!isArr(menu)) return resp(400, { ok: false, state: 'bad_request', message: 'menu 要是陣列' });
        var clean = [];
        for (i = 0; i < menu.length && i < 50; i++) {
          m = menu[i];
          if (!isObj(m)) continue;
          var name = trim(m.name || '').slice(0, 60), pid = trim(m.product_id || ''), qty = m.qty;
          if (!name || !pid || typeof qty !== 'number' || qty % 1 !== 0 || qty <= 0) continue;
          clean.push({ id: String(m.id || rand36(12)), name: name, product_id: pid, qty: qty,
                       description: trim(m.description || '').slice(0, 200), active: has(m, 'active') ? !!m.active : true });
        }
        c.menu = clean;
        return resp(200, { ok: true, state: 'ok', menu: copy(clean) });
      },
      me: function (req, me) {
        var c = isCreator(me.id);
        var body = { ok: true, state: 'ok', event_id: eid, user_id: me.id, username: me.username, display_name: me.displayName,
                     role: c ? 'creator' : 'user', via: 'code', checked_in: c ? true : checkedIn(me.id) };
        return resp(200, body);
      }
    };

    var M = {
      requests: [],          // 每一次送出的請求 { action, method, body, auth }（auth 只記有沒有帶）
      opened: [],            // 直連模式要開的新分頁網址（mock 不真的開）
      posted: [],            // 送給父層的 postMessage（ADDVALUE／IFRAME_NAVIGATE）
      // 讓下一次 action 失敗（action：buy、spend、redeem、state、checkin、login、feed、wrapup、me、menu）。kind：'timeout'｜'network'｜'5xx'｜'html'（伺服器回 HTML）｜
      //   'rpc_failed'｜'rpc_unknown'（只對 buy：扣鑽失敗／扣鑽結果不明）。
      // opts.executed=true：伺服器其實做完了、只是回應掉了（測「扣了但沒收到回應」→ 同 txn_id 重送拿到 resumed）。
      failNext: function (action, kind, opts) {
        var a = action === 'buy' ? 'purchase' : action === 'state' ? 'bootstrap' : action === 'saveMenu' ? 'menu' : action;
        if (!ACTIONS[a]) throw new TypeError('[OET.mock] 沒有這個 action：' + action);
        (fails[a] = fails[a] || []).push({ kind: kind, executed: !!(opts && opts.executed) });
      },
      setDiamonds: function (n) { W.diamonds[U] = n; },
      // 工作人員在後台鎖／開菜單（event.menu_editable）。下一次 state() 才看得到。
      setMenuEditable: function (v) {
        if (typeof v !== 'boolean') throw new TypeError('[OET.mock] setMenuEditable 要給 true 或 false');
        W.event.menu_editable = v;
      },
      setStatus: function (s) {
        if (s !== 'draft' && s !== 'live' && s !== 'ended') throw new TypeError('[OET.mock] status 要是 draft／live／ended');
        W.event.status = s; W.event.status_raw = s;
      },
      revokeSessions: function () {
        var tok = S.token, p = null;
        if (tok && tok.indexOf('oes1.') === 0) { try { p = JSON.parse(unb64u(tok.split('.')[1])); } catch (e) {} }
        if (p) W.revoked[p.sid] = true;
      },
      reset: function () { reset(); M.requests.length = 0; M.opened.length = 0; M.posted.length = 0; },
      world: function () { return copy(W); },
      _send: function (req, token) {
        var a = req.action, f = (fails[a] || []).shift() || null, flag = null;
        M.requests.push({ action: a, method: req.method, body: copy(req.body == null ? null : req.body), query: copy(req.query || null), auth: !!token });
        if (f && (f.kind === 'rpc_failed' || f.kind === 'rpc_unknown')) { flag = f.kind; f = null; }
        return new Promise(function (resolve) {
          later(function () {
            var out = null;
            if (!f || f.executed) {
              var r;
              if (a === 'login') r = H.login(req);
              else {
                var w = who(token);
                r = w.err || H[a](req, w.me, flag);
              }
              out = { kind: 'http', status: r.status, text: JSON.stringify(r.body) };
            }
            if (f) {
              if (f.kind === 'timeout') out = { kind: 'timeout' };
              else if (f.kind === 'network') out = { kind: 'network' };
              else if (f.kind === '5xx') out = { kind: 'http', status: 503, text: JSON.stringify({ ok: false, state: 'unavailable', message: '暫時無法處理' }) };
              else out = { kind: 'http', status: 502, text: '<html><body>502 Bad Gateway</body></html>' };
            }
            resolve(out);
          }, 120 + Math.floor(Math.random() * 120));
        });
      }
    };
    return M;
  }

  root.OET = api;
}(typeof window !== 'undefined' ? window : this));

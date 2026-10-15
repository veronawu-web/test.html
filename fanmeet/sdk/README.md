# oet-sdk.js：線下活動工具箱 JS 套件（1.1.0，契約 v4.0）

讓主題活動頁（例如電子雞）接上線下活動工具箱的後端：身份、報到、買券、付券、核銷、結束總結、主播改菜單。
**只管資料，不畫畫面**，UI 你自己畫。ES5、單檔、沒有任何外部依賴（SWAG 的 CSP 會擋外部 CDN）。

- 範例頁：`example.html`（`?env=mock` 不連網就能跑完整流程；`?env=test` 打測試沙盒）。頁面上只有操作功能，要模擬故障見第 5 節
- 每個 `state` 的意思與建議處理：`STATES.md`
- 上線網址（開 PR 之後）：`https://events.swag.app/offline-event/sdk/v1/oet-sdk.js`

---

## 1. 快速開始

```html
<script src="https://events.swag.app/offline-event/sdk/v1/oet-sdk.js"></script>
<script>
  OET.init({ env: 'mock' });            // 正式：{ env:'live', eventId:'<活動代號>' }；測試沙盒：{ env:'test' }

  OET.on('auth', function (a) {          // a.state：'ready' | 'need_code' | 'pending'
    if (a.state === 'need_code') showCodeInput();          // 你的序號輸入畫面，送出時 OET.auth.login(code)
    if (a.state === 'ready') OET.poll(function () { return OET.state(); }, 10000);
  });
  OET.on('state', function (d) {         // 每次拿到伺服器的新資料（含買券、付券後 SDK 自動重抓的那次）
    draw(d);                             // d.me、d.event、d.products、d.creators、d.balance、d.diamonds、d.my_txns
  });
</script>
```

三種環境：

| env | 打哪裡 | 用途 |
|---|---|---|
| `mock` | 不連網（瀏覽器裡的假後端） | 做畫面。假活動、假商品、假主播、假餘額 1,000 鑽。序號 `123456`＝用戶、`654321`＝主播。重新整理就重置資料 |
| `test` | `/v1/test/…`（測試沙盒） | 真的扣鑽、真的花券，帳記在沙盒活動。本機 `http://localhost:<port>`／`http://127.0.0.1:<port>` 也能打（只有這個環境開放本機） |
| `live` | `/v1/event/<eventId>/…` | 正式活動。頁面要放在 `events.swag.app` 底下（本機打不通，CORS 會擋） |

## 2. 身份

- **在 SWAG App／swag.live 的檢視器裡**（頁面在 iframe 裡）：SDK 自動跟父層握手拿 SWAG 身份，`auth.state()` 先是 `pending`，
  拿到就 `ready`。6 秒拿不到（沒登入 SWAG 等）→ `need_code`，改用序號。
- **直接開網址**（不在檢視器裡）：要用序號登入。登入後憑證存在 localStorage，下次開頁直接 `ready`。
- ⚠️ LINE 內建瀏覽器拿不到 SWAG 身份，一定是走序號。

| API | 說明 |
|---|---|
| `OET.auth.state()` | `'ready'`／`'need_code'`／`'pending'` |
| `OET.auth.login(code)` | 6 位數字（全形、中間有空白都可以）。成功後觸發 `auth` 事件。失敗看 `state`：`bad_code`（序號不對）、`rate_limited`（`data.retry_after_sec`）、`entry_required` |
| `OET.auth.logout()` | 清掉本機憑證，回 `need_code`（不會登出 SWAG 本身） |
| `OET.auth.header()` | `'Bearer …'`，給你轉送到**你自己的後端**（見第 6 節）；沒登入是 `null` |
| `OET.auth.via()` | `'swag'`／`'code'`／`null` |
| `OET.on('auth', fn)` | `fn({state, via, reason})`。reason：`init`、`token`、`login`、`logout`、`session_invalid`、`handshake_timeout`、`unauthorized` |

憑證失效（後台登出、序號重設、移出名單）時，任何呼叫都會回 `state:'session_invalid'`，SDK 同時清掉憑證、
觸發 `auth` 事件變 `need_code`——你只要在 `auth` 事件裡把序號畫面叫出來。

有入場 QR 簽章的活動（`event.entry_gate` 為 true）：把網址上的簽章傳進 `OET.init({ ..., entry:'<eid>.<bucket>.<sig>' })`，
登入與報到會自動帶上。測試沙盒沒有開這個閘門。

## 3. 功能一覽

全部回 Promise，**resolve** 統一形狀：

```js
{ ok: true|false, state: '…', data: {…}, message: '給用戶看的一句話', txnId: '…'（只有 buy／spend／redeem） }
```

**業務失敗也是 resolve**（鑽石不足、沒報到、序號錯、活動已結束…）。只有呼叫方式錯了（沒 init、參數型別錯）才 reject。
`data` 是伺服器回的欄位原樣（加一個 `httpStatus`）。**數字一律顯示 `data` 裡伺服器給的值，不要自己加減**。

| API | 打哪支 | 成功時的 data |
|---|---|---|
| `OET.state()` | bootstrap | `me`（`checked_in`、`is_creator`、`tickets_pending`）、`event`（`status`：draft／live／ended、`shop`）、`products`、`creators`（含 `menu`）、`balance`（券）、`diamonds`（鑽石；`null`＝暫時讀不到，顯示「—」不要顯示 0）、`my_txns`。同時觸發 `state` 事件 |
| `OET.checkin()` | checkin | `checked_in`、`first_time`。`me.checked_in === false` 時要先報到才能買券、付券 |
| `OET.buy(productId, qty)` | purchase | `granted`、`balance`、`diamonds`（扣完的餘額）。重送回來的（`data.resumed:true`）沒有這兩個，等 SDK 自動重抓的 `state` 事件 |
| `OET.spend(creatorId, menuItemId)` | spend | `redeem_state:'pending'`、`balance`。付券只產生**待核銷的票券**，主播在用戶手機上按核銷才算收入 |
| `OET.redeem(txnId)` | redeem | `redeemed_at`。txnId 是票券（付券那筆）的 `txn_id`。重按是安全的（`resumed:true`） |
| `OET.tickets()` | bootstrap | `pending`（待核銷）、`redeemed`（已核銷）、`pendingCount`。⚠️ 紀錄最多 100 筆，待核銷總數以 `pendingCount` 為準 |
| `OET.wrapup()` | wrapup | 活動結束後的總結。還沒結束 → `state:'not_ended'`。用戶：`purchased_qty`、`spent_qty`、`redeemed_qty`…；主播：`lines`、`total`… |
| `OET.creatorFeed(cursor)` | feed | 主播收款：`items`、`redeemed`（已核銷通知）、`tally`、`next`。下一次把 `data.next` 傳回來；第一次傳 `null` |
| `OET.me()` | me | `user_id`、`username`、`display_name`、`role`、`via`、`checked_in` |
| `OET.menu()` | bootstrap | 主播本人的菜單：`items`（自己那一筆的 `menu`）、`editable`（`event.menu_editable`；`false`＝工作人員鎖了）、`closed`（活動已結束）、`status`、`products`（上架中的券，給「收哪種券」選）。不是主播 → `state:'forbidden'` |
| `OET.saveMenu(items)` | menu | 主播改菜單，**整份取代**。`items`：`[{id?, name, product_id, qty, description?, active?}]`，舊品項帶回 `menu()` 給的 `id`，新品項不帶。成功：`menu`（伺服器**實際存進去**的那份，拿它重畫）、`dropped`（送出幾個、存了幾個的差，見下）。失敗：`menu_locked`（鎖了，保留編輯中的內容）、`closed`、`forbidden`、`bad_request`（有品項 `active:false`，沒送出）。送出中再呼叫 → `busy` |
| `OET.topup()` | — | 儲值。檢視器裡開原生購買 modal；直接開時開新分頁到 SWAG 商城。被瀏覽器擋 → `state:'popup_blocked'`、`data.url`（畫一個連結讓用戶自己點） |
| `OET.openPack(sectionId?)` | — | 活動限定禮包。不帶參數就用 `state()` 的 `event.shop`；沒設 → `state:'no_pack'` |
| `OET.poll(fn, ms)` | — | 立刻跑一次，之後每 ms 毫秒（最少 1000）；fn 回 Promise 就等它結束再排下一次；頁面切到背景自動暫停。回 `{ stop() }` |
| `OET.on(name, fn)`／`OET.off` | — | 事件只有 `auth` 與 `state`。`on` 回一個取消訂閱的函式 |

**菜單**：整份取代；不支援下架，要下架就刪除品項；伺服器會靜默丟掉不合格品項，看 `data.dropped`。

買券、付券、報到、核銷、改菜單成功之後，SDK 會在背景自動重抓一次 `state()`（觸發 `state` 事件），畫面跟著伺服器走就好。
不想要的話 `OET.init({ ..., autoRefresh:false })`。

SDK 自己會產生的 state：`network`（連不上）、`timeout`、`unparsed`（伺服器回了看不懂的東西）、`unknown`（見下）、
`need_code`（還沒登入就呼叫）、`logged_out`（請求出去之後登出了，資料不交出來）、`busy`（上一筆買券／付券／存菜單還沒回來）、
`popup_blocked`、`no_pack`、`bad_request`（序號格式不對，沒有送出）、`forbidden`（`menu()` 但不是主播）。其他 state 都是伺服器回的，見 `STATES.md`。

## 4. 錯誤處理範例

```js
OET.buy('p_ticket', 2).then(function (r) {
  if (r.ok) return toast('購買完成');
  switch (r.state) {
    case 'insufficient_diamonds':                 // r.data.need、r.data.have
      return showTopup('鑽石不足（需要 ' + r.data.need + '，目前 ' + r.data.have + '）');   // 按鈕接 OET.topup()
    case 'not_checked_in':
      return showCheckin();                         // 先 OET.checkin()
    case 'pending':                                 // 扣鑽結果不明，伺服器在等人工確認
    case 'unknown':                                 // SDK 重送過一次仍不知道結果
      // 不要讓用戶換一筆重買。「查詢結果」用同一個 txnId：
      return showUnknown(r.message, r.txnId, function () { return OET.buy('p_ticket', 2, { txnId: r.txnId }); });
    default:
      return toast(r.message);                      // closed（活動已結束）、session_invalid…
  }
});
```

### 會動錢的呼叫：逾時與重送

- 每一次 `buy`／`spend` 呼叫，SDK 都產生**全新**的 `txn_id`（`tb_`＝買券、`ts_`＝付券）。
- 逾時、斷線、伺服器 5xx（結果不明）→ SDK 用**同一個 txn_id、同一份內容**自動重送**一次**。伺服器看到同一個 txn_id 會回那筆的現況，不會扣兩次。
- 第二次還是不知道 → `{ ok:false, state:'unknown', txnId }`，`message`「結果不明，請重新整理查看」。畫面留著交易編號，
  「查詢結果」就是用 `{ txnId }` 再呼叫一次（**同一個動作**：買券的 txnId 只能給 `buy`，付券的只能給 `spend`；給錯會 reject）。
- 明確失敗（`state:'failed'`）之後要再買，**不要**帶舊的 txnId，直接再呼叫一次 `buy`（會是新的一筆）。
- 🔴 **自己呼叫 API、不用 SDK 的人：每一個動作都要用新的 txn_id，只有「同一個動作的逾時重送」才沿用；txn_id 絕對不能在買券與付券之間共用。**
  後端的買券與付券共用同一個帳本。契約 v4.0.1 起，拿買過券的 txn_id 去付券（或拿別人的 txn_id）會回
  `409 txn_id_conflict`，什麼都沒做——換新的 txn_id 重新操作。（v4.0 以前會回「成功（resumed）」但其實沒付。）

## 5. 模擬故障（只有 `env:'mock'` 有 `OET.mock`）

範例頁上沒有控制按鈕。要模擬故障請在瀏覽器 Console 呼叫 `OET.mock.failNext(...)` 等下表的函式，再回頁面上操作。

| API | 用途 |
|---|---|
| `OET.mock.failNext(action, kind, {executed})` | 讓下一次 `action`（`buy`、`spend`、`redeem`、`state`、`checkin`、`login`、`saveMenu`…）失敗。`kind`：`'timeout'`、`'network'`、`'5xx'`、`'html'`；只對 `buy`：`'rpc_failed'`（扣鑽失敗）、`'rpc_unknown'`（扣鑽結果不明 → pending）。`executed:true`＝伺服器其實做完了、只是回應掉了 |
| `OET.mock.setDiamonds(n)` | 改鑽石餘額（例：0 看鑽石不足） |
| `OET.mock.setStatus('draft'\|'live'\|'ended')` | 改活動狀態（ended 才看得到結束總結） |
| `OET.mock.setMenuEditable(true\|false)` | 工作人員鎖／開菜單。鎖住後 `saveMenu` 回 `menu_locked`；`menu().editable` 要等下一次 `state()` 才變 |
| `OET.mock.revokeSessions()` | 讓目前的序號憑證失效（看 `session_invalid` → 回序號畫面） |
| `OET.mock.requests` | 送出過的每一筆請求（看重送是不是同一個 `txn_id`） |
| `OET.mock.opened`／`OET.mock.posted` | 儲值、禮包要開的網址／要送給父層的訊息（mock 不真的開） |
| `OET.mock.reset()`、`OET.mock.world()` | 重置／看目前的假資料 |

mock 跟真的後端一樣：拿買券的 txn_id 去付券（或反過來、或別人的 txn_id）回 `txn_id_conflict`。

例：連兩次逾時 → `unknown`：

```js
OET.mock.failNext('buy', 'timeout'); OET.mock.failNext('buy', 'timeout');
OET.buy('p_ticket', 1).then(function (r) { console.log(r.state, r.txnId); });   // 'unknown', 'tb_…'
```

## 6. 兩個後端：你自己的後端用 `/me` 驗身份

你的頁面也可以接你自己的後端（例如存電子雞的狀態）。**不要相信前端傳來的 user_id**，把用戶的身份轉給我們驗：

```js
fetch('https://你的後端/feed-pet', { method: 'POST', headers: { 'Authorization': OET.auth.header() } });
```

你的後端收到後，把 `Authorization` 原封轉來：

```bash
# 正式活動
curl -s https://offline-event-bff-905468082258.asia-east1.run.app/v1/event/<活動代號>/me \
  -H "Authorization: Bearer <用戶轉來的值>"
# 測試沙盒
curl -s https://offline-event-bff-905468082258.asia-east1.run.app/v1/test/me \
  -H "Authorization: Bearer <用戶轉來的值>"
```

```json
{"ok":true,"state":"ok","event_id":"…","user_id":"…","username":"…","display_name":"…","role":"user","via":"code","checked_in":true}
```

- 用 `user_id` 當你那邊資料的鍵。`401`（`unauthorized`／`session_invalid`）＝當成沒登入。
- 序號憑證綁活動：A 場的憑證打 B 場的 `/me` 一律 401。
- 後台登出／重設序號後，最多晚 20 秒才變成 401。
- 回應不含 token、序號、餘額。`mock` 環境的憑證是假的，打真的 `/me` 一律 401。

## 7. 環境限制（在 SWAG 裡跑一定會遇到）

- 不能用 `alert`／`confirm`／`prompt`（iframe 沙箱擋掉）：要確認就在頁面上放「確定」按鈕。
- 不能載外部 CDN（圖表、圖示自己畫 SVG）。
- 頁面放在 `events.swag.app` 底下（Moor 的 webview 白名單只認自家網域）。
- 給用戶看的字要短：一句話講完狀態。SDK 的 `message` 已經是短句，可以直接顯示。

# 線下活動工具箱 API v1：狀態代碼表（契約 v4.0）

> 從 `bff_main.py`（契約 v4.0，2026-10-15）的程式逐支讀出來的，不是照規格抄的。
> 改了 BFF 的任何一個 `state` 就要回來改這張表。

## 先看這三條

1. **業務結果看 body 的 `state`，不看 HTTP 狀態碼。** 有 `200` 但 `ok:false` 的情況（買券 `failed`／`pending`）。
   `200` 不等於做到了。
2. **`state` 不是全域唯一的意思**：`not_found` 在不同端點代表活動、商品、主播、品項、票券、API 路徑；
   `closed` 的 message 也因端點而異。判斷時要「端點＋state」一起看，給用戶看的文字用 `message`。
3. **會動錢的動作（purchase、spend）用前端產生的 `txn_id` 做冪等。** 結果不明時**用同一個 `txn_id` 重送**
   （已存在就回那筆的現況，不會再扣一次）；**不准換 `txn_id` 重送**（那等於再買一次）。

## 共通（每個用戶端點都可能回）

| HTTP | state | 意思 | 前端建議 |
|---|---|---|---|
| 401 | `unauthorized` | 沒帶 token，或 SWAG token 無效（`/me` 回 401／403）。**body 沒有 message** | 檢視器內：重新握手拿 token；直連：顯示序號登入 |
| 401 | `session_invalid` | 序號憑證失效：簽章錯、過期（活動結束 ＋ 24 小時，或沒設結束時間的 72 小時）、**憑證不是這場活動的**、被後台登出、序號被重設、被移出名單、同一個序號第 3 台裝置登入把最舊的踢掉 | 清掉本機憑證、回序號輸入畫面。message「請重新輸入序號」 |
| 503 | `unavailable` | 下游（`/me`、Firestore）暫時不通，**結果不明**。message 依來源不同 | 一般讀取：稍後重試。**purchase／spend：用同一個 `txn_id` 重送** |

`/v1` 路徑另外：

| HTTP | state | 意思 | 前端建議 |
|---|---|---|---|
| 503 | `sandbox_not_configured` | 只有 `/v1/test/…`：測試沙盒沒設定、指標壞掉，或指向的活動不是沙盒。**不會改用任何其他活動** | 顯示「測試環境還沒設定好」，聯絡活動工具箱管理者。重試沒有用 |
| 404 | `not_found` | 路徑打錯（message「沒有這個 API」） | 程式錯誤，開發時修 |
| 405 | `method_not_allowed` | 方法錯（例如用 GET 打 purchase）。回應有 `Allow` 標頭 | 程式錯誤，開發時修 |
| 500 | `internal_error` | 未處理的例外。**對 purchase 代表結果不明**（例外可能發生在扣鑽之後） | 跟 `unavailable` 一樣處理：purchase／spend 用同一個 `txn_id` 重送 |

⚠️ 舊路徑（`/event/<eid>/…`）的 404／405／500 是 Flask 預設的 **HTML 頁**，不是 JSON。SDK 只打 `/v1`。
⚠️ 請求在 Cloud Run **前面**就被擋掉時（例如網址有沒編碼的中文），回的也是 HTML 400，不會有 `state`。
所有參數（游標、序號、txn_id）一律 `encodeURIComponent`。

每個 `/v1` 回應都帶 `X-OET-Contract: v4.0` 標頭。

---

## bootstrap　`GET /v1/event/<eid>/bootstrap`、`GET /v1/test/bootstrap`

不看活動狀態（draft／ended 也會回 200），畫面依 `event.status` 自己畫。

| HTTP | state | 意思 | 前端建議 |
|---|---|---|---|
| 200 | `ok` | 正常 | 依下面的「畫面狀態」畫 |
| 404 | `not_found` | 活動不存在（message「活動不存在」） | 顯示活動不存在 |
| 401／503 | 共通 | 見上 | |
| 401 | `unauthorized` | 帶了 `?preview=` 但 token 不是 ADMIN_TOKEN | 同事頁面不要帶 `preview` |
| 400 | `bad_request` | `?preview=` 不是 user／creator | 同上 |

**畫面狀態（200 裡的欄位，不是 state，但前端一定要看）**

| 欄位 | 值 | 意思 |
|---|---|---|
| `event.status` | `draft`／`live`／`ended` | 伺服器判定的有效狀態（`ends_at` 過了就是 `ended`）。買、付、核銷、報到只在 `live` 能做 |
| `me.checked_in` | `false` | 還沒報到 → 先顯示「確認以 @xxx 身份參加」打 checkin |
| `me.on_roster` | `false` | **只有 `event.roster_only` 為 true 時才有這個 key**。不在名單，報到會被擋 |
| `event.entry_gate` | `true` 且未報到 | 要掃現場 QR 才能報到；這時 `products`、`creators`、`my_txns`、`balance` 都是空的 |
| `diamonds` | `null` | 鑽石餘額暫時讀不到（顯示「—」，不要顯示 0）。最多晚 90 秒 |
| `me.is_creator` | `true` | 這個人是本場主播：走主播畫面（feed、menu），`me.tally` 只有主播有 |

## login　`POST /v1/event/<eid>/login`、`POST /v1/test/login`

body `{code, device_id?, entry?}`，**不帶 Authorization**。依下表順序檢查，擋下就不往下做。

| HTTP | state | 意思 | 前端建議 |
|---|---|---|---|
| 404 | `not_found` | 活動不存在 | 顯示活動不存在 |
| 400 | `bad_request` | 序號不是 6 位數字（message「序號要是 6 位數字」） | 停在輸入畫面提示格式 |
| 503 | `misconfigured` | 伺服器設定不完整（ADMIN_TOKEN 沒設） | 顯示 message，找工作人員 |
| 429 | `rate_limited` | 同一個 IP 10 分鐘內錯 10 次，或整場 1 小時錯 300 次（整場暫停 10 分鐘）。有 `retry_after_sec` | 倒數 `retry_after_sec` 秒後才能再送 |
| 403 | `entry_required` | 只在 `entry_gate` 開著、活動還沒結束時：要帶有效的現場 QR 簽章（主播的序號不用） | 請用戶掃現場 QR。測試沙盒的 `entry_gate` 是關的 |
| 401 | `bad_code` | 序號不對（或已被重設／移除）。**會計一次失敗** | 停在輸入畫面「序號不對」。⚠️ 不是 `session_invalid`，不要清別的東西 |
| 409 | `closed` | 活動結束超過 24 小時（message「活動已結束」） | 顯示活動已結束 |
| 503 | `unavailable` | 失敗計數寫不進去／session 建不起來 | 稍後重試 |
| 200 | `ok` | `{session, role:"user"\|"creator", user:{user_id, username, display_name}}` | 把 `session` 存起來，之後 `Authorization: Bearer <session>`。回應 `Cache-Control: no-store` |

## checkin　`POST /v1/event/<eid>/checkin`、`POST /v1/test/checkin`

body `{fpid?, ua?, entry?, device_id?}`。順序：身份 → 活動 → live → 主播直接過 → 名單 → 入場簽章 → 寫入。

| HTTP | state | 意思 | 前端建議 |
|---|---|---|---|
| 404 | `not_found` | 活動不存在 | |
| 409 | `closed` | 活動不是 live（message「活動尚未開始或已結束」） | 依 `event.status` 顯示未開始／已結束 |
| 403 | `not_on_roster` | 名單限定、而且不在名單（message「你不在這場活動的名單內」） | 顯示 message，找工作人員。沒寫入任何東西 |
| 503 | `misconfigured` | 要驗入場簽章但伺服器沒有密鑰 | 找工作人員 |
| 403 | `entry_required` | 要掃現場 QR 但沒帶簽章 | 請用戶掃現場 QR |
| 403 | `entry_expired` | 簽章過期（5 分鐘）或不合法 | 請用戶重掃一次 |
| 200 | `ok` | 一般用戶：`{checked_in:true, first_time:bool}`（只有第一次 true）；主播：`{checked_in:true}`。可重打 | 進主畫面 |

已報到的人再打不會被名單或簽章擋（只擋還沒報到的人）。

## purchase（買券，扣鑽）　`POST /v1/event/<eid>/purchase`、`POST /v1/test/purchase`

body `{txn_id, product_id, qty}`。**價格以伺服器為準**。

| HTTP | state | ok | 意思 | 扣鑽了嗎 | 前端建議 |
|---|---|---|---|---|---|
| 400 | `bad_request` | false | 缺 `txn_id`／`product_id`，或 `qty` 不是正整數 | 沒有 | 程式錯誤 |
| 404 | `not_found` | false | 活動不存在，或商品不存在／已下架（看 message） | 沒有 | 重新整理商品 |
| 409 | `closed` | false | 活動不是 live | 沒有 | 顯示未開始／已結束 |
| 403 | `not_checked_in` | false | 還沒報到（message「請先確認進入活動」） | 沒有 | 先打 checkin |
| 409 | `misconfigured` | false | 商品沒設價格（message「商品未設定價格」）⚠️ 是 409 不是 503 | 沒有 | 找工作人員 |
| 400 | `too_large` | false | 單筆超過上限（預設 100000 鑽） | 沒有 | 減少數量 |
| 200 | （該筆現況）＋`resumed:true` | 依現況 | **同一個 `txn_id` 已經送過**：回那筆現在的狀態（`settled`／`failed`／`pending`），不再扣一次、不查餘額。⚠️ 沒有 `diamonds`、`balance` | 看現況 | 照現況那一列處理；重抓 bootstrap 更新餘額 |
| 409 | `txn_id_conflict` | false | （v4.0.1）`txn_id` 已經被**付券、別人、或後台發放**用過（message「這筆交易編號已經用過，請重新操作」）。只有本人的買券才算重送 | **沒有**（沒寫帳、沒打扣鑽） | 換**新的** `txn_id` 重新操作。正常用 SDK 不會遇到（每次都產生新 id） |
| 503 | `misconfigured` | false | 伺服器沒設扣鑽金鑰 | 沒有 | 找工作人員 |
| 503 | `balance_unavailable` | false | 讀不到鑽石餘額（message「暫時無法確認餘額，請稍後再試」） | **沒有**（保證沒寫帳、沒扣） | 可以重試（換不換 `txn_id` 都安全） |
| 409 | `insufficient_diamonds` | false | 鑽石不足，有 `need`（要多少）與 `have`（有多少） | 沒有 | 引導儲值（`OET.topup()`） |
| 503 | `unavailable` | false | 寫帳時 Firestore 狀態不明 | **不知道** | 用同一個 `txn_id` 重送查現況 |
| 200 | `failed` | **false** | 扣鑽 RPC 回失敗 | 沒有 | 顯示 message；要再買就用**新的** `txn_id` |
| 200 | `pending` | **false** | 扣鑽結果不明（RPC 逾時）。伺服器**不會自動重試**，這筆會一直停在 pending 等人工 | **不知道** | 「這筆交易還在處理中，請先不要重送，找現場工作人員確認。」**不要換 `txn_id` 重買** |
| 200 | `settled` | true | 成功：`{txn_id, granted:{<product_id>:qty}, balance:{<product_id>:張數}, diamonds:<推算的剩餘鑽石>}` | 扣了 | 更新畫面 |
| 500 | `internal_error`（/v1） | false | 未處理的例外，可能發生在扣鑽之後 | **不知道** | 用同一個 `txn_id` 重送查現況 |

## spend（付券給主播，產生待核銷票券）　`POST /v1/event/<eid>/spend`、`POST /v1/test/spend`

body `{txn_id, creator_id, menu_item_id}`。純 Firestore，不打外部 API。

| HTTP | state | ok | 意思 | 前端建議 |
|---|---|---|---|---|
| 400 | `bad_request` | false | 缺 `txn_id`／`creator_id`／`menu_item_id` | 程式錯誤 |
| 404 | `not_found` | false | 活動不存在／「這位創作者不在這場活動」／「品項不存在或已下架」（看 message） | 重新整理主播與菜單 |
| 409 | `closed` | false | 活動不是 live | 顯示未開始／已結束 |
| 403 | `not_checked_in` | false | 一般用戶還沒報到（主播不擋） | 先打 checkin |
| 409 | `insufficient` | false | 券不夠（message「券不夠（需要 N，剩 M）」）。⚠️ 跟買券的 `insufficient_diamonds` 是兩個不同的 state | 引導買券 |
| 200 | `settled`＋`resumed:true` | true | 同一個 `txn_id` 已經送過：`{message, redeem_state:<那張票現在的狀態>, balance}` | 當成功處理，不要再送 |
| 409 | `txn_id_conflict` | false | （v4.0.1）`txn_id` 已經被**買券、別人、或後台發放**用過（message「這筆交易編號已經用過，請重新操作」）。沒扣券、沒產生票券。只有本人的付券才算重送 | 換**新的** `txn_id` 重新操作 |
| 200 | `settled` | true | 成功：`{txn_id, redeem_state:"pending", balance}`。券已扣、票券待核銷，**還不是主播的收入** | 顯示票券，等主播核銷 |

## redeem（核銷票券）　`POST /v1/event/<eid>/redeem`、`POST /v1/test/redeem`

body `{txn_id}`（spend 那筆的 txn_id）。Bearer ＝ 票的主人；現場由主播在用戶手機上按。

| HTTP | state | 意思 | 前端建議 |
|---|---|---|---|
| 400 | `preview` | 帶了 `?preview=`（後台預覽不能核銷） | 同事頁面不要帶 preview |
| 400 | `bad_request` | 缺 `txn_id` | 程式錯誤 |
| 404 | `not_found` | 活動不存在，或「找不到這張票券」（不存在或不是付券那種交易） | 重新整理票券夾 |
| 409 | `closed` | 活動不是 live（message「活動已結束，無法核銷」）。例外：本人**已核銷**的票會回 200 resumed | 顯示已結束 |
| 403 | `forbidden` | 「這不是你的票券」 | 確認登入的是票的主人 |
| 200 | `redeemed`＋`resumed:true` | 已經核銷過（冪等）：`{txn_id, redeemed_at:<原本的時間>}`；很舊的票 `redeemed_at` 是 `""` | 當成功處理 |
| 200 | `redeemed` | 核銷成功：`{txn_id, redeemed_at}` | 顯示已核銷 |

## feed（主播收款，輪詢）　`GET /v1/event/<eid>/feed?since=<游標>&since_redeemed=<游標>`、`GET /v1/test/feed…`

| HTTP | state | 意思 | 前端建議 |
|---|---|---|---|
| 403 | `forbidden` | 不是這場的主播。**body 沒有 message**。⚠️ 活動不存在也是這個（不會回 404） | 不是主播就不要輪詢 |
| 200 | `ok` | `{items[], cursor, redeemed[], cursor_redeemed, tally}` | 下次帶回 `cursor`／`cursor_redeemed`（要 encode：裡面有 `+`） |

`since_redeemed` 參數不帶 → 不查已核銷通知；帶空字串 → 從頭查。

## wrapup（結束後畫面）　`GET /v1/event/<eid>/wrapup`、`GET /v1/test/wrapup`

| HTTP | state | 意思 | 前端建議 |
|---|---|---|---|
| 404 | `not_found` | 活動不存在 | |
| 409 | `not_ended` | 活動還沒結束（message「活動還沒結束」） | 還不顯示結束畫面 |
| 200 | `ok` | 主播：`{role:"creator", text, lines[], fees, subtotal, total, pending_qty}`；一般用戶：`{role:"user", title, blocks, purchased_qty, spent_qty, redeemed_qty, pending_qty, purchased_diamonds}` | 依 `role` 畫 |
| 401／400 | `unauthorized`／`bad_request` | 帶了 `?preview=` 但不是 ADMIN／值不對 | 同事頁面不要帶 preview |

讀取失敗會是 500／503，**不會**回一個假的 0。

## menu（主播改菜單）　`POST /v1/event/<eid>/menu`、`POST /v1/test/menu`

body `{menu:[{id?, name, product_id, qty, description?, active?}]}`，整份取代。

| HTTP | state | 意思 | 前端建議 |
|---|---|---|---|
| 403 | `forbidden` | 不是這場的主播。**body 沒有 message** | |
| 404 | `not_found` | 活動不存在 | |
| 409 | `closed` | 活動已結束（message「活動已結束」）。draft 可以改 | |
| 403 | `menu_locked` | 工作人員鎖了菜單（message「菜單已鎖定，請洽工作人員」） | 編輯按鈕變灰 |
| 400 | `bad_request` | `menu` 不是陣列 | 程式錯誤 |
| 200 | `ok` | `{menu:[…]}`：**實際存進去的**菜單 | ⚠️ 名稱空白、沒有 product_id、qty 不是正整數的品項會**被丟掉而且不報錯**，超過 50 個只存前 50。存完要拿回應的 `menu` 重畫，不要用自己送出去的那份 |

## me（身份查詢，新）　`GET /v1/event/<eid>/me`、`GET /v1/test/me`

給同事**自己的後端**用：把用戶的 `Authorization` 原封轉來，我們回這個人是誰。只有 `/v1` 路徑有。所有回應都 `Cache-Control: no-store`。

| HTTP | state | 意思 | 前端／同事後端建議 |
|---|---|---|---|
| 401 | `unauthorized` | 沒帶或 SWAG token 無效 | 當成未登入 |
| 401 | `session_invalid` | 序號憑證失效，或**憑證是別場活動的** | 當成未登入。⚠️ 被撤銷後，別台伺服器最多晚 20 秒才回 401 |
| 404 | `not_found` | 活動不存在 | |
| 200 | `ok` | `{event_id, user_id, username, display_name, role:"user"\|"creator", via:"swag"\|"code", checked_in}` | 用 `user_id` 當你那邊資料的鍵。**不回** token、序號、餘額、VIP 等級 |

不看活動狀態（draft／ended 也回 200）。

---

## 規則補充（從程式讀出來、規格沒寫的）

- **`txn_id` 在同一場活動裡要全域唯一，不能跨動作重用。** purchase 與 spend 的帳寫在同一個集合：
  拿一個買券用過的 `txn_id` 去付券，會回 `200 settled resumed:true`（「這筆已經送出過了」）**但其實沒付**；
  反過來拿付券的 `txn_id` 去買券，會回 `200 settled resumed:true`（「這筆已經完成了」）**但其實沒買**。
  付券用了買券的 id 時回應的 `redeem_state` 還會是 `"redeemed"`（看起來像已核銷）。
  SDK 每個動作都產生新的隨機 id（建議 `[A-Za-z0-9_-]`，16～64 字；**不要有 `/`**：Firestore 文件 id 不能有 `/`，
  預期會 500，這條沒在線上驗證過）。
- **（v4.0.1 起）上一條的「回成功但其實沒付／沒買」已修**：`txn_id` 已存在、但類型不是這個動作或不是本人的 →
  `409 txn_id_conflict`，什麼都沒做。`txn_id` 仍然要全域唯一，SDK 的前綴規則照舊。
- **`qty` 要送 JSON 整數。** `true` 會被當成 1 照買（回應的 `granted` 會是 `{"<id>": true}`）；`"1"`（字串）回 400。
- **body 要是 JSON 物件。** purchase、spend、menu 收到 JSON 陣列會 500（`/v1` 上是 `internal_error`）；checkin、login、redeem 會當成空物件。
- **SDK 自己的 `unknown`**（逾時重送一次仍失敗）不是 BFF 回的 state，這張表沒有它。
- 業務失敗（鑽石不足、未報到、序號錯…）全部是有 `state` 的 JSON，SDK 要 resolve 不要 reject。

## state 一覽（29 個）

`ok`、`unauthorized`、`session_invalid`、`unavailable`、`not_found`、`bad_request`、`misconfigured`、`rate_limited`、
`entry_required`、`bad_code`、`closed`、`not_on_roster`、`entry_expired`、`not_checked_in`、`too_large`、`settled`、
`failed`、`pending`、`balance_unavailable`、`insufficient_diamonds`、`insufficient`、`preview`、`forbidden`、`redeemed`、
`not_ended`、`menu_locked`、`sandbox_not_configured`（/v1/test）、`method_not_allowed`（/v1）、`internal_error`（/v1）。

v4.0.1 新增：`txn_id_conflict`（purchase、spend）。

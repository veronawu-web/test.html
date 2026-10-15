# 心動連線 FAN MEET — 工程交接（v16，2026-10-15）

> 給接手寫 code 的人（或 Claude Code）。先讀這份，再讀 `docs/` 的兩份定案文件，改任何對外文字前以定案為準。

## 0. 一句話

11/21 VIP 同樂會（主播實體見面會）的活動頁原型：Claude Design 匯出的單檔 React 原型，已加上 安心小窩／主播牧場／完整報名流程／我的活動中心，並接上「線下活動工具箱」OET SDK（`env=mock` 已跑通；`env=test` 沙盒尚未實測）。下一步是：在沙盒實測、做主播端頁面、把剩餘的本地模擬換成伺服器資料。

## 1. 檔案地圖

```
handoff/
├─ HANDOFF.md              ← 本文件
├─ build.py                ← 一鍵重建：python3 build.py → dist/
├─ src/
│  ├─ orig_v9.html         ← 原始 Claude Design 匯出（bundle；不要手改）
│  ├─ body_v9.html         ← 原始模板 body（build.py 從這裡切段落；行號硬編碼，見 §3）
│  ├─ *.html / *.css / *.js ← 各區塊的新增片段（見下表）
│  ├─ v15_patch.py, v16_patch.py ← 以 exec() 套用的補丁（字串替換）
├─ dist/
│  ├─ 心動連線 FAN MEET v16（離線版）.html ← 產出物（6.8MB，含字型與 SDK）
│  └─ template_unpacked.html ← 解開後的可讀模板＋完整邏輯（除錯用，直接搜這份最快）
├─ sdk/  oet-sdk.js, example.html, README.md, STATES.md
├─ tests/ paths.py（七條報名路徑）, oettest.py（mock 後端流程）, ranchtest.py, shot2.py
├─ tools/ unpack.py（把 bundle 解開成 manifest 資源）
└─ docs/ 11月場_用戶獎勵_定案與待定.md, 11月場_票種與簽名_定案與待定.md
```

| 片段 | 用途 |
|---|---|
| `hero.html` / `hero.css` | HERO：LED 應援燈牌「VIP 同樂會」、資訊列、CTA；`.mc` 會員卡樣式也在 hero.css |
| `member_card.html` / `member_methods.js` | 首頁會員卡三態（未登入／未報名／已報名）、購票時段標籤、會員權益收合 |
| `sec_sched.html` `sec_rewards.html` `sec_dates.html` / `new.css` / `new_methods.js` | 首頁下半：當天流程節目單、到場獎勵三層、重要日期、reveal 動態、展開收合 |
| `ranch.html` `ranch_sheets.html` `ranch_status.html` / `ranch.css` / `ranch_methods.js` | 主播牧場場景（已入住）、小屋／告示面板、未加入時的四種狀態卡；像素寵物散步引擎（den 也共用） |
| `flow.html` / `flow.css` / `flow_methods.js` | 安心小窩（den）、報名流程（reg：tier→form→review→done）、我的活動中心（tickets）、模擬登入／付款（OET 關閉時的退路） |
| `oet_*.html` / `oet_methods.js` / `v16_patch.py` | OET SDK 接線：序號登入、伺服器票種、確認進入活動、`OET.buy`、券餘額／票券夾、核銷 |
| `login_sheet.html` `dock_btn.html` `birth_done.html` `done_avatar.html` | 小片段：登入面板、寵物機底部「主播牧場」鈕、分身選完後的銜接、完成頁的分身邀請 |

## 2. 技術結構（必讀）

- **bundle 格式**：`orig_v9.html` 是 Claude Design 離線包。`<script type="__bundler/template">` 是 JSON 字串化的整頁模板（含 `<helmet>` 樣式、`<x-dc>` 畫面、`<script type="text/x-dc">` 元件邏輯）；`__bundler/manifest` 是資源表（gzip+base64）。開頁時 loader 解壓、把 uuid 換成 blob URL、用 DOMParser 重建文件。
  - ⚠️ 不能在聊天視窗的預覽面板開（blob script 被擋），要用 Chrome／Safari 直接開檔。
  - 模板語法：`{{ x }}` 綁定、`sc-if value="{{ bool }}"`、`sc-for list="{{ arr }}" as="x"`、`sc-camel-on-click="{{ fn }}"`、`sc-camel-on-change`、`ref="{{ setX }}"`、`class="{{ cls }}"`。動態值一律從元件 `renderVals()` 回傳的物件取。
  - 插值會包 `<span class="sc-interp">`，寫 CSS 時用 `.x>span` 而不是 `.x span`。
- **元件**：單一 `class Component extends DCLogic`（見 `dist/template_unpacked.html` 底部）。`renderVals()` 回傳 `Object.assign(extraVals, ranchVals, flowVals, memberVals, oetVals, {原本的值})`——**後面的物件會蓋前面的**，新增 key 時先全文搜避免撞名（已撞過 `payLabel`，改名成 `rgPayLabel`）。
- **狀態持久化**：`localStorage['fanmeet-v9']`；`load()`／`save()` 明確列出欄位，新增狀態要兩邊都加。
- **寵物機**：全域固定定位元素，由 `placeMachine()` 移到當前畫面的 `ref="{{ setSlot }}"` 槽；每個畫面**只能有一個** slot 在 DOM（兩個會壞掉）；`reg`／`tickets` 畫面沒有槽，改成 `visibility:hidden`。
- **build.py**：純字串替換（`rep1()` 要求目標字串恰好出現一次），順序敏感。`hero_old=sec(8,100)`、`mc_old=sec(134,152)`、下半部 `sec(179,325)` 都是 `body_v9.html` 的行號。
- 專案（SWAG 站內規範）的 iframe 握手／BFF 架構見 Project docs `31-frontend-iframe.md`；**本原型尚未做 `IFRAME_READY → SET_TOKEN` 握手**，目前身份走 OET SDK（它自己在 iframe 裡會跟父層握手）。

## 3. 畫面與狀態機

畫面 `state.screen`：`home` → `adopt`(測驗選分身) → `birth` → `machine`(寵物機) ／ `den`(安心小窩) ／ `ranch`(主播牧場) ／ `reg`(報名) ／ `tickets`(活動中心)。`shop` 已廢，`go('shop')` 轉 `reg`；`openSheet('ticket')` 轉 `tickets`。

報名 `state.reg.step`：`tier → form → review → done`。進 form 前要登入（`openLogin('form')` 登入後自動續）。`review` 的 `payState`：`null | insufficient | soldout | failed | confirming | unknown | needcheckin | closed`。

訂單 `state.order`：`{id, tier(basic|plus|vip|signed), productId?, productName?, status:'paid', total, name, email, travel, region, sign, ref, at}`；相容舊欄位 `state.purchase`（鑰匙圈掛機動畫、票券用）。

牧場 `ranchState()` 四態：`noTicket`（尚未符合票種）／`noInvite`・`pending`（邀約待確認）／`ok`（符合可加入）／`joined`。條件：已付款訂單 ＋ `state.ranchInvite.status==='verified'` ＋ 使用者按加入。**邀約來源 `ref`（網址／屬性 inviteRef A–E）只記錄，`verified` 目前靠「模擬：主播端驗證通過」按鈕**——正式版要接後端驗證。

OET 接線（`oet_methods.js`）：
- `oetInit()`：`?env=mock|test|live`（預設 mock）；`live` 另讀 `?event=<id>`，預設 `sandbox-bb52e7049989`。
- `auth` 事件 → `state.oetAuth`、`loggedIn`；ready 時 `OET.poll(state, 10s)`。
- `state` 事件 → `oetApply(d)`：存 `state.oet`、同步 `checkedIn=me.checked_in`、從 `my_txns` 的 settled purchase 推回 `order`（票種對應用商品名含「入場／心動／寵愛／簽名」或等於剛買的 productId）。
- 選票：`oetProducts()` 用伺服器 `products`（價格顯示 `price_diamonds`，不自己算）。
- 付款：`oetBuy(txnId?)` → `OET.buy(productId,1,{txnId})`；`insufficient_diamonds`→`OET.topup()`；`pending|unknown`→保留 txnId、「查詢結果」用同一 txnId；`failed`→新交易；`not_checked_in`→先按「確認進入活動」(`OET.checkin()`)。
- 活動中心：鑽石、券餘額（`balance`）、票券夾（spend 待核銷／已核銷）、`OET.redeem(txn_id)`、登出序號。
- `env=mock` 的測試鈕：下次扣鑽失敗／結果不明／鑽石歸零（走 `OET.mock.failNext`）。

## 4. 已確認（不要改）與待確認

來源：`docs/` 兩份定案。網站上凡標「待確認」者皆為未定案：鑰匙圈形式、簽名套票組數、拍立得券加購價、首次參加判定（依報到紀錄）、揪感心 15 名分配、儲值回饋 5% 細則、動物任務玩法與鑽石分配、徽章設計。券單價（Verona 10/15）：心動券 1,888、互動券 3,000、鐵粉券 5,000 鑽／張——**尚未寫進定案文件**。

原型裡**仍是本地模擬、正式版必須換掉**的東西：
1. 會員等級（OET `/me` 不回 VIP 等級）→ 報到鑽石級距、Lv.30/50 贈券、Lv.70 徽章、Lv.80 簽名勾選目前在 OET 模式全顯示「待確認」或以 lv=0 計算。需另一支 BFF（專案規範 `21-backend-bff-api.md`：用 `OET.auth.header()` 轉送到自家後端，後端打 `/v1/test/me` 驗身份後查 `level_info.level`）。
2. 首次參加、老朋友 50%、揪感心審核、簽名抽籤：全部待後端。
3. 牧場邀約驗證、寵物／小窩／牧場的養成資料：目前 localStorage；若要跨裝置要存自家後端（Firestore，鍵用 OET `/me` 的 `user_id`）。
4. 收藏兌換、到場獎勵核銷：票券頁的兩顆「模擬」按鈕是本地狀態；報到已接 `OET.checkin()`。
5. 鑽石餘額在 OET 模式用伺服器值（null 顯示「—」）；非 OET 模式是假的 8,000。
6. 「下一個節點」日期用開檔電腦時間。

## 5. 接下來要做（建議順序）

1. **沙盒實測**：開 `dist/…v16.html?env=test`，序號 507210（用戶）。確認：登入 → 票種列表（需先在工作人員後台建立四個票種商品，名稱要含「入場／心動套票／寵愛套票／簽名套票」字樣）→ 確認進入活動 → 購買（真的扣鑽）→ 活動中心看到券與 ADMIT ONE。重整後 session 應保留（沙盒會記帳）。
2. **主播端頁面（分開做）**：序號 473335。參考 `sdk/example.html` 第 8–9 節：`OET.creatorFeed` 3 秒輪詢（items／redeemed／tally）、`OET.menu()`＋`saveMenu()` 整份取代、`wrapup()`。沿用本專案色票（青綠 #00D2BE、銀、冰藍、暖白）與 `flow.css` 的卡片樣式。核銷動作在**用戶**手機的票券夾按（已做）。
3. **站內規範化**：若要嵌進 SWAG 主站而非走 OET 序號：補 `IFRAME_READY → SET_TOKEN` 握手、`const API_BASE`、PWA 導航攔截、Dev Mode 橫幅、Skeleton；並把 `tokenWhitelistDomains`／`allowURL` 白名單加上頁面網域。
4. **自家 BFF**：等級與資格查詢（見 §4-1）。
5. **把定案文件補上券單價**，並決定 §4 的待確認項。

## 6. 測試

```
pip install playwright && python -m playwright install chromium
python3 build.py                 # 產出 dist/
python3 tests/paths.py           # 七條路徑（OET 關閉＝本地模擬流程）
python3 tests/oettest.py         # ?env=mock 走 SDK：登入→選票→確認進入→購買→票券
python3 tests/ranchtest.py       # 牧場互動
python3 tests/shot2.py           # 全頁截圖＋無殘留 {{ }}
```
測試用 `add_init_script` 在頁面腳本前灌 `localStorage`（頁面每次 setState 都會 `save()`，事後灌會被蓋掉）。

### 七條路徑（paths.py，v15 全過）
1 未登入無分身→登入購票→票券；2 有分身未報名→從小窩購票→回原分身；3 購票無邀約；4 符合資格暫不加入→保留邀請；5 驗證後加入→同一隻寵物；6 餘額不足／售罄／失敗→保留重試；7 中途重整→接續不重複建單。

## 7. 已知限制／坑

- v16.1：`v15_patch.py` 的會員卡區段原本切到 134–152 行，漏掉 153 行外層 `</div>`，主容器提早關閉，報名／小窩／活動中心上方多出一整屏空白；已改成 134–153。
- `componentDidUpdate(pp, ps)` 偶發 `ps` 為 undefined（原型本身），已加 `if (!ps) return;`。
- 全頁截圖會把關閉的底部面板（translateY 105%）拍進來，不是 bug。
- 字型 `IBM Plex Mono` 走 manifest 內嵌；中文字型是系統字。
- `dist/*.html` 6.8MB，主因是字型與 React 內嵌；正式站請改成外部靜態資源。
- 沙盒 CORS：`test` 環境允許 `localhost`／`127.0.0.1`，`file://` 直接開是否能打沙盒未驗證——不行就 `python3 -m http.server` 起本機再開。

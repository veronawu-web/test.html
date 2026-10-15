# v16: OET SDK integration (executed inside build)
import base64, gzip, json as _json, uuid as _uuid
sdk=open(os.path.join(os.path.dirname(S.rstrip(os.sep)),'sdk','oet-sdk.js'),'rb').read()
SDK_UUID='5e1f1f5a-0e7d-4c1e-9b1a-0e7a0e7a0e7a'
# head script tag after the main bundle script
tpl=rep1(tpl,'<script src="19d9244e-6130-4b82-b4f5-f30f50afaf83"></script>','<script src="19d9244e-6130-4b82-b4f5-f30f50afaf83"></script>\n<script src="'+SDK_UUID+'"></script>')
# methods
tpl=rep1(tpl,"  renderVals() {\n", open(S+'oet_methods.js',encoding='utf-8').read()+"  renderVals() {\n")
tpl=rep1(tpl,"this.memberVals(M, s, pet), {\n      quizOpen:", "this.memberVals(M, s, pet), this.oetVals(M, s, pet), {\n      quizOpen:")
# member(): OET identity
tpl=rep1(tpl,"  member() {\n    const a = this.account();","  member() {\n    if (this.oetOn()) { const d = this.state.oet || {}, me = d.me || {}; const ready = this.state.oetAuth === 'ready'; const nm = me.display_name || (me.username ? '@' + me.username : '會員'); return ready ? { lv: 0, vip: false, label: me.is_creator ? '主播' : '會員', name: nm, loggedIn: true, acc: { hasAcc: true, lv: 0, vip: false, label: '會員', name: nm } } : { lv: 0, vip: false, label: '未登入', name: '訪客', loggedIn: false, acc: { hasAcc: true, lv: 0, vip: false, label: '會員', name: '會員' } }; }\n    const a = this.account();")
# mount
tpl=rep1(tpl,"    if (this.sceneOn()) this.startRanch();","    if (this.sceneOn()) this.startRanch();\n    this.oetInit();")
# login sheet: OET branch + wrap mock branch
tpl=rep1(tpl,'    <sc-if value="{{ sheetLogin }}" hint-placeholder-val="{{ false }}">\n      <b style="font-size:18px;">登入 SWAG 帳號</b>', open(S+'oet_login.html',encoding='utf-8').read()+'      <b style="font-size:18px;">登入 SWAG 帳號</b>')
tpl=rep1(tpl,'>以此帳號登入（模擬）</button>\n      <button type="button" sc-camel-on-click="{{ closeSheet }}" style="margin-top:8px; width:100%; height:44px; border-radius:14px; border:1px solid #E4E3DC; background:#fff; font-family:inherit; font-size:14px; font-weight:700; color:#292322; cursor:pointer;">稍後再說</button>\n    </sc-if>', '>以此帳號登入（模擬）</button>\n      <button type="button" sc-camel-on-click="{{ closeSheet }}" style="margin-top:8px; width:100%; height:44px; border-radius:14px; border:1px solid #E4E3DC; background:#fff; font-family:inherit; font-size:14px; font-weight:700; color:#292322; cursor:pointer;">稍後再說</button>\n      </div>\n    </sc-if>')
# openLogin: when OET says need_code, same sheet
# step 1 tiers: product list when OET on
tpl=rep1(tpl,'    <div class="fl-tiers">\n      <sc-for list="{{ regTiers }}"', open(S+'oet_tiers.html',encoding='utf-8').read()+'    <div class="fl-tiers" style="display:{{ mockTiersShow }};">\n      <sc-for list="{{ regTiers }}"')
# review: OET pay block before mock pay block; mock pay block toggled
tpl=rep1(tpl,'    <div class="fl-pay">\n      <div class="fl-pay-r"><span>應付鑽石</span>', open(S+'oet_review.html',encoding='utf-8').read()+'    <div class="fl-pay" style="display:{{ mockPayShow }};">\n      <div class="fl-pay-r"><span>應付鑽石</span>')
# tickets: OET card after the pass
tpl=rep1(tpl,'    <div class="fl-card">\n      <div class="fl-card-t">報到與核銷（分開記錄）</div>', open(S+'oet_tickets.html',encoding='utf-8').read()+'    <div class="fl-card">\n      <div class="fl-card-t">報到與核銷（分開記錄）</div>')
tpl=rep1(tpl,'<button type="button" class="fl-ghost sm" sc-camel-on-click="{{ simCheckIn }}" disabled="{{ ciDone }}">模擬現場掃碼報到</button>','<button type="button" class="fl-ghost sm" sc-camel-on-click="{{ simCheckIn }}" disabled="{{ ciDone }}">{{ ciBtnLabel }}</button>')
# flowVals tier resolution for OET product ids
tpl=rep1(tpl,"    const tier = r.tier ? this.TIERS.find(x => x.id === r.tier) : null;\n    const price = tier ? this.PRICE[tier.id] : 0;",
 "    let tier = r.tier ? this.TIERS.find(x => x.id === r.tier) : null;\n    if (!tier && r.tier && this.oetOn()) { const pp = this.oetProducts().find(x => x.id === r.tier); if (pp) tier = { id: pp.key || 'basic', name: pp.name, price: pp.price, limited: pp.limited, charm: pp.charm, priceNum: pp.priceNum }; }\n    const price = tier ? (tier.priceNum != null ? tier.priceNum : this.PRICE[tier.id]) : 0;")
tpl=rep1(tpl,"      regPay: () => this.regPay(),","      regPay: () => (this.oetOn() ? this.oetBuy(null) : this.regPay()), oetPayShow: this.oetOn() ? 'flex' : 'none', mockPayShow: this.oetOn() ? 'none' : 'flex', oetTiersShow: this.oetOn() ? 'flex' : 'none', mockTiersShow: this.oetOn() ? 'none' : 'flex', oetLoginShow: this.oetOn() ? 'flex' : 'none', mockLoginShow: this.oetOn() ? 'none' : 'flex', oetCardShow: this.oetOn() && paid ? 'flex' : 'none', ciBtnLabel: this.oetOn() ? '確認進入活動（報到）' : '模擬現場掃碼報到',")
tpl=rep1(tpl,"orderStatusText: paid ? '已付款（模擬）' : '未付款',","orderStatusText: paid ? (this.oetOn() ? '已付款（' + ({ mock: '模擬後端', test: '測試沙盒', live: '正式' }[this.oetEnv] || '') + '）' : '已付款（模擬）') : '未付款',")
tpl=rep1(tpl,"simCheckIn: () => this.setState({ checkedIn: true }),","simCheckIn: () => (this.oetOn() ? this.oetCheckin() : this.setState({ checkedIn: true })),")
# login hint lines in reg step1 & member card: open OET login when on
tpl=rep1(tpl,"      navAcct: () => { if (M.loggedIn) this.go('tickets'); else this.openLogin(null); }, navAcctLabel: M.loggedIn ? M.label : '登入',","      navAcct: () => { if (M.loggedIn) this.go('tickets'); else this.openLogin(null); }, navAcctLabel: M.loggedIn ? (this.oetOn() ? M.name : M.label) : '登入',")
# insufficient state for OET uses payState 'insufficient' too (insufShow already bound)
tpl=rep1(tpl,"      insufShow: ps === 'insufficient' ? 'flex' : 'none',","      insufShow: ps === 'insufficient' ? 'flex' : 'none', payFailShow2: ps === 'failed' ? 'flex' : 'none',")
# manifest entry for SDK
MAN=globals().get('EXTRA_MANIFEST', {})
MAN[SDK_UUID]={'mime':'text/javascript','compressed':True,'data':base64.b64encode(gzip.compress(sdk)).decode()}
globals()['EXTRA_MANIFEST']=MAN

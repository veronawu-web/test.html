  // ===== v16: OET SDK adapter（線下活動工具箱）=====
  TIER_KEYS = [['簽名', 'signed'], ['寵愛', 'vip'], ['心動', 'plus'], ['入場', 'basic']];
  oetOn() { return !!(window.OET && this.oetEnv); }
  oetInit() {
    if (!window.OET) return;
    let env = (location.search.match(/[?&]env=(test|mock|live)/) || [])[1];
    const eventId = (location.search.match(/[?&]event=([A-Za-z0-9_-]+)/) || [])[1] || 'sandbox-bb52e7049989';
    if (!env) env = 'mock';
    this.oetEnv = env;
    try { OET.init(env === 'live' ? { env: 'live', eventId } : { env }); } catch (e) { this.oetEnv = null; return; }
    OET.on('auth', a => {
      this.setState({ oetAuth: a.state, oetVia: a.via, oetReason: a.reason, loggedIn: a.state === 'ready' });
      if (this.oetPoller) { this.oetPoller.stop(); this.oetPoller = null; }
      if (a.state === 'ready') { this.oetPoller = OET.poll(() => OET.state(), 10000); }
      else { this.setState({ oet: null, oetLoginMsg: a.reason === 'session_invalid' ? '請重新輸入序號' : '' }); }
    });
    OET.on('state', d => this.oetApply(d));
    this.setState({ oetAuth: OET.auth.state(), oetVia: OET.auth.via(), loggedIn: OET.auth.state() === 'ready' });
  }
  tierKeyOf(p) { const n = (p && p.name) || ''; for (const [k, id] of this.TIER_KEYS) if (n.indexOf(k) >= 0) return id; return null; }
  oetApply(d) {
    const me = d.me || {};
    const rows = (d.my_txns || []).filter(t => t.type === 'purchase' && t.state === 'settled');
    const products = d.products || [];
    const tk = pid => this.tierKeyOf(products.find(p => p.id === pid) || { name: (rows.find(r => r.product_id === pid) || {}).product_name });
    const cur0 = this.state.order;
    const tix = rows.filter(r => tk(r.product_id) || (cur0 && cur0.productId === r.product_id));
    const upd = { oet: d, checkedIn: !!me.checked_in };
    if (tix.length) {
      const r = (cur0 && tix.find(x => x.txn_id === cur0.id)) || tix[0];
      const key = tk(r.product_id) || 'basic';
      const cur = this.state.order;
      if (!cur || cur.id !== r.txn_id) {
        upd.order = { id: r.txn_id, tier: key, productId: r.product_id, productName: r.product_name, status: 'paid', total: r.diamonds || 0, name: (cur && cur.name) || me.display_name || me.username || '', email: (cur && cur.email) || '', travel: !!(cur && cur.travel), region: (cur && cur.region) || '', sign: !!(cur && cur.sign), ref: (cur && cur.ref) || this.ref() || null, at: Date.parse(r.created_at) || Date.now() };
        upd.purchase = { tier: key, sid: null, sids: null, serials: {}, serial: '', orderId: r.txn_id, ref: upd.order.ref };
        if (upd.order.ref && !this.state.ranchInvite) upd.ranchInvite = { ref: upd.order.ref, status: 'pending' };
      }
    } else if (this.state.order && this.state.order.productId) {
      upd.order = null; upd.purchase = null;
    }
    this.setState(upd);
  }
  oetLogin(code) {
    if (!window.OET) return;
    this.setState({ oetLoginBusy: true, oetLoginMsg: '' });
    OET.auth.login(code).then(r => {
      let m = '';
      if (!r.ok) { m = r.message || '登入失敗'; if (r.state === 'rate_limited' && r.data && r.data.retry_after_sec) m = '嘗試太多次，請 ' + Math.ceil(r.data.retry_after_sec / 60) + ' 分鐘後再試';
        // 模擬後端只認 123456／654321；工作人員給的沙盒序號要在網址加 ?env=test
        else if (r.state === 'bad_code' && this.oetEnv === 'mock') m = '目前是模擬後端，只接受測試序號 123456。工作人員給的沙盒序號請在網址加上 ?env=test 再登入';
        else if (r.state === 'network' && this.oetEnv !== 'mock') m = '連不到活動伺服器。若是從 github.io 等未被允許的網域開啟，伺服器會拒絕連線，請改用 localhost 開啟或請後端加白名單'; }
      this.setState({ oetLoginBusy: false, oetLoginMsg: m, oetCode: r.ok ? '' : this.state.oetCode });
      if (r.ok) {
        const rr = this.state.reg || this.regDefault();
        const patch = { name: rr.name || this.member().name, email: rr.email };
        if (this.pendingAfterLogin) { patch.step = this.pendingAfterLogin; this.pendingAfterLogin = null; }
        this.setState({ reg: Object.assign({}, rr, patch), sheetOpen: false });
      }
    });
  }
  oetLogout() { if (window.OET) OET.auth.logout(); this.setState({ order: null, purchase: null, reg: null, ranchInvite: null, ranch: null }); this.go('home'); }
  oetCheckin() {
    if (!window.OET) return;
    this.setState({ oetBusy: true, oetMsg: '' });
    OET.checkin().then(r => { this.setState({ oetBusy: false, oetMsg: r.ok ? '' : (r.message || '報到失敗') }); });
  }
  oetProducts() {
    const d = this.state.oet; if (!d) return [];
    return (d.products || []).filter(p => p.active !== false).map(p => {
      const key = this.tierKeyOf(p), t = key ? this.TIERS.find(x => x.id === key) : null;
      return { id: p.id, key, name: p.name, price: (typeof p.price_diamonds === 'number' ? p.price_diamonds.toLocaleString() : '—') + ' 鑽', priceNum: p.price_diamonds, perks: t ? t.perks : (p.description || '依後台設定'), charm: t ? t.charm : '—', limitText: t ? t.limitText : '', limited: !!(t && t.limited) };
    });
  }
  oetBuy(txnId) {
    const s = this.state, r = s.reg; if (!r || s.paying || !window.OET) return;
    const p = this.oetProducts().find(x => x.id === r.tier); if (!p) return;
    this.setState({ paying: true, reg: Object.assign({}, r, { payState: 'confirming', payMsg: '' }) });
    OET.buy(p.id, 1, txnId ? { txnId } : undefined).then(res => {
      const rr = this.state.reg || r;
      if (res.ok) {
        const key = p.key || 'basic';
        const order = { id: res.txnId, tier: key, productId: p.id, productName: p.name, status: 'paid', total: p.priceNum || 0, name: rr.name.trim(), email: rr.email.trim(), travel: rr.travel, region: rr.region, sign: rr.sign, ref: rr.ref || null, at: Date.now() };
        const purchase = { tier: key, sid: null, sids: null, serials: {}, serial: '', orderId: res.txnId, ref: rr.ref || null };
        const ranchInvite = rr.ref ? { ref: rr.ref, status: 'pending' } : null;
        this.setState({ paying: false, order, purchase, ranchInvite, attachPending: !!this.state.pet, justDone: true, reg: Object.assign({}, rr, { step: 'done', payState: null, payMsg: '', txnId: null }) });
        try { window.scrollTo(0, 0); } catch (e) {}
        return;
      }
      let ps = 'failed', msg = res.message || '付款未完成';
      if (res.state === 'insufficient_diamonds') { ps = 'insufficient'; msg = '鑽石不足（需要 ' + (res.data.need != null ? res.data.need.toLocaleString() : '—') + '，目前 ' + (res.data.have != null ? res.data.have.toLocaleString() : '—') + '）'; }
      else if (res.state === 'pending' || res.state === 'unknown') { ps = 'unknown'; }
      else if (res.state === 'not_checked_in') { ps = 'needcheckin'; }
      else if (res.state === 'not_found') { ps = 'soldout'; }
      else if (res.state === 'closed') { ps = 'closed'; }
      this.setState({ paying: false, reg: Object.assign({}, rr, { payState: ps, payMsg: msg, txnId: res.txnId || rr.txnId || null }) });
    });
  }
  oetTopup() { if (!window.OET) return; OET.topup().then(r => { if (r.state === 'popup_blocked' && r.data && r.data.url) this.setState({ oetTopupUrl: r.data.url }); }); }
  oetRedeem(txnId) { if (!window.OET) return; this.setState({ oetBusy: true }); OET.redeem(txnId).then(r => this.setState({ oetBusy: false, oetMsg: r.ok ? '核銷完成' : (r.message || '核銷失敗') })); }
  oetVals(M, s, pet) {
    const on = this.oetOn(), d = s.oet || {}, me = d.me || {}, ev = d.event || {};
    const r = s.reg || this.regDefault();
    const products = on ? this.oetProducts() : [];
    const sel = products.find(p => p.id === r.tier) || null;
    const bal = d.balance || {}, names = {}; (d.products || []).forEach(p => { names[p.id] = p.name; });
    const balRows = Object.keys(bal).map(k => ({ name: names[k] || k, qty: bal[k] }));
    const pendingTix = (d.my_txns || []).filter(t => t.type === 'spend' && t.state === 'settled' && t.redeem_state === 'pending');
    const redeemedTix = (d.my_txns || []).filter(t => t.type === 'spend' && t.state === 'settled' && t.redeem_state === 'redeemed');
    const envLabel = { mock: '模擬後端', test: '測試沙盒', live: '正式' }[this.oetEnv] || '';
    const ps = r.payState;
    return {
      oetOn: on, oetOff: !on, oetEnvLabel: envLabel, oetEnvShow: on ? 'inline-flex' : 'none',
      oetAuthLabel: s.oetAuth === 'pending' ? '連線中' : (s.oetAuth === 'ready' ? (s.oetVia === 'code' ? '序號登入' : 'SWAG 身份') : '未登入'),
      oetCode: s.oetCode || '', onOetCode: ev2 => this.setState({ oetCode: ev2.target.value.replace(/[^0-9０-９ ]/g, '').slice(0, 8) }), oetLoginMsg: s.oetLoginMsg || '', oetLoginBusy: !!s.oetLoginBusy,
      oetDoLogin: () => this.oetLogin(s.oetCode || ''), oetLoginDis: !!s.oetLoginBusy || !(s.oetCode || '').replace(/\D/g, '').length, oetLoginBg: s.oetLoginBusy ? '#BDBCB4' : '#292322',
      oetLogout: () => this.oetLogout(),
      oetEventName: ev.name || '', oetEventStatus: ev.status === 'live' ? '進行中' : ev.status === 'ended' ? '已結束' : (ev.status ? '未開始' : ''),
      oetWho: me.display_name || (me.username ? '@' + me.username : ''), oetIsCreator: !!me.is_creator,
      oetDiamonds: typeof d.diamonds === 'number' ? d.diamonds.toLocaleString() + ' 鑽' : '—',
      oetNeedCheckin: on && me.checked_in === false, oetCheckedIn: on && me.checked_in === true, oetCheckinShow: on && me.checked_in === false ? 'flex' : 'none',
      oetCheckin: () => this.oetCheckin(), oetBusy: !!s.oetBusy, oetMsg: s.oetMsg || '',
      oetProducts: products.map(p => ({ id: p.id, name: p.name, price: p.price, perks: p.perks, charm: p.charm, limit: p.limitText, checked: r.tier === p.id ? 'true' : 'false', border: r.tier === p.id ? '2px solid #00D2BE' : '1px solid #E4E3DC', onPick: () => this.regSet({ tier: p.id, payState: null, payMsg: '' }) })),
      oetNoProductsShow: on && s.oet && !products.length ? 'block' : 'none', oetNeedLoginShow: on && !s.oet ? 'flex' : 'none',
      oetSelName: sel ? sel.name : '—', oetSelPrice: sel ? sel.price : '—',
      oetBuy: () => this.oetBuy(null), oetBuyAgain: () => this.oetBuy(r.txnId), oetTxnId: r.txnId || '',
      oetPayMsg: r.payMsg || '', oetUnknownShow: ps === 'unknown' ? 'flex' : 'none', oetNeedCheckinShow: ps === 'needcheckin' ? 'flex' : 'none', oetClosedShow: ps === 'closed' ? 'flex' : 'none',
      oetPayDis: !!s.paying || !sel || me.checked_in === false, oetPayBg: s.paying || !sel || me.checked_in === false ? '#BDBCB4' : '#172038',
      oetPayLabel: s.paying ? '確認付款結果中…' : (ps === 'failed' ? '重新購買（新交易）' : sel ? `以鑽石購買 ${sel.price}` : '請先選擇票種'),
      oetTopup: () => this.oetTopup(), oetTopupUrl: s.oetTopupUrl || '', oetTopupUrlShow: s.oetTopupUrl ? 'inline' : 'none',
      oetBalRows: balRows, oetBalEmptyShow: balRows.length ? 'none' : 'block',
      oetPendingTix: pendingTix.map(t => ({ id: t.txn_id, name: (t.menu_item_name || '') + ' → ' + (t.creator_name || '主播'), sub: t.qty + ' 張' + (t.product_name || ''), onRedeem: () => this.oetRedeem(t.txn_id) })),
      oetRedeemedTix: redeemedTix.map(t => ({ id: t.txn_id, name: (t.menu_item_name || '') + ' → ' + (t.creator_name || '主播'), sub: t.qty + ' 張' + (t.product_name || '') + '・已核銷' })),
      oetTixEmptyShow: pendingTix.length || redeemedTix.length ? 'none' : 'block',
      mockShow: this.oetEnv === 'mock' ? 'flex' : 'none',
      mockFail: () => { if (window.OET && OET.mock) OET.mock.failNext('buy', 'rpc_failed'); this.setState({ oetMsg: '下一次購買會模擬扣鑽失敗' }); },
      mockUnknown: () => { if (window.OET && OET.mock) { OET.mock.failNext('buy', 'timeout'); OET.mock.failNext('buy', 'timeout'); } this.setState({ oetMsg: '下一次購買會模擬結果不明' }); },
      mockPoor: () => { if (window.OET && OET.mock) OET.mock.setDiamonds(0); this.setState({ oetMsg: '鑽石已設為 0（重抓後生效）' }); OET.state(); }
    };
  }

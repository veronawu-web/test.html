  // ===== v14: login / registration / tickets / den / ranch states =====
  PRICE = { basic: 500, plus: 1500, vip: 5000, signed: 45000 };
  INCL = {
    basic: '報到鑽石、現場餐點、舞台活動、抽獎、Hi-Five 送客；收藏：入場紀念圈。',
    plus: '入場票內容＋互動時間（心動券 ×1）、餐飲茶點；收藏：心動相框圈。',
    vip: '入場票內容＋寵愛套票座位區＋互動時間（拍立得券 ×1）、餐飲茶點；收藏：寵愛琺瑯圈。',
    signed: '本身即可入場＋全員主播簽名會＋Lv.80 同等福利（線下動態徽章、抽訂製徽章、送券 2 張）；收藏：簽名款鑰匙圈。'
  };
  account() {
    const m = this.props.member || 'VIP Lv.45';
    const hasAcc = m !== '未登入';
    const lv = hasAcc ? parseInt((m.match(/Lv\.(\d+)/) || [0, 12])[1], 10) : 0;
    return { hasAcc, lv, vip: lv >= 40, label: hasAcc ? 'Lv.' + lv + (lv >= 40 ? ' VIP' : '') : '未登入', name: this.props.memberName || '小安' };
  }
  member() {
    const a = this.account();
    if (!(this.state.loggedIn && a.hasAcc)) return { lv: 0, vip: false, label: '未登入', name: '訪客', loggedIn: false, acc: a };
    return { lv: a.lv, vip: a.vip, label: a.label, name: a.name, loggedIn: true, acc: a };
  }
  regDefault() { return { step: 'tier', tier: null, name: '', email: '', agree: false, travel: false, region: '', sign: false, simFail: false, ref: this.ref(), err: {}, payState: null }; }
  regSet(patch) { this.setState({ reg: Object.assign({}, this.state.reg || this.regDefault(), patch) }); }
  doLogin() {
    const a = this.account(); if (!a.hasAcc) return;
    const r = this.state.reg || this.regDefault();
    const patch = { name: r.name || a.name, email: r.email || (a.name + '@mail.example') };
    if (this.pendingAfterLogin) { patch.step = this.pendingAfterLogin; this.pendingAfterLogin = null; }
    this.setState({ loggedIn: true, reg: Object.assign({}, r, patch), sheetOpen: false, msg: '' });
  }
  openLogin(after) { this.pendingAfterLogin = after || null; this.openSheet('login'); }
  regNext1() {
    const r = this.state.reg || this.regDefault(); if (!r.tier) return;
    if (!this.member().loggedIn) { this.openLogin('form'); return; }
    const a = this.account();
    this.regSet({ step: 'form', payState: null, name: r.name || a.name, email: r.email || (a.name + '@mail.example') });
  }
  regValidate(r) {
    const err = {};
    if (!r.name.trim()) err.name = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) err.email = true;
    if (r.travel && !r.region) err.region = true;
    if (!r.agree) err.agree = true;
    return err;
  }
  regNext2() {
    const r = this.state.reg || this.regDefault();
    const err = this.regValidate(r);
    if (Object.keys(err).length) { this.regSet({ err }); return; }
    this.regSet({ err: {}, step: 'review', payState: null });
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  regPay() {
    const s = this.state, r = s.reg; if (!r || s.paying || s.order) return;
    const t = this.TIERS.find(x => x.id === r.tier); if (!t) return;
    const price = this.PRICE[t.id];
    if (t.limited && s.stock.ALL <= 0) { this.regSet({ payState: 'soldout' }); return; }
    if (s.balance < price) { this.regSet({ payState: 'insufficient' }); return; }
    this.setState({ paying: true, reg: Object.assign({}, r, { payState: 'confirming' }) });
    this.later(() => {
      const st = this.state, rr = st.reg;
      if (rr.simFail) { this.setState({ paying: false, reg: Object.assign({}, rr, { payState: 'failed' }) }); return; }
      const stock = Object.assign({}, st.stock); let serial = '';
      if (t.limited) { stock.ALL -= 1; serial = String(10 - stock.ALL).padStart(2, '0') + '/10'; }
      const id = 'OD-' + (100000 + Math.floor(Math.random() * 900000));
      const order = { id, tier: t.id, status: 'paid', total: price, name: rr.name.trim(), email: rr.email.trim(), travel: rr.travel, region: rr.region, sign: rr.sign, ref: rr.ref || null, at: Date.now() };
      const purchase = { tier: t.id, sid: null, sids: null, serials: {}, serial, orderId: id, ref: rr.ref || null };
      const ranchInvite = rr.ref ? { ref: rr.ref, status: 'pending' } : null;
      this.setState({ paying: false, stock, balance: st.balance - price, order, purchase, ranchInvite, attachPending: !!st.pet, justDone: true, reg: Object.assign({}, rr, { step: 'done', payState: null }) });
      try { window.scrollTo(0, 0); } catch (e) {}
    }, 1400);
  }
  topUp() { this.setState({ balance: (this.state.balance || 0) + 50000 }); this.regSet({ payState: null }); }
  simVerify() { const inv = this.state.ranchInvite; if (!inv) return; this.setState({ ranchInvite: Object.assign({}, inv, { status: 'verified' }) }); }
  ranchState(M, s, pet) {
    const okC = ['#DDF7F3', '#00665C'], tbdC = ['#EEEDE6', '#5E5653'], drawC = ['#FFF0D6', '#8A5A00'];
    const paid = !!(s.order && s.order.status === 'paid'), inv = s.ranchInvite;
    const pn = pet ? pet.name : '你的寵物';
    if (s.ranch) return { key: 'joined', label: '已加入', short: '已加入', sub: `${pn}住在主播 ${s.ranch} 的牧場，可隨時回安心小窩。`, c: okC };
    if (!paid) return { key: 'noTicket', label: '尚未符合票種', short: '未符合', sub: '需先完成任一票種報名並付款；票種本身不保證可加入牧場，還需主播邀約。', c: tbdC };
    if (!inv) return { key: 'noInvite', label: '邀約待確認', short: '尚無邀約', sub: '目前沒有邀約來源。由主播專屬連結購票才會產生邀約，驗證狀態會顯示在這裡。', c: tbdC };
    if (inv.status !== 'verified') return { key: 'pending', label: '邀約待確認', short: '驗證中', sub: `來自主播 ${inv.ref} 的邀約已記錄，等待平台驗證。來源標記只記錄來源，不等於驗證成功。`, c: drawC };
    return { key: 'ok', label: '符合資格，可選擇加入', short: '可加入', sub: `主播 ${inv.ref} 的邀約已驗證。是否加入由你決定；不加入也不影響安心小窩與票券權益。`, c: okC };
  }
  flowVals(M, s, pet, scr) {
    const a = M.acc || this.account();
    const r = s.reg || this.regDefault();
    const tier = r.tier ? this.TIERS.find(x => x.id === r.tier) : null;
    const price = tier ? this.PRICE[tier.id] : 0;
    const order = s.order, oTier = order ? this.TIERS.find(x => x.id === order.tier) : null;
    const paid = !!(order && order.status === 'paid');
    const rs = this.ranchState(M, s, pet);
    const okC = ['#DDF7F3', '#00665C'], tbdC = ['#EEEDE6', '#5E5653'], drawC = ['#FFF0D6', '#8A5A00'];
    const step = paid ? 'done' : r.step;
    const stepIdx = { tier: 1, form: 2, review: 3, done: 4 }[step] || 1;
    const stepVals = {};
    [1, 2, 3, 4].forEach(i => { const on = i === stepIdx, done = i < stepIdx; stepVals['st' + i + 'c'] = on || done ? '#172038' : '#9A9690'; stepVals['st' + i + 'b'] = on ? '#172038' : (done ? '#DDF7F3' : '#ECECE5'); stepVals['st' + i + 'f'] = on ? '#5CF5E2' : (done ? '#00665C' : '#9A9690'); });
    const errList = [];
    if (r.err.name) errList.push('報到暱稱'); if (r.err.email) errList.push('電子郵件'); if (r.err.region) errList.push('出發地區'); if (r.err.agree) errList.push('同意活動須知');
    const soldOut = !!(tier && tier.limited && s.stock.ALL <= 0);
    const insuf = !!(tier && s.balance < price);
    const ps = r.payState;
    const regionText = { '3000': '3,000 級距', '5000': '5,000 級距', '8000': '8,000 級距', '10000': '10,000 級距' };
    const pending = [];
    if (tier) { pending.push('首次參加資格（依報到紀錄核定）'); pending.push('簽名抽籤（預購券 1 張＝1 次機會，11/17 公布）'); if (r.travel) pending.push('揪感心加碼（限量 15 名，依縣市核定）'); if (r.ref) pending.push('主播牧場邀約（需平台驗證）'); }
    const rq = (state) => state === 'ok' ? ['✓', '#00D2BE', '#0E2E2A'] : state === 'wait' ? ['…', '#FFF0D6', '#8A5A00'] : ['—', '#ECECE5', '#6B625F'];
    const q1 = rq(paid ? 'ok' : 'no'), q2 = rq(s.ranchInvite ? (s.ranchInvite.status === 'verified' ? 'ok' : 'wait') : 'no'), q3 = rq(s.ranch ? 'ok' : 'no');
    const ciC = s.checkedIn ? okC : tbdC, rdC = s.redeemed ? okC : tbdC, pkC = s.perkClaimed ? okC : tbdC;
    return Object.assign({
      isDen: scr === 'den', isReg: scr === 'reg', isTickets: scr === 'tickets',
      goDen: () => this.go('den'), goRanch: () => this.go('ranch'), goReg: () => this.go('reg'), goTickets: () => this.go('tickets'), goHome: () => this.go('home'), goAdopt: () => this.go('adopt'),
      navAcct: () => { if (M.loggedIn) this.go('tickets'); else this.openLogin(null); }, navAcctLabel: M.loggedIn ? M.label : '登入',
      sheetLogin: s.sheet === 'login', loginAccShow: a.hasAcc ? 'flex' : 'none', loginNoAccShow: a.hasAcc ? 'none' : 'block', accName: a.name, accLabel: a.label, accLvShort: 'Lv.' + a.lv, doLogin: () => this.doLogin(), loginDis: !a.hasAcc, loginBg: a.hasAcc ? '#292322' : '#BDBCB4', openLogin: () => this.openLogin(null),
      // den
      denPetShow: pet ? 'flex' : 'none', denEmptyShow: pet ? 'none' : 'flex', denWhere: s.ranch ? `主播 ${s.ranch} 的牧場（小窩保留）` : '安心小窩', denRanchIntroShow: s.ranch ? 'none' : 'flex', segRanchDot: rs.key === 'ok' ? 'block' : 'none',
      denFoot: pet ? () => this.goMachine() : () => this.go('home'), denFootLabel: pet ? '回到我的寵物機 →' : '回活動首頁 →', denFootSub: pet ? '同一隻寵物，資料完全同步' : '先看活動與票種也可以',
      dnPlay: () => { this.goMachine(); this.later(() => this.onPlay(), 500); },
      houseTag: s.ranch ? 'RANCH ' + s.ranch : 'MY DEN', houseWhere: s.ranch ? `住在主播 ${s.ranch} 的牧場` : '住在安心小窩',
      petNameOr: pet ? pet.name : '你的寵物', denOrAdopt: pet ? () => this.go('den') : () => this.go('adopt'), denOrAdoptLabel: pet ? '回安心小窩 →' : '先領養我的寵物 →',
      // ranch state
      ranchStateLabel: rs.label, ranchStateShort: rs.short, ranchStateSub: rs.sub, rsBg: rs.c[0], rsFg: rs.c[1], rsBd: rs.key === 'ok' ? '#00D2BE' : '#E4E3DC', rsRef: s.ranchInvite ? 'REF・' + s.ranchInvite.ref : (r.ref ? 'REF・' + r.ref + '（未購票）' : ''), rsRefId: s.ranchInvite ? s.ranchInvite.ref : '',
      rq1m: q1[0], rq1b: q1[1], rq1f: q1[2], rq1s: paid ? `已購買${oTier.name}` : '任一票種皆可；尚未報名',
      rq2m: q2[0], rq2b: q2[1], rq2f: q2[2], rq2s: s.ranchInvite ? (s.ranchInvite.status === 'verified' ? `主播 ${s.ranchInvite.ref} 的邀約已驗證` : `主播 ${s.ranchInvite.ref} 的邀約驗證中`) : '需由主播專屬連結購票產生邀約',
      rq3m: q3[0], rq3b: q3[1], rq3f: q3[2], rq3s: s.ranch ? '已加入' : '符合前兩項後由你決定',
      rsBtnRegShow: rs.key === 'noTicket' ? 'block' : 'none', rsBtnVerifyShow: rs.key === 'pending' ? 'block' : 'none', rsBtnJoinShow: rs.key === 'ok' ? 'block' : 'none', simVerify: () => this.simVerify(),
      // registration
      regHasOrderShow: paid && !s.justDone ? 'flex' : 'none', regTierShow: !paid && step === 'tier' ? 'block' : 'none', regFormShow: !paid && step === 'form' ? 'block' : 'none', regReviewShow: !paid && step === 'review' ? 'block' : 'none', regDoneShow: paid ? 'block' : 'none',
      regGuestLineShow: M.loggedIn ? 'none' : 'flex',
      regTiers: this.TIERS.map(t => { const on = r.tier === t.id; const so = t.limited && s.stock.ALL <= 0; return { id: t.id, name: t.name, price: t.price, perks: t.perks, charm: t.charm, checked: on ? 'true' : 'false', soldOut: so, op: so ? '.55' : '1', border: on ? '2px solid #00D2BE' : '1px solid #E4E3DC', rcText: '牧場：需另有主播邀約', rcBg: '#E2F0FA', rcFg: '#2A4A6B', stockText: t.limited ? (so ? '已售罄' : `剩 ${s.stock.ALL} 組（示意）`) : '供應中', stockColor: so ? '#B43A68' : '#00665C', limit: t.limitText, onPick: () => this.regSet({ tier: t.id, payState: null }) }; }),
      regNext1: () => this.regNext1(), regNext1Dis: !r.tier, regNext1Bg: r.tier ? '#172038' : '#BDBCB4', regNext1Label: r.tier ? (M.loggedIn ? `下一步：填寫資料（${tier.name}）` : `登入並繼續（${tier.name}）`) : '請先選擇票種',
      regTierName: tier ? tier.name : '—', regTierPrice: tier ? tier.price : '—', regToTier: () => this.regSet({ step: 'tier', payState: null }), regToForm: () => this.regSet({ step: 'form', payState: null }),
      rgName: r.name, onRgName: ev => this.regSet({ name: ev.target.value.slice(0, 20) }), rgNameInv: r.err.name ? 'true' : 'false', rgNameBd: r.err.name ? '#B43A68' : '#DDDCD4', rgNameErrShow: r.err.name ? 'block' : 'none',
      rgEmail: r.email, onRgEmail: ev => this.regSet({ email: ev.target.value.slice(0, 80) }), rgEmailInv: r.err.email ? 'true' : 'false', rgEmailBd: r.err.email ? '#B43A68' : '#DDDCD4', rgEmailErrShow: r.err.email ? 'block' : 'none',
      rgTravel: !!r.travel, onRgTravel: ev => this.regSet({ travel: !!ev.target.checked }), rgTravelRows: r.travel ? '1fr' : '0fr',
      rgRegion: r.region, onRgRegion: ev => this.regSet({ region: ev.target.value }), rgRegionInv: r.err.region ? 'true' : 'false', rgRegionBd: r.err.region ? '#B43A68' : '#DDDCD4', rgRegionErrShow: r.err.region ? 'block' : 'none',
      rgSignShow: M.lv >= 80 ? 'flex' : 'none', rgSign: !!r.sign, onRgSign: ev => this.regSet({ sign: !!ev.target.checked }),
      rgAgree: !!r.agree, onRgAgree: ev => this.regSet({ agree: !!ev.target.checked }), rgAgreeInv: r.err.agree ? 'true' : 'false', rgAgreeErrShow: r.err.agree ? 'block' : 'none',
      rgSumShow: errList.length ? 'block' : 'none', rgSumText: errList.length ? '還缺：' + errList.join('、') + '。已填內容會保留。' : '',
      regNext2: () => this.regNext2(),
      expRulesRows: s.expRules ? '1fr' : '0fr', expRulesAria: s.expRules ? 'true' : 'false', tgRules: this.tg('expRules'),
      expTermsRows: s.expTerms ? '1fr' : '0fr', expTermsAria: s.expTerms ? 'true' : 'false', tgTerms: this.tg('expTerms'),
      regIncluded: tier ? this.INCL[tier.id] : '', regPending: pending.join('；'), regRefText: r.ref ? `主播 ${r.ref} 專屬連結・驗證狀態：待購票後驗證` : '無（一般購票）',
      balanceText: (s.balance || 0).toLocaleString() + ' 鑽', balColor: insuf ? '#B43A68' : '#172038', shortText: insuf ? (price - s.balance).toLocaleString() + ' 鑽' : '',
      insufShow: ps === 'insufficient' ? 'flex' : 'none', soldOutShow: ps === 'soldout' ? 'flex' : 'none', payFailShow: ps === 'failed' ? 'flex' : 'none', confirmingShow: ps === 'confirming' ? 'flex' : 'none',
      simFail: !!r.simFail, onSimFail: ev => this.regSet({ simFail: !!ev.target.checked }), topUp: () => this.topUp(),
      regPay: () => this.regPay(), rgPayDis: s.paying || soldOut, rgPayBg: s.paying || soldOut ? '#BDBCB4' : '#172038', rgPayLabel: s.paying ? '確認付款結果中…' : (ps === 'failed' ? '重試付款（模擬）' : soldOut ? '此票種已售罄' : `以鑽石付款 ${tier ? tier.price : ''}（模擬）`),
      // done + tickets
      orderId: order ? order.id : '', orderStatusText: paid ? '已付款（模擬）' : '未付款', orderEmail: order ? order.email : '', orderName: order ? order.name : '', orderTierName: oTier ? oTier.name : '', orderTierId: oTier ? oTier.id : 'basic', orderCharm: oTier ? oTier.charm : '', orderIncluded: oTier ? this.INCL[oTier.id] : '',
      orderRegionText: order && order.region ? regionText[order.region] : '',
      unlockShow: paid && !s.unlockSkipped ? 'flex' : 'none', skipUnlock: () => this.setState({ unlockSkipped: true }),
      doneDenShow: pet ? 'block' : 'none', doneAdoptShow: pet ? 'none' : 'block', doneRanchShow: s.ranchInvite ? 'block' : 'none',
      tkNoneShow: paid ? 'none' : 'flex', tkHasShow: paid ? 'flex' : 'none', tkDenShow: pet ? 'block' : 'none',
      tkTravelShow: order && order.travel ? 'flex' : 'none', tkSignShow: order && order.sign ? 'flex' : 'none',
      ciText: s.checkedIn ? '已報到（模擬）' : '未報到', ciBg: ciC[0], ciFg: ciC[1], ciDone: !!s.checkedIn,
      rdText: s.redeemed ? '已兌換' : (s.checkedIn ? '可兌換' : '報到後可兌換'), rdBg: rdC[0], rdFg: rdC[1], rdDis: !s.checkedIn || !!s.redeemed,
      pkText: s.perkClaimed ? '已核銷' : (s.checkedIn ? '可核銷' : '報到後核銷'), pkBg: pkC[0], pkFg: pkC[1], pkDis: !s.checkedIn || !!s.perkClaimed,
      simCheckIn: () => this.setState({ checkedIn: true }), simRedeem: () => { if (this.state.checkedIn) this.setState({ redeemed: true }); }, simPerk: () => { if (this.state.checkedIn) this.setState({ perkClaimed: true }); }
    }, stepVals);
  }

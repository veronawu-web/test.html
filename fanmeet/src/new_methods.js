  // ===== v11: lower-half sections =====
  DATES = [
    { m: 10, d: 24, tag: '開賣', l1: 'VIP 會員優先購票' },
    { m: 10, d: 27, tag: '開賣', l1: '全票種開賣（含簽名套票）' },
    { m: 11, d: 7, tag: '截止', l1: 'Lv.80+ 簽名勾選截止' },
    { m: 11, d: 16, tag: '截止', l1: '所有預購截止', l2: '抽籤名單鎖定' },
    { m: 11, d: 17, tag: '公布', l1: '簽名抽籤公布' },
    { m: 11, d: 18, tag: '截止', l1: '12:00 中籤確認截止', l2: '簽名套票與入場報名截止' },
    { m: 11, d: 21, tag: '活動日', l1: '見面會當天 13:00–17:00' }
  ];
  TAGC = { '開賣': ['#DDF7F3', '#00665C'], '截止': ['#FFE4EC', '#B43A68'], '公布': ['#E2F0FA', '#2A4A6B'], '活動日': ['#292322', '#5CF5E2'] };
  LVB = ['Lv.0', 'Lv.1–9', 'Lv.10–19', 'Lv.20–29', 'Lv.30–39', 'Lv.40–49', 'Lv.50–59', 'Lv.60–69', 'Lv.70–79', 'Lv.80–89', 'Lv.90–100'];
  LVT = [2520, 3150, 3600, 4050, 4500, 6300, 7200, 8100, 9000, 9900, 10800];
  setReveal = el => {
    if (!el || el.classList.contains('in')) return;
    const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (this.isReduce() || (mq && mq.matches) || !('IntersectionObserver' in window)) { el.classList.add('in'); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { el.classList.add('in'); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
  };
  tg(k) { return () => this.setState({ [k]: !this.state[k] }); }
  lvIdx(lv) { return lv === 0 ? 0 : Math.min(10, Math.floor(lv / 10) + 1); }
  extraVals(M, s) {
    const loggedIn = M.loggedIn !== false;
    const idx = this.lvIdx(M.lv);
    const exp = k => ({ [k + 'Rows']: s[k] ? '1fr' : '0fr', [k + 'Aria']: s[k] ? 'true' : 'false' });
    const now = new Date();
    const wk = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    let next = null;
    const dateRows = this.DATES.map(x => {
      const end = new Date(2026, x.m - 1, x.d, 23, 59, 59);
      const past = now > end;
      if (!past && !next) next = Object.assign({ end }, x);
      const c = this.TAGC[x.tag];
      return { date: x.m + '/' + x.d, wk: wk[end.getDay()], tag: x.tag, tbg: past ? '#EEEDE6' : c[0], tfg: past ? '#6B625F' : c[1], l1: x.l1, l2: x.l2 || '', l2d: x.l2 ? 'block' : 'none', op: past ? '.5' : '1', doneShow: past ? 'inline-flex' : 'none', dc: (!past && next && next.m === x.m && next.d === x.d) ? '#00665C' : '#172038' };
    });
    let dn;
    if (next) {
      const days = Math.ceil((new Date(2026, next.m - 1, next.d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
      const c = this.TAGC[next.tag];
      dn = { dnDate: next.m + '/' + next.d, dnWk: wk[next.end.getDay()], dnLbl: '下一個節點', dnTag: next.tag, dnTagBg: c[0], dnTagFg: c[1], dnTitle: next.l1 + (next.l2 ? '・' + next.l2 : ''), dnLeft: days <= 0 ? '就是今天' : '還有 ' + days + ' 天' };
    } else {
      dn = { dnDate: '11/21', dnWk: 'SAT', dnLbl: '所有節點', dnTag: '已結束', dnTagBg: '#EEEDE6', dnTagFg: '#6B625F', dnTitle: '本場見面會已結束', dnLeft: '感謝到場，下一場見。' };
    }
    const okC = ['#DDF7F3', '#00665C'], noC = ['#EEEDE6', '#5E5653'];
    const cp = !loggedIn ? ['登入查看', noC] : M.lv >= 50 ? ['符合資格・2 張', okC] : M.lv >= 30 ? ['符合資格・1 張', okC] : ['Lv.30 起', noC];
    const bd = !loggedIn ? ['登入查看', noC] : M.lv >= 70 ? ['符合資格', okC] : ['Lv.70 起', noC];
    return Object.assign({
      setReveal: this.setReveal, loClass: this.isReduce() ? 'lo nomo' : 'lo',
      tgQSign: this.tg('qSign'), tgQInter: this.tg('qInter'), tgLv: this.tg('expLv'), tgFirst: this.tg('expFirst'), tgCounty: this.tg('expCounty'),
      rwLoggedShow: loggedIn ? 'block' : 'none', rwGuestShow: loggedIn ? 'none' : 'block', rwLvShow: loggedIn ? 'inline-flex' : 'none',
      rwNum: this.LVT[idx].toLocaleString(), rwBand: this.LVB[idx] + (M.vip ? '・VIP' : ''),
      rwLogin: () => this.setState({ msg: '原型示意：請在右上角屬性切換示意會員等級' }),
      lvRows: this.LVB.map((b, i) => { const me = loggedIn && i === idx; return { lv: b, v: this.LVT[i].toLocaleString(), bg: me ? '#DDF7F3' : 'transparent', fg: me ? '#00665C' : '#172038', px: me ? '8px' : '2px', mx: me ? '-6px' : '0' }; }),
      cpChip: cp[0], cpBg: cp[1][0], cpFg: cp[1][1], bdChip: bd[0], bdBg: bd[1][0], bdFg: bd[1][1],
      dateRows
    }, dn, exp('qSign'), exp('qInter'), exp('expLv'), exp('expFirst'), exp('expCounty'));
  }

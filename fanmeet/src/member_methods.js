  // ===== v15: member card / avatar wording =====
  saleTag(now, openD, closeD) {
    if (now < openD) return ['尚未開放', '#EEEDE6', '#5E5653'];
    if (closeD && now >= closeD) return ['已結束', '#EEEDE6', '#6B625F'];
    return ['開放中', '#DDF7F3', '#00665C'];
  }
  memberVals(M, s, pet) {
    const now = new Date();
    const vipT = this.saleTag(now, new Date(2026, 9, 24), new Date(2026, 9, 27));
    const allT = this.saleTag(now, new Date(2026, 9, 27), null);
    const paid = !!(s.order && s.order.status === 'paid');
    const oTier = paid ? this.TIERS.find(x => x.id === s.order.tier) : null;
    let v;
    if (!M.loggedIn) v = { eyebrow: 'MEMBER', title: '準備好現場見了嗎？', sub: '登入後會帶入你的等級、可購票種與需確認的資格。', p: '登入並查看票種', pf: () => this.openLogin(null), sec: pet ? '回安心小窩' : '先選我的應援分身', sf: pet ? () => this.go('den') : () => this.go('adopt') };
    else if (!paid) v = { eyebrow: 'MEMBER・' + M.label, title: `${M.name}，準備好現場見了嗎？`, sub: M.vip ? 'VIP 會員 10/24 起可優先購票；全票種 10/27 開賣。' : '全票種 10/27 開賣；Lv.40 以上可於 10/24 優先購票。', p: '查看票種與報名', pf: () => this.go('reg'), sec: pet ? '回安心小窩' : '先選我的應援分身', sf: pet ? () => this.go('den') : () => this.go('adopt') };
    else v = { eyebrow: 'MEMBER・' + M.label, title: `${M.name}，我們現場見！`, sub: `已購 ${oTier.name}・報名完成，入場憑證在票券頁。`, p: '查看我的票券', pf: () => this.go('tickets'), sec: pet ? '回安心小窩' : '設定應援分身', sf: pet ? () => this.go('den') : () => this.go('adopt') };
    return {
      mcEyebrow: v.eyebrow, mcTitle: v.title, mcSub: v.sub, mcPrimary: v.pf, mcPrimaryLabel: v.p, mcSec: v.sf, mcSecLabel: v.sec,
      mcVipTag: vipT[0], mcVipBg: vipT[1], mcVipFg: vipT[2], mcAllTag: allT[0], mcAllBg: allT[1], mcAllFg: allT[2],
      mcTierRowShow: paid ? 'none' : 'flex', mcOrderRowShow: paid ? 'flex' : 'none',
      expPerksRows: s.expPerks ? '1fr' : '0fr', expPerksAria: s.expPerks ? 'true' : 'false', tgPerks: this.tg('expPerks'),
      mcPerkNote: M.loggedIn ? '等級由帳號資料取得。VIP 留言與自選應援動物為會員權益，與入場資格無關。' : '登入後依等級顯示已解鎖的權益。',
      doneLaterShow: paid && !pet && !s.doneLater ? 'flex' : 'none', doneLater: () => this.setState({ doneLater: true }),
      birthHasOrder: paid, birthNoOrder: !paid, goRegFromBirth: () => { this.clearTimers(); this.setState({ particles: [], petState: 'idle', busy: false, game: null, msg: '' }); this.go('reg'); }, goDenFromBirth: () => { this.clearTimers(); this.setState({ particles: [], petState: 'idle', busy: false, game: null, msg: '' }); this.go('den'); },
      tkPetShow: pet ? 'block' : 'none'
    };
  }

  // ===== v12: ranch scene =====
  DP = { door: { x: 28, y: 64 }, pts: [{ x: 46, y: 70 }, { x: 60, y: 78 }, { x: 40, y: 84 }, { x: 56, y: 62 }], rest: { x: 28, y: 64 }, feed: { x: 70, y: 86 } };
  sceneP() { return this.state.screen === 'den' ? this.DP : this.RP; }
  sceneOn() { const s = this.state; return (s.screen === 'ranch' && !!s.ranch) || (s.screen === 'den' && !!s.pet); }
  RP = { door: { x: 31, y: 62 }, pts: [{ x: 47, y: 67 }, { x: 58, y: 76 }, { x: 42, y: 82 }, { x: 55, y: 61 }, { x: 66, y: 60 }], rest: { x: 66, y: 68 }, feed: { x: 70, y: 86 } };
  petPix(id, expr) {
    const base = Object.assign({}, this.PAL, this.PETPAL[id]);
    const map = this.EXPR[expr] || this.EXPR.idle;
    const pal = Object.assign({}, base);
    Object.keys(map).forEach(k => pal[k] = base[map[k]]);
    return this.img(this.ART[id], pal);
  }
  startRanch() {
    this.stopRanch();
    const P = this.sceneP();
    if (this.isReduce()) { this.setState({ rp: Object.assign({ dir: 1, dur: 0, act: 'idle' }, P.pts[0]), rpOp: 1, rpMenu: false }); return; }
    this.setState({ rp: Object.assign({ dir: 1, dur: 0, act: 'idle' }, P.door), rpOp: 0, rpMenu: false });
    this.ranchT = setTimeout(() => { this.setState({ rpOp: 1 }); this.ranchT = setTimeout(() => this.rcGo(P.pts[0], 'walk', () => this.rcIdleThen(1200)), 450); }, 700);
  }
  stopRanch() { clearTimeout(this.ranchT); this.ranchT = null; }
  rcGo(pt, act, done) {
    const rp = this.state.rp || this.sceneP().door;
    const d = Math.hypot((pt.x - rp.x) * 3.9, (pt.y - rp.y) * 3.4);
    const dur = this.isReduce() ? 0 : Math.max(1.1, Math.min(3.2, d / 48));
    const dir = pt.x < rp.x ? -1 : (pt.x > rp.x ? 1 : (rp.dir || 1));
    this.setState({ rp: { x: pt.x, y: pt.y, dir, dur, act } });
    clearTimeout(this.ranchT);
    this.ranchT = setTimeout(() => { if (done) done(); }, dur * 1000 + 80);
  }
  rcIdleThen(ms) {
    this.setState({ rp: Object.assign({}, this.state.rp, { act: 'idle' }) });
    this.ranchT = setTimeout(() => this.rcLoop(), ms);
  }
  rcLoop() {
    const s = this.state;
    if (!this.sceneOn() || this.isReduce()) return;
    if (s.busy || s.sheetOpen) { this.ranchT = setTimeout(() => this.rcLoop(), 1200); return; }
    const r = Math.random(), P = this.sceneP();
    if (r < 0.55) {
      const cur = s.rp || P.door;
      const cands = P.pts.filter(p => !(p.x === cur.x && p.y === cur.y));
      const pt = cands[Math.floor(Math.random() * cands.length)];
      this.rcGo(pt, 'walk', () => this.rcIdleThen(1500 + Math.random() * 2200));
    } else if (r < 0.75) {
      this.rcGo(P.rest, 'walk', () => {
        this.setState({ rp: Object.assign({}, this.state.rp, { act: 'rest' }) });
        this.ranchT = setTimeout(() => this.rcIdleThen(600), 4000 + Math.random() * 2500);
      });
    } else {
      this.ranchT = setTimeout(() => this.rcLoop(), 1800 + Math.random() * 2400);
    }
  }
  rcBubble(t) {
    this.setState({ rpBub: t, rpBubAt: Date.now() });
  }
  rcTapPet() {
    if (!this.state.pet) return;
    const rp = this.state.rp || this.sceneP().door;
    this.setState({ rp: Object.assign({}, rp, { dir: -(rp.dir || 1), dur: 0 }), rpMenu: true });
    this.onPet();
    this.rcBubble('♥');
    clearTimeout(this.rpMenuT);
    this.rpMenuT = setTimeout(() => this.setState({ rpMenu: false }), 3500);
  }
  rcPet() { if (!this.state.pet) return; this.setState({ rpMenu: false }); this.onPet(); this.rcBubble('♥'); }
  rcFeed() {
    if (!this.state.pet) return;
    this.setState({ rpMenu: false });
    if (this.state.feed <= 0) { this.openSheet('nofeed'); return; }
    const P = this.sceneP(), rp = this.state.rp || P.door;
    if (!(rp.x === P.feed.x && rp.y === P.feed.y)) this.rcGo(P.feed, 'walk', () => this.rcIdleThen(2500));
    this.openSheet('feed');
  }
  ranchVals(M, s, pet) {
    const now = Date.now(), red = this.isReduce();
    const rp = s.rp || this.sceneP().door;
    const hopping = !red && now - s.hopAt < 600;
    let expr = this.expr();
    if (rp.act === 'rest' && s.petState === 'idle') expr = 'sleep';
    const sp = pet ? pet.sp : 'D';
    if (s.msg !== this.rcMsgLast) { this.rcMsgLast = s.msg; this.rcMsgAt = now; }
    return {
      rcClass: red ? 'rc nomo' : 'rc',
      rpX: rp.x + '%', rpY: rp.y + '%', rpOp: s.rpOp == null ? 1 : s.rpOp, rpDir: rp.dir || 1, rpDur: (rp.dur || 0) + 's',
      rpSrc: this.petPix(sp, expr), rpSrcHappy: this.petPix(sp, 'happy'),
      rpAnim: hopping ? `hop${s.hopN % 2 ? 'A' : 'B'} .55s steps(5) both` : 'none',
      rpBub: s.rpBub || '', rpBubOp: s.rpBubAt && now - s.rpBubAt < 1300 ? 1 : 0,
      rpMenuOp: s.rpMenu ? 1 : 0, rpMenuPE: s.rpMenu ? 'auto' : 'none', rpMenuY: s.rpMenu ? '0' : '6px',
      rcMsg: s.msg || '', rcMsgOp: s.msg && now - this.rcMsgAt < 3500 ? 1 : 0,
      rcTapPet: () => this.rcTapPet(), rcPet: () => this.rcPet(), rcFeed: () => this.rcFeed(),
      rcOpenHouse: () => { this.setState({ rpMenu: false }); this.openSheet('house'); },
      rcOpenBoard: () => { this.setState({ rpMenu: false }); this.openSheet('board'); },
      rcOpenMessage: () => this.openSheet('message'), rcMsgShow: M.vip ? 'flex' : 'none',
      sheetHouse: s.sheet === 'house', sheetBoard: s.sheet === 'board'
    };
  }

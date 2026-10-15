import re, json
import os
S=os.path.join(os.path.dirname(os.path.abspath(__file__)),'src')+os.sep
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'dist')+os.sep
os.makedirs(OUT, exist_ok=True)
src=open(S+'orig_v9.html',encoding='utf-8').read()
m=re.search(r'(<script type="__bundler/template">\n)(.*?)(\n  </script>)', src, re.S)
tpl=json.loads(m.group(2))
def rep1(t, old, new):
    assert t.count(old)==1, (t.count(old), old[:80]); return t.replace(old,new)
# ---- CSS ----
css=open(S+'new.css',encoding='utf-8').read()
tpl=rep1(tpl, "html,body{margin:0;background:#CFE6FF;-webkit-tap-highlight-color:transparent;}", "html,body{margin:0;background:#CFE6FF;-webkit-tap-highlight-color:transparent;}"+css)
# ---- body region ----
body_lines=open(S+'body_v9.html',encoding='utf-8').read().split('\n')
def sec(a,b): return '\n'.join(body_lines[a-1:b])+'\n'
hi=sec(179,190); tix=sec(192,208); sig=sec(210,249); info=sec(309,321); foot=sec(322,325)
assert 'HIGHLIGHTS' in hi and 'TICKETS' in tix and 'SIGNING' in sig and 'INFO' in info and '<footer' in foot
tix=rep1(tix,'    </div>\n  </section>\n','    </div>\n    <p style="margin:12px 2px 0; font-size:13px; line-height:1.6; color:#5E5653;">券單價（現場加購）：心動券 <b class="mono">1,888</b> 鑽・互動券 <b class="mono">3,000</b> 鑽・鐵粉券 <b class="mono">5,000</b> 鑽／張</p>\n  </section>\n')
tix=rep1(tix,'鑰匙圈為數位版，掛在你的寵物機上。','鑰匙圈為數位版，掛在你的寵物機上。 <span class="chip chip-tbdata">鑰匙圈形式待確認</span>')
tix=rep1(tix,'<h2 style="margin:10px 0 0; font-size:24px; line-height:1.35; font-weight:700;">票種與專屬鑰匙圈</h2>','<h2 class="h2">票種與簽名資格</h2><p class="sub">四種票種可比較權益；簽名會名額另有三種取得方式。</p>')
for old,new in [
 ("預購券 1 張＝1 次機會，每人最多中 1 次", "預購券 1 張＝1 次機會（單張也算），每人最多中 1 次"),
 (">全員簽名徽章</b>", ">線下活動專用動態徽章</b>"),
 ("現場完成簽名會後，發到你的帳號，印著全員主播的簽名。", "到場報到後發到你的帳號；另可抽訂製動態徽章乙次（徽章設計細節待定）。"),
 ("簽名套票・中籤・Lv.80+ 勾選者皆可獲得", "Lv.70 以上會員・簽名套票購買者皆可獲得"),
]: sig=rep1(sig,old,new)
hi=rep1(hi,"50,000 鑽，報到 QR 就是號碼", "50,000 鑽，視報名人數加碼；報到 QR 就是號碼")
sig=rep1(sig,'10 組・45,000 鑽<br>','10 組・45,000 鑽 <span class="chip chip-tbdata">組數待確認</span><br>')
sig=rep1(sig,'<div style="font-family:\'IBM Plex Mono\'; font-size:11px; letter-spacing:.1em; color:#6B625F;">SIGNING</div>\n    <h2 style="margin:10px 0 0; font-size:24px; line-height:1.35; font-weight:700;">簽名會名額</h2>','<div class="eyebrow">SIGNING</div>\n    <h2 style="margin:10px 0 0; font-size:21px; line-height:1.35; font-weight:800;">簽名會名額</h2>')
info=rep1(info,'<div style="font-family:\'IBM Plex Mono\'; font-size:11px; letter-spacing:.1em; color:#6B625F;">INFO</div>','<div class="eyebrow">INFO</div>\n    <h2 class="h2" style="margin-bottom:14px;">交通與注意事項</h2>')
info=info.replace('<section style="padding:56px 24px 0;">','<section style="padding:64px 22px 0; background:#F3F8FC;">',1)
foot=foot.replace('<footer style="padding:56px 24px 120px;','<footer style="background:#F3F8FC; padding:40px 22px 120px;',1)
tix=tix.replace('<section style="padding:56px 24px 0;">','<section style="padding:64px 22px 0;">',1)
sig=sig.replace('<section style="padding:56px 24px 0;">','<section style="padding:48px 22px 72px;">',1)
region_old=sec(179,325)
assert tpl.count(region_old)==1
new_region=('<div class="{{ loClass }}">\n'+hi+open(S+'sec_sched.html',encoding='utf-8').read()
  +'<div style="background:#FBF9F4;">\n'+tix+sig+'</div>\n'
  +open(S+'sec_rewards.html',encoding='utf-8').read()+open(S+'sec_dates.html',encoding='utf-8').read()+info+foot+'</div>\n')
tpl=tpl.replace(region_old,new_region)
# ---- HERO v13 ----
hero_old=sec(8,100)
assert tpl.count(hero_old)==1, 'hero region'
tpl=tpl.replace(hero_old, open(S+'hero.html',encoding='utf-8').read())
tpl=rep1(tpl, "html,body{margin:0;background:#CFE6FF;-webkit-tap-highlight-color:transparent;}", "html,body{margin:0;background:#CFE6FF;-webkit-tap-highlight-color:transparent;}"+open(S+'hero.css',encoding='utf-8').read())
# ---- v10 text edits (outside the rebuilt region) ----
for old,new in [
 ("1 大咖＋4 人氣・名單公布中", "大咖 蘇暢 確定出席＋4 位人氣主播・完整名單開賣時公布"),
 ("<span style=\"color:#5E5653;\">全員簽名徽章</span>", "<span style=\"color:#5E5653;\">線下活動專用動態徽章</span>"),
 ("抽籤放棄的名額會轉為簽名套票開賣。", "抽籤放棄的名額會轉為簽名套票，11/18 23:59 前開賣。"),
 ("'簽名會後發放'", "'報到後發放'"),
]: tpl=rep1(tpl,old,new)
tpl=rep1(tpl,"homeCtaLabel: pet ? `回到${pet.name}身邊` : '領養我的寵物',", "homeCtaLabel: pet ? `回到${pet.name}身邊` : '領養我的寵物', heroPetLabel: pet ? `去寵物機餵${pet.name}・看等級` : '領養寵物・餵食升級',")
# ---- JS ----
tpl=rep1(tpl,"  componentDidUpdate(pp, ps) {\n    this.save();\n", "  componentDidUpdate(pp, ps) {\n    this.save();\n    if (!ps) return;\n")
tpl=rep1(tpl,"  renderVals() {\n", open(S+'new_methods.js',encoding='utf-8').read()+"  renderVals() {\n")
tpl=rep1(tpl,"    return {\n      quizOpen:", "    return Object.assign(this.extraVals(M, s), {\n      quizOpen:")
tpl=rep1(tpl,"      passAction: () => { if (!s.checkedIn) this.setState({ checkedIn: true }); else if (!s.redeemed) this.setState({ redeemed: true }); }\n    };\n  }\n}", "      passAction: () => { if (!s.checkedIn) this.setState({ checkedIn: true }); else if (!s.redeemed) this.setState({ redeemed: true }); }\n    });\n  }\n}")
tpl=rep1(tpl,"&quot;options&quot;:[&quot;一般會員 Lv.12&quot;,&quot;VIP Lv.45&quot;]", "&quot;options&quot;:[&quot;未登入&quot;,&quot;一般會員 Lv.12&quot;,&quot;VIP Lv.45&quot;]")

# ---- ranch page ----
rcss=open(S+'ranch.css',encoding='utf-8').read()
tpl=rep1(tpl, "html,body{margin:0;background:#CFE6FF;-webkit-tap-highlight-color:transparent;}", "html,body{margin:0;background:#CFE6FF;-webkit-tap-highlight-color:transparent;}"+rcss)
i0=tpl.index('    <sc-if value="{{ ranchJoined }}" hint-placeholder-val="{{ false }}">')
i1=tpl.index('    </sc-if>', i0)+len('    </sc-if>\n')
tpl=tpl[:i0]+open(S+'ranch.html',encoding='utf-8').read()+tpl[i1:]
# shared slot: move the eligible/blocked slot inside their branches (joined branch has its own)
tpl=rep1(tpl,'  <div style="display:flex; justify-content:center;"><div ref="{{ setSlot }}" style="width:170px; aspect-ratio:260 / 340;"></div></div>\n  <div style="margin-top:28px; display:flex; flex-direction:column; gap:12px;">\n    <sc-if value="{{ ranchEligible }}" hint-placeholder-val="{{ false }}">',
 '  <sc-if value="{{ ranchNotJoined }}" hint-placeholder-val="{{ false }}"><div style="display:flex; justify-content:center;"><div ref="{{ setSlot }}" style="width:170px; aspect-ratio:260 / 340;"></div></div></sc-if>\n  <div style="margin-top:{{ ranchGap }}; display:flex; flex-direction:column; gap:12px;">\n    <sc-if value="{{ ranchEligible }}" hint-placeholder-val="{{ false }}">')
tpl=rep1(tpl,"ranchEligible: eligible, ranchJoined: !!s.ranch, ranchBlocked: !eligible && !s.ranch,","ranchEligible: eligible, ranchJoined: !!s.ranch, ranchNotJoined: !s.ranch, ranchGap: s.ranch ? '0' : '28px', ranchBlocked: !eligible && !s.ranch,")
# sheets
tpl=rep1(tpl,'    <sc-if value="{{ sheetNoFeed }}" hint-placeholder-val="{{ false }}">', open(S+'ranch_sheets.html',encoding='utf-8').read()+'    <sc-if value="{{ sheetNoFeed }}" hint-placeholder-val="{{ false }}">')
# methods + vals
tpl=rep1(tpl,"  renderVals() {\n", open(S+'ranch_methods.js',encoding='utf-8').read()+"  renderVals() {\n")
tpl=rep1(tpl,"    return Object.assign(this.extraVals(M, s), {\n      quizOpen:", "    return Object.assign(this.extraVals(M, s), this.ranchVals(M, s, pet), {\n      quizOpen:")
# lifecycle
tpl=rep1(tpl,"    if (ps.screen !== this.state.screen) { this.placeMachine(true); if (this.state.screen === 'adopt') this.initCarousel(); }",
 "    if (ps.screen !== this.state.screen) { this.placeMachine(true); if (this.state.screen === 'adopt') this.initCarousel(); if (this.state.screen === 'ranch' && this.state.ranch) this.startRanch(); else if (ps.screen === 'ranch') this.stopRanch(); }")
tpl=rep1(tpl,"    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.placeMachine(false));", "    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.placeMachine(false));\n    if (this.state.screen === 'ranch' && this.state.ranch) this.startRanch();")
# section padding on ranch page
tpl=rep1(tpl,'<sc-if value="{{ isRanch }}" hint-placeholder-val="{{ false }}">\n<section style="padding:18px 20px 48px; animation:fadeUp .38s ease-out .06s both;">','<sc-if value="{{ isRanch }}" hint-placeholder-val="{{ false }}">\n<section style="padding:14px 20px 40px;">')
tpl=rep1(tpl,"  host() { return this.state.ranch ? `主播 ${this.state.ranch}` : '你'; }","  host() { return this.state.ranch && this.state.screen !== 'ranch' ? `主播 ${this.state.ranch}` : '你'; }")

# ---- coupon prices (Verona 10/15) ----
tpl=rep1(tpl,'<span style="font-family:\'IBM Plex Mono\'; font-size:12px; color:#6B625F;">售價待公布</span>','<span style="font-family:\'IBM Plex Mono\'; font-size:13px; font-weight:600; color:#00665C;">{{ pk.price }}</span>')
tpl=rep1(tpl,"packs: this.PACKS.map(pk => ({ n: pk.n, feed: pk.feed, onBuy: () => this.buyCoupons(pk) })),","packs: this.PACKS.map(pk => ({ n: pk.n, feed: pk.feed, price: (pk.n * 3000).toLocaleString() + ' 鑽', onBuy: () => this.buyCoupons(pk) })),")
tpl=rep1(tpl,'<li>現場餐點全票種皆有；心動券、拍立得券超過內含數量需另購。</li>','<li>現場餐點全票種皆有；心動券、拍立得券超過內含數量需另購。券單價：心動券 1,888 鑽、互動券 3,000 鑽、鐵粉券 5,000 鑽／張。</li>')

# ---- machine dock: ranch CTA ----
tpl=rep1(tpl,"grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; pointer-events:auto; animation:dockIn","grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; pointer-events:auto; animation:dockIn")
pet_btn='<img src="{{ iconPet }}" alt="" style="width:22px; height:22px; image-rendering:pixelated;">摸摸</button>\n'
tpl=rep1(tpl,pet_btn,pet_btn+open(S+'dock_btn.html',encoding='utf-8').read())
tpl=rep1(tpl,"      onFeedBtn: () => { this.press('feed'); this.onFeed(); },","      dockRanch: () => this.go('ranch'), dockRanchLabel: s.ranch ? '主播牧場' : (eligible ? '加入牧場' : '主播牧場'), dockRanchBg: s.ranch ? '#DDF7F3' : '#fff',\n      onFeedBtn: () => { this.press('feed'); this.onFeed(); },")

# ---- v14 flow module ----
tpl=rep1(tpl, "html,body{margin:0;background:#CFE6FF;-webkit-tap-highlight-color:transparent;}", "html,body{margin:0;background:#CFE6FF;-webkit-tap-highlight-color:transparent;}"+open(S+'flow.css',encoding='utf-8').read())
tpl=rep1(tpl,'<sc-if value="{{ isPetScreen }}" hint-placeholder-val="{{ false }}">', open(S+'flow.html',encoding='utf-8').read()+'\n<sc-if value="{{ isPetScreen }}" hint-placeholder-val="{{ false }}">')
# ranch: replace eligible+blocked blocks with status panel; drop the shared slot wrapper
tpl=rep1(tpl,'  <sc-if value="{{ ranchNotJoined }}" hint-placeholder-val="{{ false }}"><div style="display:flex; justify-content:center;"><div ref="{{ setSlot }}" style="width:170px; aspect-ratio:260 / 340;"></div></div></sc-if>\n','')
i0=tpl.index('    <sc-if value="{{ ranchEligible }}" hint-placeholder-val="{{ false }}">')
i1=tpl.index('    <sc-if value="{{ ranchJoined }}"', i0)
tpl=tpl[:i0]+tpl[i1:]
i0=tpl.index('    <sc-if value="{{ ranchBlocked }}" hint-placeholder-val="{{ false }}">')
i1=tpl.index('    </sc-if>\n', i0)+len('    </sc-if>\n')
tpl=tpl[:i0]+open(S+'ranch_status.html',encoding='utf-8').read()+tpl[i1:]
tpl=rep1(tpl,"ranchGap: s.ranch ? '0' : '28px',","ranchGap: '0',")
# sheets
tpl=rep1(tpl,'    <sc-if value="{{ sheetNoFeed }}" hint-placeholder-val="{{ false }}">', open(S+'login_sheet.html',encoding='utf-8').read()+'    <sc-if value="{{ sheetNoFeed }}" hint-placeholder-val="{{ false }}">')
# JS: remove original member(), add methods, extend return
j0=tpl.index("  member() {\n    const m = this.props.member")
j1=tpl.index("  ref() {", j0)
tpl=tpl[:j0]+tpl[j1:]
tpl=rep1(tpl,"  renderVals() {\n", open(S+'flow_methods.js',encoding='utf-8').read()+"  renderVals() {\n")
tpl=rep1(tpl,"    return Object.assign(this.extraVals(M, s), this.ranchVals(M, s, pet), {\n      quizOpen:", "    return Object.assign(this.extraVals(M, s), this.ranchVals(M, s, pet), this.flowVals(M, s, pet, scr), {\n      quizOpen:")
# state load/save
tpl=rep1(tpl,"    if (!['home', 'adopt', 'machine', 'shop', 'ranch'].includes(screen)) screen = 'home';\n    if (!pet && screen !== 'adopt') screen = 'home';",
 "    if (!['home', 'adopt', 'machine', 'shop', 'ranch', 'den', 'reg', 'tickets'].includes(screen)) screen = 'home';\n    if (screen === 'shop') screen = 'reg';\n    if (!pet && !['adopt', 'den', 'reg', 'tickets', 'ranch', 'home'].includes(screen)) screen = 'home';")
tpl=rep1(tpl,"      msgDraft: '', msgTarget: null, pickIndex: 0,","      loggedIn: !!s.loggedIn, reg: s.reg || null, order: s.order || null, balance: s.balance == null ? 8000 : s.balance, ranchInvite: s.ranchInvite || null, perkClaimed: !!s.perkClaimed, unlockSkipped: !!s.unlockSkipped, attachPending: !!s.attachPending,\n      msgDraft: '', msgTarget: null, pickIndex: 0,")
tpl=rep1(tpl,"quiz: s.quiz, mission: s.mission })); } catch (e) {}","quiz: s.quiz, mission: s.mission, loggedIn: s.loggedIn, reg: s.reg ? Object.assign({}, s.reg, { err: {}, payState: null }) : null, order: s.order, balance: s.balance, ranchInvite: s.ranchInvite, perkClaimed: s.perkClaimed, unlockSkipped: s.unlockSkipped, attachPending: s.attachPending })); } catch (e) {}")
# routing
tpl=rep1(tpl,"  go(screen) { if (screen === this.state.screen) return;","  go(screen) { if (screen === 'shop') screen = 'reg'; if (screen === this.state.screen) return;")
tpl=rep1(tpl,"  openSheet(kind) { this.setState({ sheet: kind, sheetOpen: true }); }","  openSheet(kind) { if (kind === 'ticket') { this.closeSheet(); this.go('tickets'); return; } if (kind === 'pay') { this.closeSheet(); this.go('reg'); return; } this.setState({ sheet: kind, sheetOpen: true }); }")
tpl=rep1(tpl,"    const titles = { adopt: '領養寵物', birth: '誕生', machine: pet ? pet.name : '我的寵物', shop: '票種與鑰匙圈', ranch: '主播牧場' };","    const titles = { adopt: '領養寵物', birth: '誕生', machine: pet ? pet.name : '我的寵物', shop: '活動報名', ranch: '主播牧場', den: '安心小窩', reg: '活動報名', tickets: '我的活動中心' };")
tpl=rep1(tpl,"    const stepL = { adopt: M.label, birth: 'HELLO', machine: s.ranch ? `主播 ${s.ranch} 的牧場` : '住在自己家', shop: 'TICKETS', ranch: 'RANCH' };","    const stepL = { adopt: M.label, birth: 'HELLO', machine: s.ranch ? `主播 ${s.ranch} 的牧場` : '住在安心小窩', shop: 'REGISTER', ranch: 'RANCH', den: 'MY DEN', reg: 'REGISTER', tickets: 'TICKETS' };")
tpl=rep1(tpl,"    const backs = { adopt: 'home', machine: 'home', shop: 'machine', ranch: 'machine' };","    const backs = { adopt: 'home', machine: 'home', shop: 'home', ranch: 'den', den: 'home', reg: 'home', tickets: 'home' };")
tpl=rep1(tpl,"goBack: () => (backs[scr] === 'machine' ? (pet ? this.goMachine() : this.go('home')) : this.go(backs[scr] || 'home')),","goBack: () => { if (scr === 'reg' && s.reg && !(s.order && s.order.status === 'paid')) { const st = s.reg.step; if (st === 'form') return this.regSet({ step: 'tier', payState: null }); if (st === 'review') return this.regSet({ step: 'form', payState: null }); } if (scr === 'ranch' && !pet) return this.go('home'); return backs[scr] === 'machine' ? (pet ? this.goMachine() : this.go('home')) : this.go(backs[scr] || 'home'); },")
tpl=rep1(tpl,"showTicket: scr === 'machine', openTicket: () => this.openSheet('ticket'),","showTicket: scr !== 'tickets' && scr !== 'reg', openTicket: () => this.go('tickets'),")
# joinRanch gating + attach on machine
tpl=rep1(tpl,"    const ref = this.state.purchase && this.state.purchase.ref; if (!ref) return;\n    this.clearTimers();","    const inv = this.state.ranchInvite, od = this.state.order; const ref = inv && inv.status === 'verified' && od && od.status === 'paid' ? inv.ref : null; if (!ref) return;\n    this.clearTimers();")
tpl=rep1(tpl,"  goMachine() { this.clearTimers(); this.setState({ particles: [], petState: 'idle', busy: false, game: null, msg: '', attach: 0, moving: false }); this.touch(); this.go('machine'); }","  goMachine() { this.clearTimers(); const ap = this.state.attachPending && this.state.pet; this.setState({ particles: [], petState: 'idle', busy: false, game: null, msg: '', attach: ap ? 0.5 : 0, moving: false, attachPending: false }); this.touch(); this.go('machine'); if (ap) this.startAttach(); }")
# home CTA → den
tpl=rep1(tpl,"homeCta: pet ? goMachine : () => this.go('adopt'), homeCtaLabel: pet ? `回到${pet.name}身邊` : '領養我的寵物', heroPetLabel: pet ? `去寵物機餵${pet.name}・看等級` : '領養寵物・餵食升級',","homeCta: pet ? () => this.go('den') : () => this.go('adopt'), homeCtaLabel: pet ? `回安心小窩看${pet.name}` : '領養我的寵物', heroPetLabel: pet ? `回安心小窩・看看${pet.name}` : '領養寵物・餵食升級',")
# scene lifecycle for den + ranch
tpl=rep1(tpl,"if (this.state.screen === 'ranch' && this.state.ranch) this.startRanch(); else if (ps.screen === 'ranch') this.stopRanch(); }","if (this.sceneOn()) this.startRanch(); else this.stopRanch(); }")
tpl=rep1(tpl,"    if (this.state.screen === 'ranch' && this.state.ranch) this.startRanch();","    if (this.sceneOn()) this.startRanch();")
# member chip colours follow login
tpl=rep1(tpl,"memberChipBg: M.vip ? '#292322' : '#ECECE5', memberChipFg: M.vip ? '#5CF5E2' : '#3F3836',","memberChipBg: M.loggedIn ? (M.vip ? '#292322' : '#ECECE5') : '#00D2BE', memberChipFg: M.loggedIn ? (M.vip ? '#5CF5E2' : '#3F3836') : '#0E2E2A',")

tpl=rep1(tpl,"  placeMachine(animate, intro, tries = 0) {\n    const m = this.mEl; if (!m) return;\n    const red = this.isReduce(), scr = this.state.screen;","  placeMachine(animate, intro, tries = 0) {\n    const m = this.mEl; if (!m) return;\n    const red = this.isReduce(), scr = this.state.screen;\n    if (scr === 'reg' || scr === 'tickets') { m.style.visibility = 'hidden'; m.style.pointerEvents = 'none'; return; }\n    m.style.visibility = ''; m.style.pointerEvents = '';")

# ---- v15 ----
exec(open(S+'v15_patch.py',encoding='utf-8').read())

# ---- v16 ----
exec(open(S+'v16_patch.py',encoding='utf-8').read())
out=json.dumps(tpl, ensure_ascii=False).replace('</','<\\u002F')
assert json.loads(out)==tpl
new=src[:m.start(2)]+out+src[m.end(2):]
if globals().get('EXTRA_MANIFEST'):
    mm=re.search(r'(<script type="__bundler/manifest">\n)(.*?)(\n  </script>)', new, re.S)
    man=json.loads(mm.group(2)); man.update(EXTRA_MANIFEST)
    new=new[:mm.start(2)]+json.dumps(man)+new[mm.end(2):]
open(OUT+'心動連線 FAN MEET v16（離線版）.html','w',encoding='utf-8').write(new)
open(OUT+'template_unpacked.html','w',encoding='utf-8').write(tpl)
print('ok', len(new))

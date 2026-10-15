# executed inside build via exec(); operates on tpl, S, rep1, sec
mc_old=sec(134,152)
assert tpl.count(mc_old)==1, 'member card region'
tpl=tpl.replace(mc_old, open(S+'member_card.html',encoding='utf-8').read())
tpl=rep1(tpl,"  renderVals() {\n", open(S+'member_methods.js',encoding='utf-8').read()+"  renderVals() {\n")
tpl=rep1(tpl,"this.flowVals(M, s, pet, scr), {\n      quizOpen:", "this.flowVals(M, s, pet, scr), this.memberVals(M, s, pet), {\n      quizOpen:")
tpl=rep1(tpl,"{ text: '10/24（六）優先購票', tag: M.vip ? '已解鎖' : 'Lv.40',","{ text: '10/24（六）優先購票', tag: M.vip ? (Date.now() < new Date(2026, 9, 24).getTime() ? '尚未開放・10/24' : (Date.now() < new Date(2026, 9, 27).getTime() ? '開放中' : '已結束')) : 'Lv.40',")
for old,new in [
 ("adopt: '領養寵物',", "adopt: '選擇應援分身',"),
 ("['◀', '領養', '▶']", "['◀', '選擇', '▶']"),
 ("`領養${pc.name}`", "`選擇${pc.name}當我的分身`"),
 ("'還沒有寵物・點螢幕領養'", "'還沒有應援分身・點螢幕選擇'"),
 ("bottom = '點我領養';", "bottom = '選分身';"),
 ("'領養我的寵物'", "'選擇我的應援分身'"),
 ("'領養寵物・餵食升級'", "'選擇應援分身'"),
 ("petTapLabel: pet ? '摸摸寵物' : '領養寵物'", "petTapLabel: pet ? '摸摸寵物' : '選擇應援分身'"),
 ('>領養我的寵物</button>', '>選擇我的應援分身</button>'),
 ('<p class="fl-note">領養不是購票的必要步驟；你可以先報名活動，之後再回來領養。</p>', '<p class="fl-note">選一隻代表你的應援動物，陪你一起期待見面的那天。這不是購票的必要步驟；你可以先報名，之後再回來選。</p>'),
 ('答 3 題孵出你的寵物。11/21 現場報到時，會依結果領取對應的動物任務。', '選一隻代表你的應援動物，陪你一起期待見面的那天。答 3 題孵出你的分身；與現場動物任務的銜接方式，將於玩法確定後公布。'),
 ('<button type="button" class="fl-ghost" sc-camel-on-click="{{ goAdopt }}" style="display:{{ doneAdoptShow }};">領養活動寵物（可稍後再做）</button>', open(S+'done_avatar.html',encoding='utf-8').read().strip()),
]: tpl=rep1(tpl,old,new)
birth_old='<sc-if value="{{ birthDone }}" hint-placeholder-val="{{ false }}"><button type="button" sc-camel-on-click="{{ startCare }}" style="height:56px; border-radius:16px; border:none; background:#292322; color:#F7F7F2; font-family:inherit; font-size:16px; font-weight:700; cursor:pointer; animation:fadeUp .3s ease-out both; transition:transform .16s ease;" style-active="transform:scale(.97);">開始照顧{{ petName }}</button></sc-if>'
tpl=rep1(tpl,birth_old,open(S+'birth_done.html',encoding='utf-8').read().strip())
tpl=rep1(tpl,"      birthHasOrder: paid, birthNoOrder: !paid,","      birthHasOrderShow: paid ? 'flex' : 'none', birthNoOrderShow: paid ? 'none' : 'flex',")
tpl=rep1(tpl,'<div class="fl-pass-l"><span class="mono">ADMIT ONE</span>','<div class="fl-pass-l"><span style="display:flex; justify-content:space-between; align-items:center;"><span class="mono">ADMIT ONE</span><img src="{{ rpSrcHappy }}" alt="" style="width:30px; height:30px; image-rendering:pixelated; display:{{ tkPetShow }};"></span>')

tpl=rep1(tpl,"heroPrimaryLabel: pur ? '查看我的票券' : '查看票種與購票', barLabel: pur ? '我的票券' : '購票',","heroPrimaryLabel: pur ? '查看我的票券' : '查看票種與報名', barLabel: pur ? '我的票券' : '報名',")

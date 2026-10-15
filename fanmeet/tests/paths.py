import os as _os
DIST=_os.path.join(_os.path.dirname(_os.path.abspath(__file__)),'..','dist')
import asyncio, json, sys
from playwright.async_api import async_playwright
URL='file://'+_os.path.abspath(_os.path.join(DIST,'心動連線 FAN MEET v15（離線版）.html'))
PET={"pet":{"sp":"D","name":"小布"},"level":2,"xp":40,"feed":3,"coupons":1,"stats":{"hunger":60,"mood":60,"bond":30},"quiz":"D"}
async def fresh(b, state=None, shots=None):
    pg=await b.new_page(viewport={'width':390,'height':844})
    pg.errs=[]; pg.on('pageerror', lambda e: pg.errs.append(str(e)[:100]))
    seed=json.dumps(state or {}, ensure_ascii=False)
    await pg.add_init_script("if(!sessionStorage.getItem('seeded')){localStorage.clear();localStorage.setItem('fanmeet-v9', JSON.stringify("+seed+"));sessionStorage.setItem('seeded','1');}")
    await pg.goto(URL); await pg.wait_for_timeout(1800)
    return pg
async def txt(pg): return await pg.inner_text('body')
async def click(pg, text, nth=0):
    await pg.locator('button', has_text=text).nth(nth).click(); await pg.wait_for_timeout(500)
async def register(pg, tier='心動套票', login=True):
    await click(pg, '查看票種與報名')
    assert '選擇票種' in await txt(pg), 'reg step1'
    await pg.locator('button.fl-tier', has_text=tier).click(); await pg.wait_for_timeout(300)
    await click(pg, '下一步' if not login else '登入並繼續')
    if login:
        assert '登入 SWAG 帳號' in await txt(pg), 'login sheet'
        await click(pg, '以此帳號登入')
    t=await txt(pg); assert '確認當天見面的資料' in t, 'form step'
    # validation: clear name, submit
    await pg.fill('#rg-name',''); await click(pg,'下一步：核對訂單')
    t=await txt(pg); assert '還缺' in t and '報到暱稱' in t, 'inline validation'
    await pg.fill('#rg-name','小安'); await pg.locator('label.fl-check', has_text='我已閱讀').locator('input').check(); await click(pg,'下一步：核對訂單')
    t=await txt(pg); assert '核對訂單與付款' in t, 'review step'
    return t
async def pay(pg, label='以鑽石付款'):
    await click(pg,label); await pg.wait_for_timeout(300)
    assert '確認付款結果中' in await txt(pg), 'confirming state'
    await pg.wait_for_timeout(1600)
    t=await txt(pg); assert '報名完成，現場見' in t, 'done page'
    return t
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); R={}
        # 1 未登入無寵物 → 登入購票 → 完成 → 票券
        pg=await fresh(b); assert '登入' in await txt(pg)
        await register(pg); t=await pay(pg); assert '選一個應援分身' in t and '現在選擇' in t
        await pg.locator('button', has_text='查看我的入場票券').last.click(); await pg.wait_for_timeout(600); t=await txt(pg); assert '已完成報名' in t and 'ADMIT ONE' in t and '未報到' in t
        R[1]=('ok', pg.errs); await pg.screenshot(path='p1.png', full_page=True)
        # 2 已有寵物未報名 → 從小窩購票 → 完成後回原寵物
        pg=await fresh(b, dict(PET, screen='den')); t=await txt(pg); assert '我的安心小窩' in t and '小布' in t
        await click(pg,'回活動首頁') if '回活動首頁' in t else None
        await pg.evaluate("window.scrollTo(0,0)")
        # den has no direct buy button; use header 票券 → 尚未報名 → 查看票種
        await click(pg,'票券'); t=await txt(pg); assert '尚未報名' in t
        await click(pg,'查看票種並報名')
        await pg.locator('button.fl-tier').first.click(); await click(pg,'登入並繼續'); await click(pg,'以此帳號登入')
        await pg.fill('#rg-name','小安'); await pg.locator('label.fl-check', has_text='我已閱讀').locator('input').check(); await click(pg,'下一步：核對訂單'); t=await pay(pg)
        assert '回安心小窩' in t; await click(pg,'回安心小窩'); t=await txt(pg); assert '小布' in t and 'Lv.2' in t
        R[2]=('ok', pg.errs); await pg.screenshot(path='p2.png', full_page=True)
        # 3 購票但沒有牧場邀約 → 票券＋小窩正常
        st=dict(PET, loggedIn=True, order={"id":"OD-1","tier":"basic","status":"paid","total":500,"name":"小安","email":"a@b.c","travel":False,"region":"","sign":False,"ref":None,"at":1}, purchase={"tier":"basic","orderId":"OD-1","ref":None,"serials":{},"serial":""}, ranchInvite=None, screen='tickets')
        pg=await fresh(b, st); t=await txt(pg); assert 'ADMIT ONE' in t and '尚無邀約' in t
        await click(pg,'前往主播牧場'); t=await txt(pg); assert '邀約待確認' in t and '沒有邀約來源' in t
        await click(pg,'安心小窩'); t=await txt(pg); assert '我的安心小窩' in t
        R[3]=('ok', pg.errs)
        # 4 符合資格但暫不加入 → 保留邀請，小窩可用
        st4=dict(st, ranchInvite={"ref":"B","status":"verified"}, screen='ranch')
        pg=await fresh(b, st4); t=await txt(pg); assert '符合資格，可選擇加入' in t
        await click(pg,'暫不加入'); t=await txt(pg); assert '我的安心小窩' in t and '符合資格' in t
        await click(pg,'主播牧場'); t=await txt(pg); assert '搬進主播 B 的牧場' in t
        R[4]=('ok', pg.errs); await pg.screenshot(path='p4.png', full_page=True)
        # 5 pending → 模擬驗證 → 加入 → 牧場同一隻寵物
        st5=dict(st, ranchInvite={"ref":"B","status":"pending"}, screen='ranch')
        pg=await fresh(b, st5); t=await txt(pg); assert '驗證中' in t or '邀約待確認' in t
        await click(pg,'模擬：主播端驗證通過'); await click(pg,'搬進主播 B 的牧場'); await pg.wait_for_timeout(2800)
        t=await txt(pg); assert '搬進主播 B 的牧場了' in t or '主播 B 的牧場' in t
        await click(pg,'主播牧場'); await pg.wait_for_timeout(1500); t=await txt(pg); assert '已入住' in t and '小布' in t and 'Lv.2' in t
        await click(pg,'安心小窩'); t=await txt(pg); assert '小窩保留' in t
        R[5]=('ok', pg.errs); await pg.screenshot(path='p5.png', full_page=True)
        # 6 付款失敗、餘額不足、售罄
        pg=await fresh(b, {"loggedIn":True,"balance":1000,"stock":{"ALL":0},"screen":"reg"})
        await pg.locator('button.fl-tier', has_text='簽名套票').count()==1
        dis=await pg.locator('button.fl-tier', has_text='簽名套票').is_disabled(); assert dis, 'soldout disabled'
        await pg.locator('button.fl-tier', has_text='心動套票').click(); await click(pg,'下一步')
        await pg.fill('#rg-name','小安'); await pg.locator('label.fl-check', has_text='我已閱讀').locator('input').check(); await click(pg,'下一步：核對訂單')
        await click(pg,'以鑽石付款'); t=await txt(pg); assert '餘額不足' in t and '還差 500 鑽' in t
        await click(pg,'模擬儲值'); await pg.check('.fl-check.proto input'); await click(pg,'以鑽石付款'); await pg.wait_for_timeout(1900)
        t=await txt(pg); assert '付款未完成' in t and '重試付款' in t
        await pg.uncheck('.fl-check.proto input'); t=await pay(pg,'重試付款')
        R[6]=('ok', pg.errs); await pg.screenshot(path='p6.png', full_page=True)
        # 7 中途返回／重新登入 → 接續，不重複建單
        pg=await fresh(b, {"loggedIn":False,"screen":"reg"})
        await pg.locator('button.fl-tier', has_text='寵愛套票').click(); await click(pg,'登入並繼續'); await click(pg,'以此帳號登入')
        await pg.fill('#rg-name','小安'); await pg.reload(); await pg.wait_for_timeout(1500)
        t=await txt(pg); assert '確認當天見面的資料' in t and '寵愛套票' in t, 'resume step'
        assert await pg.input_value('#rg-name')=='小安', 'name kept'
        await pg.locator('label.fl-check', has_text='我已閱讀').locator('input').check(); await click(pg,'下一步：核對訂單'); t=await pay(pg)
        oid=await pg.evaluate("JSON.parse(localStorage.getItem('fanmeet-v9')).order.id")
        await pg.reload(); await pg.wait_for_timeout(1500); t=await txt(pg); assert '你已完成這場活動的報名' in t and oid in t
        await pg.evaluate("window.scrollTo(0,0)"); 
        # go home and try to register again
        await pg.locator('button', has_text='查看我的入場票券').last.click(); await pg.wait_for_timeout(600); await pg.locator('button', has_text='回活動首頁').last.click(); await pg.wait_for_timeout(600); await pg.locator('button', has_text='查看我的票券').first.click(); await pg.wait_for_timeout(600)
        t=await txt(pg); assert oid in t
        R[7]=('ok', pg.errs)
        print(json.dumps(R, ensure_ascii=False, indent=1))
        await b.close()
asyncio.run(main())

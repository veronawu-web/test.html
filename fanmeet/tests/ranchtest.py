import os as _os
DIST=_os.path.join(_os.path.dirname(_os.path.abspath(__file__)),'..','dist')
import asyncio, json, sys
from playwright.async_api import async_playwright
URL='file://'+_os.path.abspath(_os.path.join(DIST,'心動連線 FAN MEET v13（離線版）.html'))
STATE={"screen":"ranch","pet":{"sp":"D","name":"小布"},"level":2,"xp":40,"feed":3,"coupons":1,"stats":{"hunger":60,"mood":60,"bond":30},"purchase":{"tier":"plus","ref":"B","orderId":"X1"},"ranch":"B","messages":[],"checkedIn":False,"redeemed":False,"quiz":"D","mission":False}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
        await pg.goto(URL); await pg.wait_for_timeout(1500)
        await pg.evaluate("s=>localStorage.setItem('fanmeet-v9', JSON.stringify(s))", STATE)
        await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.screenshot(path='r0.png', full_page=True)
        await pg.wait_for_timeout(3500)
        await pg.screenshot(path='r1.png', full_page=True)
        txt=await pg.inner_text('body')
        print('has {{:', '{{' in txt, '| 已入住' in txt, '| errors', errs[:3])
        # tap pet
        await pg.click('.rc-petbtn'); await pg.wait_for_timeout(400)
        await pg.screenshot(path='r2.png', clip={'x':0,'y':0,'width':390,'height':520})
        # feed via action
        await pg.get_by_text('餵食', exact=False).nth(1).click(); await pg.wait_for_timeout(700)
        await pg.screenshot(path='r3.png', full_page=False)
        await pg.get_by_text('草莓蛋糕').click(); await pg.wait_for_timeout(900)
        await pg.screenshot(path='r4.png', clip={'x':0,'y':0,'width':390,'height':520})
        await pg.wait_for_timeout(2500)
        # house sheet
        await pg.click('.rc-hot[aria-label="草莓小屋"]'); await pg.wait_for_timeout(700)
        await pg.screenshot(path='r5.png')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
        await pg.click('.rc-hot[aria-label="牧場告示牌"]'); await pg.wait_for_timeout(700)
        await pg.screenshot(path='r6.png')
        print('feed left:', await pg.evaluate("JSON.parse(localStorage.getItem('fanmeet-v9')).feed"), 'errors', errs[:3])
        await b.close()
asyncio.run(main())

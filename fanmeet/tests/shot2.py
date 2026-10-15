import os as _os
DIST=_os.path.join(_os.path.dirname(_os.path.abspath(__file__)),'..','dist')
import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={'width':390,'height':844})
        errs=[]
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'ERR_FILE_NOT_FOUND' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://'+_os.path.abspath(_os.path.join(DIST,'心動連線 FAN MEET v13（離線版）.html')))
        await pg.wait_for_timeout(4000)
        # scroll through to trigger reveals
        h=await pg.evaluate('document.body.scrollHeight')
        for y in range(0,h,400):
            await pg.evaluate(f'window.scrollTo(0,{y})'); await pg.wait_for_timeout(120)
        await pg.wait_for_timeout(1200)
        txt=await pg.inner_text('body')
        for k in ['把這一天，留給見面','到場，還有這些驚喜','見面之前，記住這幾天','下一個節點','還有','需簽名資格','查看完整等級表','鑰匙圈形式待確認','組數待確認','交通與注意事項','{{']:
            print(k, k in txt)
        print('errors:', errs[:8])
        print('height', h)
        await pg.screenshot(path='v13_full.png', full_page=True)
        # expand toggles
        for lbl in ['查看完整等級表','首次參加的完整定義','查看適用縣市','需簽名資格']:
            try:
                await pg.get_by_text(lbl).first.click(); await pg.wait_for_timeout(500)
            except Exception as e: print('click fail', lbl, e)
        await pg.screenshot(path='v13_exp.png', full_page=True)
        await b.close()
asyncio.run(main())

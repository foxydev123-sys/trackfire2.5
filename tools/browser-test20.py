# The menu stage: your tank stands on the ground in front of the Citadel, squad tanks fall in
# beside you, the camera eases back as the line grows, and each tank carries a name plate.
import asyncio, os, subprocess, time, sys, tempfile
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8822; MOCK = os.path.join(ROOT, 'tools', 'mock-three.js')
DATA = tempfile.mkdtemp(prefix='kt-b20-')

async def main():
    srv = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT,
        env={**os.environ, 'PORT': str(PORT), 'DATA_DIR': DATA, 'REG_LIMIT': '100'}, stdout=subprocess.PIPE)
    time.sleep(0.9)
    errs = []; fails = []
    def ok(c, m):
        print(('  ok   ' if c else '  FAIL ') + m)
        if not c: fails.append(m)
    try:
        async with async_playwright() as pw:
            br = await pw.chromium.launch()
            ctx = await br.new_context(viewport={'width': 844, 'height': 390}, service_workers='block')
            p = await ctx.new_page()
            p.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
            await p.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(path=MOCK, content_type='text/javascript'))
            await p.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
            await p.goto(f'http://localhost:{PORT}/'); await p.wait_for_selector('#scr-menu:not([hidden])')
            await p.wait_for_function('window.__tf'); await p.evaluate("__tf.setName('Solomon')")
            await p.wait_for_timeout(900)

            ok(await p.evaluate("!!document.getElementById('stageNames')"), 'the stage has somewhere to hang name plates')
            ok(await p.evaluate("document.body.classList.contains('on-menu')"), 'the plates are switched on for the menu')

            n1 = await p.evaluate("__tf.stage.views.size")
            ok(n1 == 1, f'one tank stands on the stage to begin with ({n1})')
            far1 = await p.evaluate("__tf.stage.want.dist")

            # the tank is on the ground near the Citadel, turned off straight-on
            pose = await p.evaluate("""() => { const e = [...__tf.stage.views.values()][0];
              return { x: e.view.root.position.x, z: e.view.root.position.z, yaw: e.view.root.rotation.y }; }""")
            ok(abs(pose['z'] - 8) < 3, f"it stands south of the Citadel (z {pose['z']:.1f})")
            ok(abs(pose['yaw']) > 0.4, f"and is turned off straight-on (yaw {pose['yaw']:.2f} rad)")

            # a squad of four: four tanks, and the camera wants to be further back
            await p.evaluate("""() => {
              __tf.acc.party = { leader: 'me', members: [
                { id: 'me', name: 'Solomon', tank: { id: 'zagros', level: 4 } },
                { id: 'p2', name: 'Hemin',   tank: { id: 'safeen', level: 3 } },
                { id: 'p3', name: 'Dilan',   tank: { id: 'korek',  level: 2 } },
                { id: 'p4', name: 'Aram',    tank: { id: 'newroz', level: 5 } } ] };
              __tf.acc.emit('party', __tf.acc.party);
            }""")
            await p.wait_for_timeout(700)
            n4 = await p.evaluate("__tf.stage.views.size")
            far4 = await p.evaluate("__tf.stage.want.dist")
            ok(n4 == 4, f'a full squad puts four tanks on the stage ({n4})')
            ok(far4 > far1, f'and the camera pulls back for them ({far1:.0f} → {far4:.0f})')

            spread = await p.evaluate("""() => [...__tf.stage.views.values()].map(e => +e.view.root.position.x.toFixed(1))""")
            ok(len(set(spread)) == 4, f'each tank has its own place in the line ({spread})')

            plates = await p.evaluate("""() => [...document.querySelectorAll('#stageNames .splate')].map(el => el.textContent)""")
            ok(len(plates) == 4, f'every tank gets a name plate ({len(plates)})')
            ok(any('Hemin' in x for x in plates) and any('Safeen' in x or 'safeen' in x.lower() for x in plates),
               f'the plate says who it is and which tank they picked ({plates})')

            # someone swaps tank and their model is rebuilt
            kinds_before = await p.evaluate("() => [...__tf.stage.views.values()].map(e => e.kind)")
            await p.evaluate("""() => { __tf.acc.party.members[1].tank = { id: 'bradost', level: 1 };
              __tf.acc.emit('party', __tf.acc.party); }""")
            await p.wait_for_timeout(500)
            kinds_after = await p.evaluate("() => [...__tf.stage.views.values()].map(e => e.kind)")
            ok('bradost' in kinds_after and kinds_before != kinds_after,
               f'changing tank swaps the model on the stage ({kinds_before} → {kinds_after})')

            # leaving the menu takes the stage down
            await p.evaluate("__tf.acc.party = null; __tf.acc.emit('party', null);")
            await p.wait_for_timeout(500)
            ok(await p.evaluate("__tf.stage.views.size") == 1, 'when the squad leaves, only your tank is left')
            await br.close()
    finally:
        srv.terminate()
    for e in errs: print('  ' + e)
    bad = fails + errs
    print(('FAILED: %d' % len(bad)) if bad else 'browser-test20: all good')
    sys.exit(1 if bad else 0)

asyncio.run(main())

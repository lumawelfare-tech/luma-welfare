import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { replaceRootElement } from '../prerender-public.ts'

describe('replaceRootElement (prerender)', () => {
  it('replaces nested #root boot splash without leaving wordmark/tag orphans', () => {
    const html = `<!doctype html><html><body>
    <div id="root">
      <div class="app-boot-static">
        <div class="app-boot-static__ring">
          <div class="app-boot-static__mark">LW</div>
        </div>
        <p class="app-boot-static__wordmark">Luma Welfare</p>
        <p class="app-boot-static__tag">Community Welfare</p>
      </div>
    </div>
    <script type="module" src="/assets/index.js"></script>
  </body></html>`

    const shell = `<div id="root"><main data-prerender="true">Shell</main></div>`
    const out = replaceRootElement(html, shell)

    assert.match(out, /<main data-prerender="true">Shell<\/main>/)
    assert.equal(out.includes('app-boot-static__wordmark'), false)
    assert.equal(out.includes('app-boot-static__tag'), false)
    assert.equal(out.includes('app-boot-static'), false)
    assert.match(out, /<script type="module" src="\/assets\/index\.js"><\/script>/)
    assert.equal(out.match(/id=["']root["']/g)?.length, 1)
  })

  it('handles empty #root', () => {
    const html = `<body><div id="root"></div><script></script></body>`
    const out = replaceRootElement(html, `<div id="root"><main>x</main></div>`)
    assert.equal(out, `<body><div id="root"><main>x</main></div><script></script></body>`)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseColorPalette, parseColorTheme, readSubscriptionTheme } from './color-theme.ts'

const RED =
  '1B0E15-140A10-24131B-301A24-58303D-D9435A-FF8294-FFF0F3-C2A0AA'

describe('parseColorTheme', () => {
  it('accepts the built-in names and the short aliases', () => {
    assert.equal(parseColorTheme('purple'), 'purple')
    assert.equal(parseColorTheme('Sakura'), 'pink')
    assert.equal(parseColorTheme('resetcolors'), 'original')
    assert.equal(parseColorTheme('blue'), 'cabinet')
    assert.equal(parseColorTheme('base64:cmVk'), 'red')
  })

  it('ignores a Happ JSON colour profile and a custom palette', () => {
    assert.equal(parseColorTheme('{"buttonColor":"#fff"}'), undefined)
    assert.equal(parseColorTheme(RED), undefined)
  })
})

describe('parseColorPalette', () => {
  it('normalises dashes, hashes, and separators to uppercase dashes', () => {
    assert.equal(parseColorPalette(RED.toLowerCase()), RED)
    assert.equal(
      parseColorPalette(
        '#1B0E15, #140A10, #24131B, #301A24, #58303D, #D9435A, #FF8294, #FFF0F3, #C2A0AA'
      ),
      RED
    )
    assert.equal(parseColorPalette('base64:' + Buffer.from(RED).toString('base64')), RED)
  })

  it('rejects names, short lists, and JSON', () => {
    assert.equal(parseColorPalette('blue'), undefined)
    assert.equal(parseColorPalette('1B0E15-140A10'), undefined)
    assert.equal(parseColorPalette('{"canvas":"#1B0E15"}'), undefined)
  })
})

describe('readSubscriptionTheme', () => {
  it('prefers the response header over the body and the link', () => {
    assert.deepEqual(
      readSubscriptionTheme({
        url: 'https://example.com/sub#?color-profile=pink',
        body: '#color-profile green\nproxies: []\n',
        headers: { 'color-profile': 'orange', providerid: 'ignored' }
      }),
      { theme: 'orange' }
    )
  })

  it('reads a body comment when the header is absent', () => {
    assert.deepEqual(readSubscriptionTheme({ body: '#theme: violet\n' }), { theme: 'purple' })
  })

  it('reads the link fragment', () => {
    assert.deepEqual(
      readSubscriptionTheme({ url: 'https://example.com/sub/1#?theme=emerald' }),
      { theme: 'green' }
    )
  })

  it('reads a custom palette from the header, the body, or the link', () => {
    assert.deepEqual(
      readSubscriptionTheme({
        headers: { 'color-profile': RED },
        body: '#theme red\n'
      }),
      { palette: RED }
    )
    assert.deepEqual(readSubscriptionTheme({ body: `#color-profile: ${RED}\n` }), { palette: RED })
    assert.deepEqual(
      readSubscriptionTheme({ url: `https://example.com/sub?color-profile=${RED}` }),
      { palette: RED }
    )
  })
})

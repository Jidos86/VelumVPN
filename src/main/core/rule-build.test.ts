import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyProfileRuleEdits,
  constrainTun,
  ipCidrRule,
  overlayFields,
  parseIpInput,
  rulesAfterProfileEdits,
  TUN_OVERLAY_KEYS,
  usableProxyProvider
} from './rule-build.ts'

describe('ipCidrRule', () => {
  it('keeps the target and no-resolve', () => {
    assert.equal(ipCidrRule('1.2.3.4', '→ VelumVPN'), 'IP-CIDR,1.2.3.4/32,→ VelumVPN,no-resolve')
    assert.equal(ipCidrRule('2001:db8::42', 'DIRECT'), 'IP-CIDR6,2001:db8::42/128,DIRECT,no-resolve')
    assert.equal(ipCidrRule('::1', 'DIRECT'), 'IP-CIDR6,::1/128,DIRECT,no-resolve')
    assert.equal(ipCidrRule('2001:db8::/32', 'DIRECT'), 'IP-CIDR6,2001:db8::/32,DIRECT,no-resolve')
    assert.equal(ipCidrRule('192.168.0.0/16', '→ VelumVPN'), 'IP-CIDR,192.168.0.0/16,→ VelumVPN,no-resolve')
  })

  it('strips only an explicit port', () => {
    assert.equal(parseIpInput('1.2.3.4:443')?.cidr, '1.2.3.4/32')
    assert.equal(parseIpInput('[2001:db8::42]:443')?.cidr, '2001:db8::42/128')
    assert.equal(parseIpInput('2001:db8::42')?.cidr, '2001:db8::42/128')
  })

  it('rejects junk', () => {
    assert.equal(parseIpInput('not-an-ip'), null)
    assert.throws(() => ipCidrRule('2001:db8:', 'DIRECT'))
  })
})

describe('applyProfileRuleEdits', () => {
  const base = [
    'DOMAIN-SUFFIX,claude.ai,REJECT',
    'GEOSITE,youtube,→ VelumVPN',
    'MATCH,DIRECT'
  ]

  it('prepends and appends before MATCH and keeps AI reject first', () => {
    const next = applyProfileRuleEdits(
      base,
      { prepend: ['DOMAIN,a.com,DIRECT'], append: ['DOMAIN,b.com,→ VelumVPN'] },
      1
    )
    assert.deepEqual(next, [
      'DOMAIN-SUFFIX,claude.ai,REJECT',
      'DOMAIN,a.com,DIRECT',
      'GEOSITE,youtube,→ VelumVPN',
      'DOMAIN,b.com,→ VelumVPN',
      'MATCH,DIRECT'
    ])
  })

  it('deletes a rule without touching the others', () => {
    const next = applyProfileRuleEdits(base, { delete: ['GEOSITE,youtube,→ VelumVPN'] }, 1)
    assert.deepEqual(next, ['DOMAIN-SUFFIX,claude.ai,REJECT', 'MATCH,DIRECT'])
  })

  it('keeps an explicit false and an empty exclusion list', () => {
    const tun: Record<string, unknown> = { stack: 'gvisor', 'strict-route': true }
    overlayFields(
      tun,
      { stack: 'system', 'strict-route': false, 'route-exclude-address': [], device: 'velumvpn' },
      TUN_OVERLAY_KEYS
    )
    assert.equal(tun.stack, 'system')
    assert.equal(tun['strict-route'], false)
    assert.deepEqual(tun['route-exclude-address'], [])
    assert.equal(tun.device, 'velumvpn')
  })

  it('drops a non-utun device on darwin and says why', () => {
    const tun: Record<string, unknown> = { device: 'velumvpn', stack: 'mixed' }
    assert.deepEqual(constrainTun(tun, 'darwin'), ['darwin-device', 'darwin-stack'])
    assert.equal(tun.device, undefined)
    assert.equal(tun.stack, 'gvisor')
  })

  it('accepts an http provider and rejects one without a source', () => {
    assert.equal(usableProxyProvider({ type: 'http', url: 'https://example/p' }), true)
    assert.equal(usableProxyProvider({ type: 'http' }), false)
    assert.equal(usableProxyProvider({ type: 'mystery', url: 'https://example/p' }), false)
  })

  it('does not let a profile append add a VPN route while AI hold is on', () => {
    const next = rulesAfterProfileEdits(
      ['DOMAIN-SUFFIX,claude.ai,REJECT', 'MATCH,DIRECT'],
      { append: ['DOMAIN,youtube.com,→ VelumVPN'] },
      ['DOMAIN-SUFFIX,claude.ai,REJECT']
    )
    assert.deepEqual(next, ['DOMAIN-SUFFIX,claude.ai,REJECT', 'MATCH,DIRECT'])
  })

  it('keeps an AI block when a profile delete names it and VPN is off', () => {
    const next = rulesAfterProfileEdits(
      ['DOMAIN-SUFFIX,claude.ai,REJECT', 'MATCH,DIRECT'],
      { delete: ['DOMAIN-SUFFIX,claude.ai,REJECT'] },
      ['DOMAIN-SUFFIX,claude.ai,REJECT']
    )
    assert.deepEqual(next, ['DOMAIN-SUFFIX,claude.ai,REJECT', 'MATCH,DIRECT'])
  })

  it('still applies append and delete while the VPN switch is on', () => {
    const next = rulesAfterProfileEdits(
      ['GEOSITE,youtube,→ VelumVPN', 'MATCH,DIRECT'],
      { append: ['DOMAIN,b.com,→ VelumVPN'], delete: ['GEOSITE,youtube,→ VelumVPN'] },
      null
    )
    assert.deepEqual(next, ['DOMAIN,b.com,→ VelumVPN', 'MATCH,DIRECT'])
  })

  it('honours a numeric offset inside the unprotected section', () => {
    const next = applyProfileRuleEdits(base, { prepend: ['0,DOMAIN,first.com,DIRECT'] }, 1)
    assert.equal(next[1], 'DOMAIN,first.com,DIRECT')
    assert.equal(next.at(-1), 'MATCH,DIRECT')
  })
})

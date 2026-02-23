import yaml from 'yaml'
import { readFileSync, writeFileSync } from 'fs'

const pkg = readFileSync('package.json', 'utf-8')
let changelog = readFileSync('changelog.md', 'utf-8')
const { version } = JSON.parse(pkg)
const downloadUrl = `https://github.com/coolcoala/koala-clash/releases/download/${version}`
const latest = {
  version,
  changelog
}

if (process.env.SKIP_CHANGELOG !== '1') {
  changelog += '\n### Download link：\n\n#### Windows10/11：\n\n'
  changelog += `- Installation version：[64-bit](${downloadUrl}/koala-clash-windows-${version}-x64-setup.exe) | [ARM64](${downloadUrl}/koala-clash-windows-${version}-arm64-setup.exe)\n\n`
  changelog += '\n#### macOS 11+：\n\n'
  changelog += `- PKG：[Intel](${downloadUrl}/koala-clash-macos-${version}-x64.pkg) | [Apple Silicon](${downloadUrl}/koala-clash-macos-${version}-arm64.pkg)\n\n`
  changelog += '\n#### Linux：\n\n'
  changelog += `- DEB：[64-bit](${downloadUrl}/koala-clash-linux-${version}-amd64.deb) | [ARM64](${downloadUrl}/koala-clash-linux-${version}-arm64.deb)\n\n`
  changelog += `- RPM：[64-bit](${downloadUrl}/koala-clash-linux-${version}-x86_64.rpm) | [ARM64](${downloadUrl}/koala-clash-linux-${version}-aarch64.rpm)\n\n`
  changelog += `- PACMAN：[64-bit](${downloadUrl}/koala-clash-linux-${version}-x64.pkg.tar.xz) | [ARM64](${downloadUrl}/koala-clash-linux-${version}-aarch64.pkg.tar.xz)`
}
writeFileSync('latest.yml', yaml.stringify(latest))
writeFileSync('changelog.md', changelog)

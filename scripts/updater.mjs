import yaml from 'yaml'
import { readFileSync, writeFileSync } from 'fs'
import { extractVersionSection } from './changelog.mjs'

const pkg = readFileSync('package.json', 'utf-8')
const rawChangelog = readFileSync('changelog.md', 'utf-8')
const { version } = JSON.parse(pkg)

let changelog = extractVersionSection(rawChangelog, version)
const downloadUrl = `https://github.com/Jidos86/VelumVPN/releases/download/${version}`
const latest = {
  version,
  changelog
}

const badge = (format, label, logo) =>
  `https://img.shields.io/badge/${format}-default?style=flat&logo=${logo}&label=${encodeURIComponent(label)}`

const link = (url, format, label, logo) =>
  `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${badge(format, label, logo)}"></a>`

if (process.env.SKIP_CHANGELOG !== '1') {
  changelog += '\n### Скачать：\n\n#### Windows 10/11：\n\n'
  changelog += link(`${downloadUrl}/VelumVPN_x64-setup.exe`, 'EXE', 'x64 Установщик', 'windows') + ' '
  changelog += link(`${downloadUrl}/VelumVPN_x64-portable.7z`, '7Z', 'x64 Портативный', 'windows') + '\n\n'
  changelog += link(`${downloadUrl}/VelumVPN_arm64-setup.exe`, 'EXE', 'ARM64 Установщик', 'windows') + ' '
  changelog += link(`${downloadUrl}/VelumVPN_arm64-portable.7z`, '7Z', 'ARM64 Портативный', 'windows') + '\n\n'
  changelog += '\n#### Linux：\n\n'
  changelog += link(`${downloadUrl}/VelumVPN_amd64.deb`, 'DEB', 'x64', 'linux') + ' '
  changelog += link(`${downloadUrl}/VelumVPN_arm64.deb`, 'DEB', 'ARM64', 'linux') + '\n\n'
  changelog += link(`${downloadUrl}/VelumVPN_x86_64.rpm`, 'RPM', 'x64', 'linux') + ' '
  changelog += link(`${downloadUrl}/VelumVPN_aarch64.rpm`, 'RPM', 'ARM64', 'linux')
}
writeFileSync('latest.yml', yaml.stringify(latest))
writeFileSync('changelog.md', changelog)
writeFileSync('rawChangelog.md', rawChangelog)

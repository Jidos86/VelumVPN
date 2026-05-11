import axios from 'axios'
import { readFileSync, existsSync } from 'fs'
import { extractVersionSection } from './changelog.mjs'

const token = process.env.TELEGRAM_TOKEN
const chat_ids = [process.env.GROUP_ID, process.env.CHANNEL_ID].filter(Boolean)

if (!token || chat_ids.length === 0) {
  console.log('Telegram secrets not configured, skipping notification.')
  process.exit(0)
}

const pkg = readFileSync('package.json', 'utf-8')
const { version } = JSON.parse(pkg)

const changelogFile = existsSync('rawChangelog.md') ? 'rawChangelog.md' : 'changelog.md'
const rawChangelog = existsSync(changelogFile) ? readFileSync(changelogFile, 'utf-8') : ''
const changelog = rawChangelog ? extractVersionSection(rawChangelog, version) : ''

let content = `<tg-emoji emoji-id='5258249368670073225'>❗️</tg-emoji>   <b><a href="https://github.com/Jidos86/VelumVPN/releases/tag/v${version}">VelumVPN ${version}</a></b>\n\n`
for (const line of changelog.split('\n')) {
  if (line.length === 0) {
    content += '\n'
  } else if (line.startsWith('### ')) {
    content += `<b>${line.replace('### ', '')}</b>\n`
  } else {
    content += `${line}\n`
  }
}
for (const chat_id of chat_ids) {
  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id,
    text: content,
    link_preview_options: {
      is_disabled: false,
      url: `https://github.com/Jidos86/VelumVPN/releases/tag/v${version}`,
      prefer_large_media: true
    },
    parse_mode: 'HTML'
  })
}

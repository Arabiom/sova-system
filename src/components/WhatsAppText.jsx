import { previewParts } from '../lib/whatsapp.js'

const TAGS = { bold: 'strong', italic: 'em', strike: 's', mono: 'code' }

/** A message shown the way WhatsApp shows it: *bold* _italic_ ~strike~ ```mono```. */
export function WhatsAppText({ text }) {
  return previewParts(text).map((part, i) => {
    const Tag = TAGS[part.kind]
    return Tag ? <Tag key={i}>{part.text}</Tag> : <span key={i}>{part.text}</span>
  })
}

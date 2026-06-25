/**
 * JARVIS WhatsApp Bridge
 * Uses whatsapp-web.js to connect to WhatsApp Web
 * Exposes HTTP API that the JARVIS backend calls
 *
 * Start: node index.js
 * First run: scan QR code with WhatsApp on your iPhone
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const qrcode = require('qrcode-terminal')
const http = require('http')

const PORT = process.env.PORT || 3001
const JARVIS_BACKEND = process.env.JARVIS_BACKEND || 'http://localhost:8000'
const JARVIS_API_KEY = process.env.JARVIS_API_KEY || 'change-me-local-key'

let client = null
let isReady = false
let qrData = null
const messageQueue = []
const MAX_QUEUE = 100

// ── WhatsApp Client ───────────────────────────────────────────────────────────

function initWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './wa-session' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  })

  client.on('qr', (qr) => {
    qrData = qr
    isReady = false
    console.log('\n📱 JARVIS WhatsApp — Scan this QR code with your iPhone:\n')
    qrcode.generate(qr, { small: true })
    console.log('\nOr visit http://localhost:3001/qr to see it in JARVIS\n')
    // Notify JARVIS backend
    notifyJarvis('whatsapp_qr', { qr })
  })

  client.on('ready', () => {
    isReady = true
    qrData = null
    const info = client.info
    console.log(`✅ WhatsApp connected as: ${info.pushname} (${info.wid.user})`)
    notifyJarvis('whatsapp_ready', { name: info.pushname, phone: info.wid.user })
  })

  client.on('authenticated', () => {
    console.log('✅ WhatsApp authenticated')
  })

  client.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp auth failed:', msg)
    isReady = false
  })

  client.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason)
    isReady = false
    setTimeout(initWhatsApp, 5000)
  })

  client.on('message', async (msg) => {
    try {
      const contact = await msg.getContact()
      const chat = await msg.getChat()

      const message = {
        id: msg.id.id,
        from: contact.name || contact.pushname || msg.from,
        phone: msg.from.replace('@c.us', ''),
        body: msg.body,
        timestamp: msg.timestamp,
        isGroup: chat.isGroup,
        chatName: chat.name,
        hasMedia: msg.hasMedia,
        time: new Date(msg.timestamp * 1000).toLocaleTimeString(),
      }

      messageQueue.unshift(message)
      if (messageQueue.length > MAX_QUEUE) messageQueue.pop()

      console.log(`📨 ${message.from}: ${message.body.substring(0, 60)}`)

      // Forward to JARVIS backend
      notifyJarvis('whatsapp_message', message)
    } catch (e) {
      console.error('Message handling error:', e.message)
    }
  })

  client.initialize()
}

// ── HTTP API ──────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  // Status
  if (url.pathname === '/status') {
    res.writeHead(200)
    res.end(JSON.stringify({ ready: isReady, qrPending: !!qrData }))
    return
  }

  // Get QR code
  if (url.pathname === '/qr') {
    res.writeHead(200)
    res.end(JSON.stringify({ qr: qrData, ready: isReady }))
    return
  }

  // Get messages
  if (url.pathname === '/messages' && req.method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const filter = url.searchParams.get('q') || ''
    let msgs = messageQueue.slice(0, limit * 3)
    if (filter) msgs = msgs.filter(m =>
      m.from.toLowerCase().includes(filter.toLowerCase()) ||
      m.body.toLowerCase().includes(filter.toLowerCase())
    )
    res.writeHead(200)
    res.end(JSON.stringify(msgs.slice(0, limit)))
    return
  }

  // Get chats
  if (url.pathname === '/chats' && req.method === 'GET') {
    if (!isReady) { res.writeHead(503); res.end(JSON.stringify({ error: 'Not connected' })); return }
    try {
      const chats = await client.getChats()
      const result = chats.slice(0, 20).map(c => ({
        id: c.id._serialized,
        name: c.name,
        isGroup: c.isGroup,
        unreadCount: c.unreadCount,
        lastMessage: c.lastMessage?.body?.substring(0, 100),
        timestamp: c.timestamp,
      }))
      res.writeHead(200)
      res.end(JSON.stringify(result))
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
    }
    return
  }

  // Send message
  if (url.pathname === '/send' && req.method === 'POST') {
    if (!isReady) { res.writeHead(503); res.end(JSON.stringify({ error: 'WhatsApp not connected' })); return }
    let body = ''
    req.on('data', d => body += d)
    req.on('end', async () => {
      try {
        const { to, message } = JSON.parse(body)
        // Format phone: strip + and spaces, add @c.us
        const phone = to.replace(/[^0-9]/g, '') + '@c.us'
        await client.sendMessage(phone, message)
        console.log(`📤 Sent to ${to}: ${message.substring(0, 60)}`)
        res.writeHead(200)
        res.end(JSON.stringify({ sent: true, to, message }))
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  // Send by name (search contacts)
  if (url.pathname === '/send-by-name' && req.method === 'POST') {
    if (!isReady) { res.writeHead(503); res.end(JSON.stringify({ error: 'Not connected' })); return }
    let body = ''
    req.on('data', d => body += d)
    req.on('end', async () => {
      try {
        const { name, message } = JSON.parse(body)
        const contacts = await client.getContacts()
        const contact = contacts.find(c =>
          (c.name || c.pushname || '').toLowerCase().includes(name.toLowerCase())
        )
        if (!contact) { res.writeHead(404); res.end(JSON.stringify({ error: `Contact '${name}' not found` })); return }
        await client.sendMessage(contact.id._serialized, message)
        res.writeHead(200)
        res.end(JSON.stringify({ sent: true, to: contact.name || contact.pushname, message }))
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  // Get unread count
  if (url.pathname === '/unread') {
    if (!isReady) { res.writeHead(200); res.end(JSON.stringify({ count: 0 })); return }
    try {
      const chats = await client.getChats()
      const unread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
      res.writeHead(200)
      res.end(JSON.stringify({ count: unread }))
    } catch (e) {
      res.writeHead(200); res.end(JSON.stringify({ count: 0 }))
    }
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: 'Not found' }))
})

function notifyJarvis(event, data) {
  try {
    const payload = JSON.stringify({ event, data })
    const opts = {
      hostname: 'localhost', port: 8000,
      path: '/api/whatsapp/event',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': JARVIS_API_KEY }
    }
    const req = http.request(opts, () => {})
    req.on('error', () => {}) // ignore if backend is down
    req.write(payload)
    req.end()
  } catch (e) {}
}

server.listen(PORT, () => {
  console.log(`\n🤖 JARVIS WhatsApp Bridge running on http://localhost:${PORT}`)
  console.log('Connecting to WhatsApp...\n')
  initWhatsApp()
})

/* ==========================================================================
   Ein winziger WebSocket-Server für den Testlauf.
   Er spielt die Rolle des Teacher Soundboards, damit sich der Companion-Modus
   prüfen lässt, ohne dass das andere Programm installiert sein muss. Bewusst
   mit Bordmitteln von Node (net + crypto) und unabhängig von der
   Server-Umsetzung im Teacher Soundboard – so prüft der Test wirklich das
   Protokoll und nicht eine gemeinsame Bibliothek.
   ========================================================================== */
import net from 'node:net';
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PROTOCOL = 'bao-companion';
const VERSION = 1;

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

/** Serverrahmen: niemals maskiert. */
function encode(text, opcode = 0x1) {
  const data = Buffer.from(text, 'utf8');
  const head = [0x80 | opcode];
  if (data.length < 126) head.push(data.length);
  else if (data.length < 65536) head.push(126, data.length >> 8, data.length & 0xff);
  else throw new Error('So große Nachrichten braucht der Test nicht.');
  return Buffer.concat([Buffer.from(head), data]);
}

/** Clientrahmen: immer maskiert. Gibt [nachrichten, rest] zurück. */
function decode(buffer) {
  const out = [];
  let rest = buffer;
  for (;;) {
    if (rest.length < 2) break;
    const opcode = rest[0] & 0x0f;
    const masked = (rest[1] & 0x80) !== 0;
    let length = rest[1] & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (rest.length < 4) break;
      length = rest.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (rest.length < 10) break;
      length = Number(rest.readBigUInt64BE(2));
      offset = 10;
    }
    const maskLength = masked ? 4 : 0;
    if (rest.length < offset + maskLength + length) break;
    const mask = masked ? rest.slice(offset, offset + 4) : null;
    const payload = Buffer.from(rest.slice(offset + maskLength, offset + maskLength + length));
    if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    out.push({ opcode, masked, payload });
    rest = rest.slice(offset + maskLength + length);
  }
  return [out, rest];
}

export function startCompanionServer(options = {}) {
  const state = {
    messages: [],          // alles, was der Browser gesendet hat
    unmaskedSeen: false,   // muss falsch bleiben: Browser maskieren immer
    connections: 0,
    token: options.token || 'test-token',
    denyNext: options.denyNext || '',
    pendingDelay: 0,      // Rückfrage an die Lehrkraft nachstellen
    socket: null,
    commandId: 0
  };

  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let upgraded = false;

    socket.on('error', () => { /* abgebrochene Verbindungen sind hier normal */ });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (!upgraded) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buffer.slice(0, end).toString('latin1');
        buffer = buffer.slice(end + 4);
        const key = (head.match(/sec-websocket-key:\s*(\S+)/i) || [])[1];
        const origin = (head.match(/origin:\s*(\S+)/i) || [])[1] || '';
        if (!key) { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
        state.lastOrigin = origin;
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n'
          + 'Upgrade: websocket\r\nConnection: Upgrade\r\n'
          + `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`
        );
        upgraded = true;
        state.connections += 1;
      }

      const [frames, remainder] = decode(buffer);
      buffer = remainder;
      for (const frame of frames) {
        if (!frame.masked) state.unmaskedSeen = true;
        if (frame.opcode === 0x8) { socket.end(); return; }
        if (frame.opcode !== 0x1) continue;
        let message;
        try { message = JSON.parse(frame.payload.toString('utf8')); } catch { continue; }
        state.messages.push(message);

        if (message.type === 'hello') {
          if (state.denyNext) {
            socket.write(encode(JSON.stringify({
              protocol: PROTOCOL, v: VERSION, type: 'denied', reason: state.denyNext
            })));
            state.denyNext = '';
            socket.end();
            return;
          }
          if (state.socket && state.socket !== socket && !state.socket.destroyed) {
            state.socket.write(encode(JSON.stringify({
              protocol: PROTOCOL, v: VERSION, type: 'denied', reason: 'superseded'
            })));
            state.socket.end();
          }
          state.socket = socket;
          const welcome = () => {
            if (socket.destroyed) return;
            socket.write(encode(JSON.stringify({
              protocol: PROTOCOL, v: VERSION, type: 'welcome',
              app: 'teacher-soundboard', token: state.token, paired: true
            })));
          };
          if (state.pendingDelay) {
            // Wie eine echte Rückfrage: erst Bescheid geben, dann antworten.
            socket.write(encode(JSON.stringify({
              protocol: PROTOCOL, v: VERSION, type: 'pending', reason: 'pairing'
            })));
            const delay = state.pendingDelay;
            state.pendingDelay = 0;
            setTimeout(welcome, delay);
          } else {
            welcome();
          }
        }
      }
    });

    socket.on('close', () => { if (state.socket === socket) state.socket = null; });
  });

  const api = {
    get port() { return server.address() ? server.address().port : 0; },
    get messages() { return state.messages; },
    get connections() { return state.connections; },
    get unmaskedSeen() { return state.unmaskedSeen; },
    get connected() { return !!(state.socket && !state.socket.destroyed); },
    get lastOrigin() { return state.lastOrigin; },

    statuses() { return state.messages.filter((m) => m.type === 'status').map((m) => m.state); },
    results() { return state.messages.filter((m) => m.type === 'result'); },
    lastStatus() { const list = api.statuses(); return list[list.length - 1] || null; },

    /** Sendet eine geprüfte Nachricht des Protokolls. */
    send(type, fields = {}) {
      if (!api.connected) return false;
      state.socket.write(encode(JSON.stringify(
        Object.assign({ protocol: PROTOCOL, v: VERSION, type }, fields)
      )));
      return true;
    },

    /** Sendet beliebigen Text – für die Prüfung fehlerhafter Nachrichten. */
    sendRaw(text) {
      if (!api.connected) return false;
      state.socket.write(encode(text));
      return true;
    },

    command(name, args = {}) {
      state.commandId += 1;
      const id = 'c' + state.commandId;
      api.send('command', { id, name, args });
      return id;
    },

    denyNextHello(reason) { state.denyNext = reason; },
    askBeforeWelcome(milliseconds) { state.pendingDelay = milliseconds; },

    async waitFor(predicate, timeout = 5000, what = 'Nachricht', from = 0) {
      const started = Date.now();
      for (;;) {
        const hit = state.messages.slice(from).filter(predicate).pop();
        if (hit) return hit;
        if (Date.now() - started > timeout) throw new Error('Zeitüberschreitung: ' + what);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    },

    async waitForResult(id, timeout = 5000) {
      return api.waitFor((m) => m.type === 'result' && m.id === id, timeout, 'Antwort auf ' + id);
    },

    async waitForStatus(predicate, timeout = 5000, what = 'Status', from = 0) {
      return (await api.waitFor(
        (m) => m.type === 'status' && predicate(m.state), timeout, what, from
      )).state;
    },

    dropClient() {
      if (state.socket) { state.socket.destroy(); state.socket = null; }
    },

    clear() { state.messages.length = 0; },

    close() {
      api.dropClient();
      return new Promise((resolve) => server.close(resolve));
    }
  };

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(options.port || 0, '127.0.0.1', () => resolve(api));
  });
}

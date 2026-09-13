// Rota — member, leader, sound and wall screens. Plain JS, no build.
import { createApi, ApiError } from './api.js'

const params = new URLSearchParams(location.search)
const MOCK = params.get('mock') === '1'
const ROLES = ['lead guitar', 'rhythm guitar', 'bass', 'drums', 'keys', 'vocals 1', 'vocals 2', 'vocals 3', 'sound', 'projection']
const KEYS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']
const KIND = { am: 'Morning service', pm: 'Evening service', practice: 'Practice', special: 'Special service' }

let api
const $app = document.getElementById('app')
const $nav = document.getElementById('nav')
const $toast = document.getElementById('toast')

// ---------- tiny helpers ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'html') el.innerHTML = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)))
  return el
}
function fmtDate(iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', opts) }
function fmtTime(t) { if (!t) return ''; const [hh, mm] = t.split(':').map(Number); const ap = hh >= 12 ? 'pm' : 'am'; const h12 = hh % 12 || 12; return mm ? `${h12}:${String(mm).padStart(2, '0')}${ap}` : `${h12}${ap}` }
function serviceLine(s) { return [fmtTime(s.time), KIND[s.kind] || s.kind, s.title].filter(Boolean).join(' · ') }
let toastTimer
function toast(msg, kind = '') {
  $toast.textContent = msg; $toast.className = 'toast ' + kind; $toast.hidden = false; $toast.dataset.n = String((+$toast.dataset.n || 0) + 1)
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $toast.hidden = true }, kind === 'bad' ? 6000 : 2500)
}
function saySaved(msg = 'Saved') { toast(msg, 'good') }
function sayError(e) { toast(e instanceof ApiError ? e.message : 'Something went wrong. Try again.', 'bad'); if (!(e instanceof ApiError)) console.error(e) }
function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.label = btn.textContent; btn.textContent = 'Saving…' } else if (btn.dataset.label) { btn.textContent = btn.dataset.label } }
function remember(token) { try { localStorage.setItem('rotaToken', token) } catch {} }
function remembered() { try { return localStorage.getItem('rotaToken') } catch { return null } }
function hashFor(route) { return '#' + route }

// ---------- shared pieces ----------
function whoRows(s, meId) {
  return h('ul', { class: 'rows', 'data-service': s.id }, ROLES.map(r => {
    const slot = s.slots[r]
    return h('li', { 'data-role': r }, h('span', { class: 'role' }, r), slot
      ? h('span', { class: 'name' + (meId && slot.person_id === meId ? ' you' : '') }, slot.name + (meId && slot.person_id === meId ? ' (you)' : ''))
      : h('span', { class: 'name open' }, 'open'))
  }))
}
function setRows(s, withLinks) {
  if (!s.set.length) return h('p', { class: 'muted' }, 'No songs picked yet.')
  return h('ol', { class: 'set' }, s.set.map(e => h('li', {},
    h('span', { class: 'title' }, e.song.title, e.song.artist ? h('span', { class: 'artist' }, ' · ' + e.song.artist) : null,
      e.lead_name ? h('span', { class: 'artist' }, ' · led by ' + e.lead_name) : null,
      withLinks && (e.song.chart || e.song.video) ? h('span', { class: 'links' }, ' ', e.song.chart ? h('a', { href: e.song.chart, target: '_blank', rel: 'noopener' }, 'Chart') : null, e.song.video ? h('a', { href: e.song.video, target: '_blank', rel: 'noopener' }, 'Video') : null) : null),
    h('span', { class: 'key' }, e.key || '–'))))
}
function nextCard(s, { meId, kicker = 'Next service' } = {}) {
  if (!s) return h('div', { class: 'card next' }, h('div', { class: 'kicker' }, kicker), h('p', {}, 'Nothing on the rota yet.'))
  return h('section', { class: 'card next', 'data-service': s.id },
    h('div', { class: 'kicker' }, kicker),
    h('p', { class: 'when' }, fmtDate(s.date)),
    h('p', { class: 'sub' }, serviceLine(s)),
    s.notes ? h('p', {}, s.notes) : null,
    h('h3', {}, "Who's on"), whoRows(s, meId),
    h('h3', {}, 'Set list'), setRows(s, true))
}

// ---------- member ----------
async function renderMember(token) {
  api.setToken(token); remember(token)
  let data
  try { data = await api.get('/me') } catch (e) { return renderBadLink(e) }
  const me = data.person
  const away = new Set(data.away)
  const next = data.next
  const myRole = (s) => ROLES.find(r => s.slots[r] && s.slots[r].person_id === me.id)

  async function toggleAway(s, btn) {
    const on = !away.has(s.date)
    busy(btn, true)
    try {
      const res = on ? await api.put(`/me/away/${s.date}`) : await api.del(`/me/away/${s.date}`)
      let msg = on ? `Saved — you're away on ${fmtDate(s.date, { day: 'numeric', month: 'long' })}` : `Saved — you can do ${fmtDate(s.date, { day: 'numeric', month: 'long' })} again`
      if (res.unassigned && res.unassigned.length) msg += `. You've been taken off ${res.unassigned.map(u => u.split(' on ')[0]).join(', ')}.`
      await renderMember(token); saySaved(msg); return
    } catch (e) { sayError(e) }
    await renderMember(token)
  }

  const frag = []
  frag.push(h('h1', {}, `Hello ${me.name}`))
  if (!next) frag.push(nextCard(null))
  else {
    const isAway = away.has(next.date)
    const role = myRole(next)
    frag.push(h('section', { class: 'card next', 'data-service': next.id },
      h('div', { class: 'kicker' }, 'Next service'),
      h('p', { class: 'when' }, fmtDate(next.date)),
      h('p', { class: 'sub' }, serviceLine(next)),
      isAway ? h('p', { class: 'away-note', 'data-testid': 'away-note' }, "You're away that day.") : h('p', { 'data-testid': 'your-part' }, role ? `You're on ${role}.` : "You're not on for this one."),
      h('button', { class: 'btn big ' + (isAway ? 'away-on' : 'primary'), 'data-testid': 'away-toggle', 'aria-pressed': isAway ? 'true' : 'false', onclick: (ev) => toggleAway(next, ev.currentTarget) },
        isAway ? "You're away that day. Tap if you can make it after all" : "I'm away that day"),
      next.notes ? h('p', { class: 'small', style: 'margin-top:12px' }, next.notes) : null,
      h('h3', { style: 'margin-top:16px' }, "Who's on"), whoRows(next, me.id),
      h('h3', {}, 'Set list'), setRows(next, true)))
  }
  frag.push(h('section', { class: 'card' }, h('h2', {}, 'Coming up'),
    data.upcoming.length ? h('ul', { class: 'list', 'data-testid': 'upcoming' }, data.upcoming.map(s => {
      const isAway = away.has(s.date); const role = myRole(s)
      return h('li', { 'data-service': s.id },
        h('div', {}, h('div', {}, h('strong', {}, fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })), ' ', h('span', { class: 'muted' }, serviceLine(s))),
          h('div', { class: 'small ' + (isAway ? 'away' : role ? 'yours' : 'muted') }, isAway ? "You're away" : role ? `You're on ${role}` : 'Not on this one')),
        h('button', { class: 'btn small' + (isAway ? ' away-on' : ''), 'aria-pressed': isAway ? 'true' : 'false', onclick: (ev) => toggleAway(s, ev.currentTarget) }, isAway ? 'Away' : "I'm away"))
    })) : h('p', { class: 'muted' }, 'Nothing else on the rota yet.')))
  frag.push(deskNoteBox())
  frag.push(h('p', { class: 'muted small' }, 'This is your personal link. Keep it to yourself; anyone with it can mark you away.'))
  $app.replaceChildren(...frag)
}

function deskNoteBox() {
  const ta = h('textarea', { placeholder: 'e.g. kick mic crackling', 'aria-label': 'Note for the sound desk' })
  const btn = h('button', { class: 'btn primary', onclick: async () => {
    if (!ta.value.trim()) { toast('Write the note first.', 'bad'); ta.focus(); return }
    busy(btn, true)
    try { await api.post('/desk', { text: ta.value }); ta.value = ''; saySaved('Saved — the sound desk will see it') } catch (e) { sayError(e) }
    busy(btn, false)
  } }, 'Send to the sound desk')
  return h('section', { class: 'card' }, h('h2', {}, 'Leave a note for the sound desk'), ta, h('div', { class: 'btn-row' }, btn))
}

function renderBadLink(e) {
  $app.replaceChildren(h('section', { class: 'card' }, h('h1', {}, "That link didn't work"), h('p', {}, e instanceof ApiError ? e.message : 'Something went wrong. Try again.'), h('p', {}, h('a', { href: '#/' }, "See who's on next Sunday"))))
}

// ---------- leader ----------
async function renderLeader(token) {
  api.setToken(token); remember(token)
  let services, people, songs
  try { [services, people, songs] = await Promise.all([api.get('/services?limit=4'), api.get('/people'), api.get('/songs')]) } catch (e) { return renderBadLink(e) }
  $app.classList.add('wide')

  const frag = [h('h1', {}, 'Build the rota')]
  frag.push(addServiceCard())
  frag.push(h('div', { class: 'grid' }, services.map(s => serviceCard(s))))
  frag.push(songsCard())
  frag.push(teamCard())
  $app.replaceChildren(...frag)

  function refresh() { return renderLeader(token) }

  function serviceCard(s) {
    const card = h('section', { class: 'card', 'data-service': s.id, 'data-rev': s.rev },
      h('div', { class: 'kicker' }, KIND[s.kind] || s.kind),
      h('p', { class: 'when' }, fmtDate(s.date)),
      h('p', { class: 'sub' }, serviceLine(s)),
      s.away_names.length ? h('p', { class: 'small muted' }, 'Away that day: ' + s.away_names.join(', ')) : null,
      h('h3', {}, "Who's on — tap a slot to change it"),
      h('div', { class: 'chips' }, ROLES.map(r => {
        const slot = s.slots[r]
        return h('button', { class: 'chip' + (slot ? '' : ' open'), 'data-role': r, 'aria-label': `${r}: ${slot ? slot.name : 'open'}`, onclick: () => pickPerson(s, r) },
          h('span', { class: 'r' }, r), h('span', { class: 'n' }, slot ? slot.name : 'open'))
      })),
      h('h3', {}, 'Set list'), setBuilder(s))
    return card
  }

  function pickPerson(s, role) {
    const awayNames = new Set(s.away_names)
    const candidates = people.filter(p => p.roles.includes(role))
    const close = () => back.remove()
    const choose = async (pid) => {
      let ok = false
      try { await api.put(`/services/${s.id}/slots/${encodeURIComponent(role)}`, { rev: s.rev, person_id: pid }); ok = true }
      catch (e) { sayError(e) }
      close(); await refresh(); if (ok) saySaved()
    }
    const back = h('div', { class: 'sheet-back', onclick: (ev) => { if (ev.target === back) close() } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-label': `Who's on ${role}?` },
        h('h2', {}, `Who's on ${role}?`), h('p', { class: 'muted' }, fmtDate(s.date) + ' · ' + serviceLine(s)),
        candidates.length ? h('ul', { class: 'people' }, candidates.map(p => {
          const onOther = ROLES.find(r => r !== role && s.slots[r] && s.slots[r].person_id === p.id)
          if (awayNames.has(p.name)) return h('li', {}, h('div', { class: 'away-person', 'data-away': p.name }, h('span', {}, p.name), h('span', { class: 'tag' }, 'away that day')))
          const isHere = s.slots[role] && s.slots[role].person_id === p.id
          return h('li', {}, h('button', { onclick: () => choose(p.id) }, h('span', {}, p.name), h('span', { class: 'tag on' }, isHere ? 'on now' : onOther ? `also on ${onOther}` : '')))
        })) : h('p', { class: 'muted' }, `Nobody on the team plays ${role} yet. Add them under Team.`),
        h('div', { class: 'btn-row' },
          s.slots[role] ? h('button', { class: 'btn', onclick: () => choose(null) }, 'Leave it open') : null,
          h('button', { class: 'btn quiet', onclick: close }, 'Cancel'))))
    document.body.append(back)
  }

  function setBuilder(s) {
    const entries = s.set.map(e => ({ song_id: e.song.id, key: e.key, lead_person_id: null, note: e.note, title: e.song.title }))
    const saveSet = async () => {
      let ok = false
      try { await api.put(`/services/${s.id}/set`, { rev: s.rev, entries: entries.map(({ song_id, key, note }) => ({ song_id, key, note })) }); ok = true } catch (e) { sayError(e) }
      await refresh(); if (ok) saySaved()
    }
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= entries.length) return; [entries[i], entries[j]] = [entries[j], entries[i]]; saveSet() }
    const list = h('ol', { class: 'set', 'data-testid': 'set-builder' }, entries.map((e, i) => {
      const keySel = h('select', { 'aria-label': `Key for ${e.title}`, style: 'width:auto;min-width:5em', onchange: (ev) => { e.key = ev.target.value; saveSet() } },
        KEYS.includes(e.key) || !e.key ? null : h('option', { value: e.key }, e.key), h('option', { value: '' }, 'key?'), KEYS.map(k => h('option', { value: k, selected: k === e.key }, k)))
      const li = h('li', { draggable: 'true', 'data-song': e.song_id },
        h('span', { class: 'title' }, e.title),
        keySel,
        h('button', { class: 'btn icon small', 'aria-label': `Move ${e.title} up`, disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
        h('button', { class: 'btn icon small', 'aria-label': `Move ${e.title} down`, disabled: i === entries.length - 1, onclick: () => move(i, 1) }, '↓'),
        h('button', { class: 'btn icon small danger', 'aria-label': `Remove ${e.title}`, onclick: () => { entries.splice(i, 1); saveSet() } }, '×'))
      li.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', String(i)); ev.dataTransfer.effectAllowed = 'move' })
      li.addEventListener('dragover', (ev) => ev.preventDefault())
      li.addEventListener('drop', (ev) => { ev.preventDefault(); const from = +ev.dataTransfer.getData('text/plain'); if (Number.isNaN(from) || from === i) return; const [m] = entries.splice(from, 1); entries.splice(i, 0, m); saveSet() })
      return li
    }))
    const pick = h('select', { 'aria-label': 'Add a song' }, h('option', { value: '' }, 'Add a song…'), songs.map(sg => h('option', { value: sg.id }, `${sg.title}${sg.key ? ' (' + sg.key + ')' : ''}`)))
    const addBtn = h('button', { class: 'btn', onclick: () => { const sg = songs.find(x => x.id === pick.value); if (!sg) { toast('Pick a song first.', 'bad'); return } entries.push({ song_id: sg.id, key: sg.key || '', note: '', title: sg.title }); saveSet() } }, 'Add')
    return h('div', {}, entries.length ? list : h('p', { class: 'muted' }, 'No songs picked yet.'), h('div', { class: 'field-row' }, pick, h('div', { class: 'fixed' }, addBtn)))
  }

  function addServiceCard() {
    const date = h('input', { type: 'date', 'aria-label': 'Date', required: true })
    const time = h('input', { type: 'time', 'aria-label': 'Time', value: '11:00' })
    const kind = h('select', { 'aria-label': 'Kind' }, Object.entries(KIND).map(([k, v]) => h('option', { value: k }, v)))
    const title = h('input', { type: 'text', 'aria-label': 'Title (optional)', placeholder: 'Title (optional), e.g. Harvest' })
    const btn = h('button', { class: 'btn primary', onclick: async () => {
      if (!date.value) { toast('Pick a date for the service.', 'bad'); date.focus(); return }
      busy(btn, true)
      try { await api.post('/services', { date: date.value, time: time.value, kind: kind.value, title: title.value }); saySaved('Saved — service added'); await refresh(); return } catch (e) { sayError(e) }
      busy(btn, false)
    } }, 'Add service')
    return h('details', { class: 'card' }, h('summary', { style: 'cursor:pointer;font-weight:600;min-height:32px' }, 'Add a service'),
      h('div', { class: 'field-row', style: 'margin-top:8px' }, date, time), kind, title, h('div', { class: 'btn-row' }, btn))
  }

  function songsCard() {
    const f = { title: h('input', { type: 'text', placeholder: 'Title', 'aria-label': 'Song title' }), artist: h('input', { type: 'text', placeholder: 'Artist', 'aria-label': 'Artist' }),
      key: h('select', { 'aria-label': 'Key' }, h('option', { value: '' }, 'Key'), KEYS.map(k => h('option', { value: k }, k))), bpm: h('input', { type: 'number', placeholder: 'BPM', 'aria-label': 'BPM', min: 30, max: 300 }),
      chart: h('input', { type: 'url', placeholder: 'Chart link', 'aria-label': 'Chart link' }), video: h('input', { type: 'url', placeholder: 'Video link', 'aria-label': 'Video link' }) }
    const btn = h('button', { class: 'btn primary', onclick: async () => {
      if (!f.title.value.trim()) { toast('Give the song a title.', 'bad'); f.title.focus(); return }
      busy(btn, true)
      try { await api.post('/songs', { title: f.title.value.trim(), artist: f.artist.value, key: f.key.value, bpm: f.bpm.value ? +f.bpm.value : null, chart: f.chart.value, video: f.video.value }); saySaved('Saved — song added'); await refresh(); return } catch (e) { sayError(e) }
      busy(btn, false)
    } }, 'Add song')
    return h('details', { class: 'card' }, h('summary', { style: 'cursor:pointer;font-weight:600;min-height:32px' }, `Songs (${songs.length})`),
      h('ul', { class: 'list' }, songs.map(sg => h('li', {}, h('div', {}, h('strong', {}, sg.title), ' ', h('span', { class: 'muted' }, sg.artist), h('div', { class: 'small muted' }, [sg.key && `Key ${sg.key}`, sg.bpm && `${sg.bpm} BPM`, sg.last_used && `last used ${fmtDate(sg.last_used, { day: 'numeric', month: 'short' })}`].filter(Boolean).join(' · '), ' ',
        sg.chart ? h('a', { href: sg.chart, target: '_blank', rel: 'noopener' }, 'Chart') : null, ' ', sg.video ? h('a', { href: sg.video, target: '_blank', rel: 'noopener' }, 'Video') : null))))),
      h('h3', { style: 'margin-top:16px' }, 'Add a song'), h('div', { class: 'field-row' }, f.title, f.artist), h('div', { class: 'field-row' }, f.key, f.bpm), h('div', { class: 'field-row' }, f.chart, f.video), h('div', { class: 'btn-row' }, btn))
  }

  function teamCard() {
    const name = h('input', { type: 'text', placeholder: 'Name', 'aria-label': 'Name' })
    const phone = h('input', { type: 'text', placeholder: 'Phone (optional)', 'aria-label': 'Phone' })
    const boxes = ROLES.map(r => h('label', { style: 'display:inline-flex;gap:6px;align-items:center;margin:4px 12px 4px 0;font-weight:400;min-height:32px' }, h('input', { type: 'checkbox', value: r }), r))
    const btn = h('button', { class: 'btn primary', onclick: async () => {
      if (!name.value.trim()) { toast('Give the person a name.', 'bad'); name.focus(); return }
      const roles = boxes.map(l => l.querySelector('input')).filter(i => i.checked).map(i => i.value)
      busy(btn, true)
      try { await api.post('/people', { name: name.value.trim(), roles, phone: phone.value }); saySaved('Saved — added to the team'); await refresh(); return } catch (e) { sayError(e) }
      busy(btn, false)
    } }, 'Add to the team')
    const linkFor = (p) => `${location.origin}${location.pathname}${location.search}#/me/${p.token}`
    return h('details', { class: 'card' }, h('summary', { style: 'cursor:pointer;font-weight:600;min-height:32px' }, `Team (${people.length}) and their personal links`),
      h('ul', { class: 'list' }, people.map(p => h('li', {}, h('div', {}, h('strong', {}, p.name), h('div', { class: 'small muted' }, p.roles.join(', ') || 'no role yet', p.phone ? ' · ' + p.phone : '')),
        h('div', { class: 'btn-row' }, p.token ? h('button', { class: 'btn small', onclick: async (ev) => { try { await navigator.clipboard.writeText(linkFor(p)); toast('Link copied — send it to ' + p.name.split(' ')[0], 'good') } catch { prompt('Copy this link', linkFor(p)) } } }, 'Copy link') : null,
          h('button', { class: 'btn small danger', onclick: async () => { if (!confirm(`Remove ${p.name} from the team? Their slots will be left open.`)) return; try { await api.del(`/people/${p.id}`); saySaved('Saved — removed'); await refresh() } catch (e) { sayError(e) } } }, 'Remove'))))),
      h('h3', { style: 'margin-top:16px' }, 'Add someone'), h('div', { class: 'field-row' }, name, phone), h('div', {}, boxes), h('div', { class: 'btn-row' }, btn))
  }
}

// ---------- sound ----------
async function renderSound(token) {
  token = token || remembered()
  api.setToken(token)
  let canEdit = false, whoAmI = null
  if (token) {
    try { const me = await api.get('/me'); whoAmI = me.person; canEdit = me.person.roles.includes('sound') } catch (e) { if (e.status === 403) canEdit = true; else if (e.status === 401) { token = null; api.setToken(null) } }
  }
  let ch, notes
  try { [ch, notes] = await Promise.all([api.get('/channels'), api.get('/desk')]) } catch (e) { return renderBadLink(e) }
  $app.classList.add('wide')
  const rows = ch.channels.map(c => ({ ...c }))
  const inputsFor = (c, i) => canEdit
    ? [h('td', {}, h('input', { type: 'text', value: c.src, 'aria-label': `Channel ${c.ch} source`, oninput: (ev) => { c.src = ev.target.value } })),
       h('td', {}, h('input', { type: 'text', class: 'w-inp', value: c.inp, 'aria-label': `Channel ${c.ch} input`, oninput: (ev) => { c.inp = ev.target.value } })),
       h('td', {}, h('input', { type: 'text', value: c.note, 'aria-label': `Channel ${c.ch} note`, oninput: (ev) => { c.note = ev.target.value } }))]
    : [h('td', {}, c.src), h('td', { class: 'muted' }, c.inp), h('td', { class: 'muted' }, c.note)]
  const table = h('table', { class: 'channels' }, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Source'), h('th', {}, 'Input'), h('th', {}, 'Note'))),
    h('tbody', {}, rows.map((c, i) => h('tr', { 'data-ch': c.ch }, h('td', { class: 'n' }, c.ch), ...inputsFor(c, i)))))
  const saveBtn = canEdit ? h('button', { class: 'btn primary', onclick: async () => {
    busy(saveBtn, true)
    let ok = false
    try { await api.put('/channels', { rev: ch.rev, channels: rows }); ok = true } catch (e) { sayError(e) }
    await renderSound(token); if (ok) saySaved()
  } }, 'Save channels') : null
  const addBtn = canEdit ? h('button', { class: 'btn', onclick: () => { rows.push({ ch: rows.length + 1, src: '', inp: '', note: '' }); renderTable() } }, 'Add a channel') : null
  function renderTable() { const nb = table.querySelector('tbody'); nb.replaceChildren(...rows.map((c, i) => h('tr', { 'data-ch': c.ch }, h('td', { class: 'n' }, c.ch), ...inputsFor(c, i)))) }

  const noteList = h('ul', { class: 'list notes', 'data-testid': 'desk-notes' }, notes.length ? notes.map(n => h('li', { 'data-note': n.id },
    h('div', { class: 'note-row' }, h('div', {}, h('div', { class: n.resolved ? 'done' : '' }, n.text), h('div', { class: 'who' }, `${n.name} · ${new Date(n.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${n.resolved ? ' · sorted' : ''}`)),
      canEdit && !n.resolved ? h('button', { class: 'btn small', onclick: async (ev) => { busy(ev.currentTarget, true); let ok = false; try { await api.patch(`/desk/${n.id}`, { resolved: true }); ok = true } catch (e) { sayError(e) } await renderSound(token); if (ok) saySaved('Saved — marked as sorted') } }, 'Sorted') : null))) : h('li', { class: 'muted' }, 'No notes yet.'))

  $app.replaceChildren(
    h('h1', {}, 'Sound desk'),
    h('div', { class: 'grid' },
      h('section', { class: 'card' }, h('h2', {}, 'Channels'),
        canEdit ? h('p', { class: 'muted small' }, 'Change anything, then tap Save.') : h('p', { class: 'muted small' }, token ? 'Only the sound team or the leader can change the channel list.' : 'Open your personal link first if you need to change the channel list.'),
        h('div', { style: 'overflow-x:auto' }, table), h('div', { class: 'btn-row' }, saveBtn, addBtn)),
      h('section', { class: 'card' }, h('h2', {}, 'Desk notes'), h('p', { class: 'muted small' }, 'Things to fix or remember, from anyone on the team.'), noteList,
        token ? deskNoteBox() : h('p', { class: 'muted' }, 'Open your personal link to leave a note.'))))
}

// ---------- wall / public ----------
async function renderWall() {
  api.setToken(null)
  let s
  try { s = await api.get('/public/next') } catch (e) { return renderBadLink(e) }
  document.querySelector('.top').classList.add('hidden')
  $app.classList.add('wide')
  if (!s) { $app.replaceChildren(h('div', { class: 'wall' }, h('h1', {}, 'Nothing on the rota yet'))); return }
  $app.replaceChildren(h('div', { class: 'wall', 'data-service': s.id },
    h('p', { class: 'kicker', style: 'color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:.05em' }, 'Worship team · next service'),
    h('h1', {}, fmtDate(s.date)), h('p', { class: 'sub' }, serviceLine(s)),
    h('div', { class: 'cols' }, h('div', {}, h('h3', {}, "Who's on"), whoRows(s)), h('div', {}, h('h3', {}, 'Set list'), setRows(s, false))),
    h('p', { class: 'print-note' }, h('button', { class: 'btn', onclick: () => print() }, 'Print this'), ' ', h('a', { class: 'btn quiet', href: '#/' }, 'Back'))))
}

async function renderPublic() {
  api.setToken(null)
  let s
  try { s = await api.get('/public/next') } catch (e) { return renderBadLink(e) }
  $app.replaceChildren(h('h1', {}, "Who's on next"), nextCard(s),
    h('section', { class: 'card' }, h('p', {}, 'Got your personal link? Open it to see your part and mark when you\'re away.'),
      h('p', { class: 'muted small' }, 'No link yet? Ask Alexander.'),
      h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: '#/wall' }, 'Notice board view'), h('a', { class: 'btn', href: '#/sound' }, 'Sound desk'))))
}

// ---------- router ----------
async function route() {
  const hash = location.hash.replace(/^#\/?/, '')
  const [screen, arg] = hash.split('/')
  document.querySelector('.top').classList.remove('hidden')
  $app.classList.remove('wide')
  $app.replaceChildren(h('p', { class: 'muted' }, 'Loading…'))
  const links = [['Next service', '#/'], ['Sound desk', '#/sound'], ['Notice board', '#/wall']]
  $nav.replaceChildren(...links.map(([t, href]) => h('a', { href, class: location.hash === href || (href === '#/' && !screen) ? 'on' : '' }, t)))
  try {
    if (screen === 'me' && arg) await renderMember(arg)
    else if (screen === 'lead' && arg) await renderLeader(arg)
    else if (screen === 'sound') await renderSound(arg)
    else if (screen === 'wall') await renderWall()
    else await renderPublic()
  } catch (e) { sayError(e); console.error(e) }
  window.scrollTo(0, 0)
}

async function boot() {
  if (MOCK) { const m = await import('./api.mock.js'); api = m.createMockApi(); window.__rotaMock = api }
  else api = createApi()
  window.addEventListener('hashchange', route)
  await route()
}
boot()

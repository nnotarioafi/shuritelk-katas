import { BELTS } from './belts.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Minúsculas y sin acentos, para comparar "Marrón" con "marron".
const norm = (s) =>
  String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// "Naranja", "cinturón naranja" o "3" -> 3. Devuelve null si está vacío o no se reconoce.
export function beltFromText(value) {
  const t = norm(value)
  if (!t) return null
  if (/^\d+$/.test(t)) {
    const n = Number(t)
    return BELTS.some((b) => b.nivel === n) ? n : null
  }
  const found = BELTS.find((b) => norm(b.nombre) === t || norm(`cinturon ${b.nombre}`) === t)
  return found ? found.nivel : null
}

// Lee texto pegado desde Excel (tabuladores) o un CSV (; o ,), con comillas.
export function parseDelimited(text) {
  const clean = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (!clean) return []

  const firstLine = clean.split('\n')[0]
  const delimiter = ['\t', ';', ','].reduce(
    (best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best),
    ',',
  )

  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i++ } else { inQuotes = false }
      } else {
        cell += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delimiter) {
      row.push(cell); cell = ''
    } else if (c === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''
    } else {
      cell += c
    }
  }
  row.push(cell)
  rows.push(row)

  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''))
}

const HEADER_NAMES = {
  email: ['email', 'e-mail', 'correo', 'correo electronico', 'mail'],
  nombre: ['nombre', 'name', 'alumno'],
  nivel: ['cinturon', 'nivel', 'belt', 'grado'],
  baja: ['baja', 'borrar', 'eliminar', 'delete'],
}

// Cualquier marca de las de abajo en la columna "baja" significa "borrar a este alumno".
const BAJA_VALUES = ['baja', 'si', 'x', '1', 'true', 'yes', 'borrar', 'eliminar', 'delete']
const isBaja = (value) => BAJA_VALUES.includes(norm(value))

// Devuelve las filas de alumnos ya validadas (sin decidir aún si son nuevos o existentes).
// Orden por defecto de las columnas: correo, nombre, cinturón. Admite una fila de cabecera.
export function parseStudents(text) {
  const table = parseDelimited(text)
  if (table.length === 0) return []

  const headerCells = table[0].map(norm)
  const emailCol = headerCells.findIndex((h) => HEADER_NAMES.email.includes(h))
  const hasHeader = emailCol !== -1

  const col = { email: 0, nombre: 1, nivel: 2, baja: -1 }
  if (hasHeader) {
    col.email = emailCol
    const n = headerCells.findIndex((h) => HEADER_NAMES.nombre.includes(h))
    const b = headerCells.findIndex((h) => HEADER_NAMES.nivel.includes(h))
    col.nombre = n
    col.nivel = b
    col.baja = headerCells.findIndex((h) => HEADER_NAMES.baja.includes(h))
  }

  const seen = new Set()
  return table.slice(hasHeader ? 1 : 0).map((cells, i) => {
    const line = i + 1 + (hasHeader ? 1 : 0)
    const email = (cells[col.email] ?? '').trim().toLowerCase()
    const nombre = col.nombre >= 0 ? (cells[col.nombre] ?? '').trim() : ''
    const beltText = col.nivel >= 0 ? (cells[col.nivel] ?? '').trim() : ''
    const nivel = beltFromText(beltText)
    const baja = col.baja >= 0 && isBaja(cells[col.baja] ?? '')

    let error = null
    if (!EMAIL_RE.test(email)) error = 'Correo no válido'
    else if (seen.has(email)) error = 'Correo repetido en la lista'
    else if (!baja && beltText && nivel === null) error = `Cinturón no reconocido: «${beltText}»`
    seen.add(email)

    return { line, email, nombre, nivel, baja, error }
  })
}

// The rows "Add set" and "Add warm-up" put on an exercise, as pure functions mirroring the
// Workout screen's addSet / addWarmup (views/Workout.jsx), so the Apple Watch builds the same row
// (lib/apple-watch.js). The Watch can't run this: it is handed the next few rows per exercise in
// each snapshot (additionsFor) and sends the one it used back, so both sides stay identical.
import { modeOf, isPerSide, insertWarmupRow } from './history.js'
import { isSideSet, isWarmupRow, makeSideSet } from './workout-model.js'
import { weightIncrement, defaultIncrement } from './progression.js'

// The row(s) one "Add set" appends: usually one, two for a timed per-side hold (an L/R pair).
export function nextSetRows(entry) {
  const sets = entry.sets || []
  const target = entry.target || {}
  const l = sets[sets.length - 1]
  const cfg = { ...target, id: entry.id }
  const m = modeOf(cfg)
  if (m === 'cardio') return [{ min: l ? l.min : (target.min || 20), speed: l ? l.speed : (target.speed || 8), done: false }]
  if (m === 'time') {
    const sec = l ? l.sec : (target.sec || 45)
    const w = l ? (l.w || 0) : (target.weight || 0)
    // A timed per-side exercise is planned in pairs, so one more "set" is one more hold on each side.
    if (isPerSide(cfg)) return [{ sec, w, done: false, side: 'L' }, { sec, w, done: false, side: 'R' }]
    return [{ sec, w, done: false }]
  }
  // An extra set past a pyramid copies the last one's target, Max included.
  const row = { w: l ? l.w : 0, r: l ? l.r : target.reps, done: false, ...(l && l.max ? { max: true } : {}) }
  if (!isPerSide(cfg)) return [row]
  return [l && isSideSet(l) ? makeSideSet({ w: l.sides.L.w, r: (l.sides.L.r || 0) * 2 }) : makeSideSet(row)]
}

// The row one "Add warm-up set" inserts, ramped from the previous warm-up toward the first work set.
export function nextWarmupRow(S, entry) {
  const sets = entry.sets || []
  const target = entry.target || {}
  const cfg = { ...target, id: entry.id }
  const m = modeOf(cfg)
  const next = insertWarmupRow(sets, m, target, defaultIncrement(entry.id, S.unit))
  const at = sets.findIndex(x => !isWarmupRow(x))
  return next[at === -1 ? sets.length : at]
}

// What the Watch may add without asking the phone: the next `count` taps of each button, each
// built on the rows the previous tap added.
export function additionsFor(S, entry, count = 4) {
  const sets = []
  const warmups = []
  let rows = entry.sets || []
  for (let i = 0; i < count; i++) {
    const add = nextSetRows({ ...entry, sets: rows })
    sets.push(add)
    rows = rows.concat(add)
  }
  rows = entry.sets || []
  for (let i = 0; i < count; i++) {
    const row = nextWarmupRow(S, { ...entry, sets: rows })
    warmups.push(row)
    const at = rows.findIndex(x => !isWarmupRow(x))
    rows = rows.slice(); rows.splice(at === -1 ? rows.length : at, 0, row)
  }
  return { sets, warmups }
}

// The index a warm-up row lands at: where the work sets begin.
export const warmupIndex = sets => {
  const at = sets.findIndex(x => !isWarmupRow(x))
  return at === -1 ? sets.length : at
}

const num = v => Number.isFinite(Number(v)) && Number(v) >= 0
// Rows come from the Watch, so they are checked before they reach a session: only plain finite
// numbers and the flags a row of this kind carries, never done.
function cleanRow(row) {
  if (!row || typeof row !== 'object') return null
  const out = { done: false }
  for (const k of ['w', 'r', 'sec', 'min', 'speed']) if (row[k] != null) { if (!num(row[k])) return null; out[k] = Number(row[k]) }
  if (row.max === true) out.max = true
  if (row.side === 'L' || row.side === 'R') out.side = row.side
  if (row.phase === 'warmup' || row.warmup === true) { out.phase = 'warmup'; out.warmup = true }
  if (row.sides) {
    const side = k => {
      const s = row.sides[k]
      if (!s || !num(s.w) || !num(s.r)) return null
      return { ...s, w: Number(s.w), r: Number(s.r), done: false }
    }
    const L = side('L'), R = side('R')
    if (!L || !R) return null
    out.sides = { L, R }
    out.w = Math.max(L.w, R.w); out.r = L.r + R.r
  }
  return out
}

// A structural change from the Watch ({field:'addSet', rows} / {field:'addWarmup', row}) applied
// to an entry's rows; returns the new rows, or null when the change is not usable.
export function applyAddition(sets, change) {
  if (change.field === 'addSet') {
    const rows = Array.isArray(change.rows) ? change.rows.map(cleanRow) : []
    if (!rows.length || rows.length > 2 || rows.some(r => !r || isWarmupRow(r))) return null
    return sets.concat(rows)
  }
  if (change.field === 'addWarmup') {
    const row = cleanRow(change.row)
    if (!row || !isWarmupRow(row)) return null
    const next = sets.slice()
    next.splice(warmupIndex(sets), 0, row)
    return next
  }
  return null
}

// How the + and − on the Watch's weight editor move, the same as on the Workout screen: the
// exercise's own load step (heavy lower-body lifts jump more, lb jumps more than kg). Timed and
// cardio rows step 2.5.
export function weightStepFor(S, entry) {
  const cfg = { ...(entry.target || {}), id: entry.id }
  return { weightStep: modeOf(cfg) === 'reps' ? weightIncrement(cfg, S.unit) : 2.5 }
}

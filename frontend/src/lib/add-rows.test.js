import { describe, it, expect } from 'vitest'
import { nextSetRows, nextWarmupRow, additionsFor, applyAddition, warmupIndex, weightStepFor } from './add-rows.js'
import { isWarmupRow } from './workout-model.js'

const S = { unit: 'kg' }
const bench = () => ({ id: 'bench-press', target: { reps: 8, weight: 80 }, sets: [
  { w: 80, r: 8, done: true }, { w: 80, r: 8, done: false }] })

describe('nextSetRows', () => {
  it('copies the last set, not done', () => {
    expect(nextSetRows(bench())).toEqual([{ w: 80, r: 8, done: false }])
  })
  it('falls back to the plan on an empty exercise', () => {
    expect(nextSetRows({ id: 'bench-press', target: { reps: 8 }, sets: [] })).toEqual([{ w: 0, r: 8, done: false }])
  })
  it('keeps Max on the copy', () => {
    const e = bench(); e.sets[1].max = true
    expect(nextSetRows(e)[0].max).toBe(true)
  })
})

describe('nextWarmupRow', () => {
  it('is a warm-up, lighter than the first work set, not done', () => {
    const row = nextWarmupRow(S, bench())
    expect(isWarmupRow(row)).toBe(true)
    expect(row.done).toBe(false)
    expect(row.w).toBeLessThan(80)
    expect(row.r).toBe(8)
  })
  it('ramps up from the warm-up already there', () => {
    const e = bench()
    e.sets.splice(0, 0, nextWarmupRow(S, e))
    const second = nextWarmupRow(S, e)
    expect(second.w).toBeGreaterThanOrEqual(e.sets[0].w)
    expect(second.w).toBeLessThanOrEqual(80)
  })
})

describe('additionsFor', () => {
  it('lists the next taps, each built on the one before', () => {
    const { sets, warmups } = additionsFor(S, bench(), 3)
    expect(sets).toHaveLength(3)
    expect(warmups).toHaveLength(3)
    expect(warmups.every(isWarmupRow)).toBe(true)
    expect(warmups[1].w).toBeGreaterThanOrEqual(warmups[0].w)
  })
})

describe('applyAddition', () => {
  it('appends sets and inserts warm-ups where the work sets begin', () => {
    const e = bench()
    const withSet = applyAddition(e.sets, { field: 'addSet', rows: [{ w: 80, r: 8, done: true }] })
    expect(withSet).toHaveLength(3)
    expect(withSet[2].done).toBe(false)
    const warm = applyAddition(e.sets, { field: 'addWarmup', row: { w: 40, r: 8, phase: 'warmup', warmup: true } })
    expect(warm[0].w).toBe(40)
    expect(warmupIndex(e.sets)).toBe(0)
    expect(isWarmupRow(warm[0])).toBe(true)
  })
  it('rejects rows that are not usable', () => {
    const e = bench()
    expect(applyAddition(e.sets, { field: 'addSet', rows: [{ w: -1, r: 8 }] })).toBeNull()
    expect(applyAddition(e.sets, { field: 'addSet', rows: [{ w: 'x', r: 8 }] })).toBeNull()
    expect(applyAddition(e.sets, { field: 'addSet', rows: [] })).toBeNull()
    expect(applyAddition(e.sets, { field: 'addWarmup', row: { w: 40, r: 8 } })).toBeNull()
    expect(applyAddition(e.sets, { field: 'addSet', rows: [{ w: 40, r: 8, phase: 'warmup' }] })).toBeNull()
  })
})

describe('weightStepFor', () => {
  it('uses the exercise load step, in kg and lb', () => {
    const e = { id: 'bench-press', target: { reps: 8 }, sets: [] }
    expect(weightStepFor({ unit: 'kg' }, e).weightStep).toBeGreaterThanOrEqual(2.5)
    expect(weightStepFor({ unit: 'lb' }, e).weightStep).toBeGreaterThanOrEqual(5)
  })
  it('honours an exercise override and steps timed rows by 2.5', () => {
    expect(weightStepFor({ unit: 'kg' }, { id: 'bench-press', target: { reps: 8, inc: 1.25 }, sets: [] }).weightStep).toBe(1.25)
    expect(weightStepFor({ unit: 'kg' }, { id: 'plank', target: { mode: 'time', sec: 30 }, sets: [] }).weightStep).toBe(2.5)
  })
})

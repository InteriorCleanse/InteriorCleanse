import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addDays, billableDays, daysBetween, formatDate, formatRange, formatTime, isIsoDate, rangesOverlap, weekendFrom } from '../dates.ts'

describe('calendar arithmetic', () => {
  it('adds and diffs whole days across a month end', () => {
    assert.equal(addDays('2026-01-30', 3), '2026-02-02')
    assert.equal(daysBetween('2026-01-30', '2026-02-02'), 3)
    assert.equal(daysBetween('2026-02-02', '2026-01-30'), -3)
  })

  it('does not drift across the US DST change', () => {
    assert.equal(addDays('2026-03-07', 1), '2026-03-08')
    assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2)
  })

  it('validates ISO dates strictly', () => {
    assert.equal(isIsoDate('2026-02-29'), false)
    assert.equal(isIsoDate('2028-02-29'), true)
    assert.equal(isIsoDate('2026-2-9'), false)
    assert.equal(isIsoDate('nope'), false)
    assert.equal(isIsoDate(20260209), false)
  })
})

describe('billableDays', () => {
  it('rounds 24-hour blocks up from the pickup time', () => {
    assert.equal(billableDays('2026-10-02', '10:00', '2026-10-04', '10:00'), 2)
    assert.equal(billableDays('2026-10-02', '10:00', '2026-10-04', '14:00'), 3)
    assert.equal(billableDays('2026-10-02', '10:00', '2026-10-04', '09:30'), 2)
  })
  it('never bills less than one day, even for a reversed range', () => {
    assert.equal(billableDays('2026-10-02', '10:00', '2026-10-02', '12:00'), 1)
    assert.equal(billableDays('2026-10-04', '10:00', '2026-10-02', '10:00'), 1)
  })
})

describe('rangesOverlap', () => {
  it('treats ranges as inclusive', () => {
    assert.equal(rangesOverlap('2026-10-01', '2026-10-03', '2026-10-03', '2026-10-05'), true)
    assert.equal(rangesOverlap('2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05'), false)
    assert.equal(rangesOverlap('2026-10-04', '2026-10-05', '2026-10-01', '2026-10-03'), false)
  })
})

describe('weekendFrom', () => {
  it('finds the coming Saturday to Monday', () => {
    // 2026-09-30 is a Wednesday.
    assert.deepEqual(weekendFrom('2026-09-30'), { start: '2026-10-03', end: '2026-10-05' })
    // From a Saturday it goes to the next one, not today.
    assert.deepEqual(weekendFrom('2026-10-03'), { start: '2026-10-10', end: '2026-10-12' })
  })
})

describe('formatting', () => {
  it('formats dates, ranges and times for humans', () => {
    assert.equal(formatDate('2026-10-03'), 'Sat, Oct 3')
    assert.equal(formatDate('2026-10-03', true), 'Sat, Oct 3, 2026')
    assert.equal(formatRange('2026-12-30', '2027-01-02'), 'Wed, Dec 30, 2026 – Sat, Jan 2, 2027')
    assert.equal(formatTime('00:30'), '12:30 AM')
    assert.equal(formatTime('12:00'), '12:00 PM')
    assert.equal(formatTime('17:30'), '5:30 PM')
  })
})

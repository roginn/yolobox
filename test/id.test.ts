import { describe, it, expect } from 'vitest'
import { generateId, ADJECTIVES, NOUNS } from '../src/lib/id'

describe('generateId', () => {
  it('returns adjective-noun format', () => {
    const id = generateId(new Set())
    const parts = id.split('-')
    expect(parts).toHaveLength(2)
    expect(ADJECTIVES).toContain(parts[0])
    expect(NOUNS).toContain(parts[1])
  })

  it('avoids existing IDs', () => {
    const existing = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const id = generateId(existing)
      expect(existing.has(id)).toBe(false)
      existing.add(id)
    }
  })

  it('throws after max retries', () => {
    // Create a set with all possible combinations (mock with small lists)
    const allIds = new Set<string>()
    for (const adj of ADJECTIVES) {
      for (const noun of NOUNS) {
        allIds.add(`${adj}-${noun}`)
      }
    }
    expect(() => generateId(allIds)).toThrow('Could not generate a unique ID')
  })
})

describe('word lists', () => {
  it('has enough adjectives', () => {
    expect(ADJECTIVES.length).toBeGreaterThan(100)
  })

  it('has enough nouns', () => {
    expect(NOUNS.length).toBeGreaterThan(100)
  })

  it('has no duplicates in adjectives', () => {
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length)
  })

  it('has no duplicates in nouns', () => {
    expect(new Set(NOUNS).size).toBe(NOUNS.length)
  })
})

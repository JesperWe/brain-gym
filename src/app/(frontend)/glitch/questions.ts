import type { Question } from './types'

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const HARD_TABLES = new Set([6, 7, 8, 9])

// prettier-ignore
const TABLE_WEIGHTS: Record<number, number> = {
  2:  0.5,
  3:  1,
  4:  1,
  5:  1,
  6:  1.7,
  7:  1.7,
  8:  1.7,
  9:  1.7,
  10: 0.6,
  11: 0.6,
  12: 0.8,
};

function weightedRandInt(min: number, max: number): number {
  const values: number[] = []
  const weights: number[] = []
  for (let v = min; v <= max; v++) {
    values.push(v)
    weights.push(TABLE_WEIGHTS[v] ?? 1)
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * totalWeight
  for (let i = 0; i < values.length; i++) {
    r -= weights[i]
    if (r <= 0) return values[i]
  }
  return values[values.length - 1]
}

export function generateQuestion(): Question {
  const isMultiplication = Math.random() < 0.5

  let a: number
  let b: number
  let answer: number
  let isHardQuestion: boolean
  let type: 'multiplication' | 'division'

  if (isMultiplication) {
    a = weightedRandInt(2, 10)
    b = weightedRandInt(2, 12)
    answer = a * b
    type = 'multiplication'
    isHardQuestion = HARD_TABLES.has(a) && HARD_TABLES.has(b)
  } else {
    const divisor = weightedRandInt(2, 10)
    const quotient = weightedRandInt(2, 12)
    a = divisor * quotient // dividend
    b = divisor // divisor
    answer = quotient
    type = 'division'
    isHardQuestion = HARD_TABLES.has(divisor) && HARD_TABLES.has(quotient)
  }

  // Generate 5 wrong answers
  const wrongAnswers = new Set<number>()
  while (wrongAnswers.size < 5) {
    let wrong: number
    const strategy = Math.random()
    if (strategy < 0.5) {
      wrong = answer + randInt(-5, 5)
    } else if (strategy < 0.8) {
      wrong = answer + randInt(-10, 10)
    } else {
      wrong = randInt(1, 120)
    }
    if (wrong > 0 && wrong !== answer) {
      wrongAnswers.add(wrong)
    }
  }

  // Place correct answer at random position
  const options = Array.from(wrongAnswers)
  const correctPos = randInt(0, 5)
  options.splice(correctPos, 0, answer)

  return { a, b, type, answer, options, isHardQuestion }
}

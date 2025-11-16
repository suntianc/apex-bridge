interface RollSummary {
  rolls: number[];
  total: number;
  average: number;
  min: number;
  max: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rollDice(sides: number, count: number): RollSummary {
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.floor(Math.random() * sides) + 1;
    rolls.push(roll);
  }

  const total = rolls.reduce((sum, value) => sum + value, 0);
  const average = Number((total / rolls.length).toFixed(2));

  return {
    rolls,
    total,
    average,
    min: Math.min(...rolls),
    max: Math.max(...rolls)
  };
}

export async function execute(params: Record<string, unknown>): Promise<unknown> {
  const rawSides = typeof params.sides === 'number' ? params.sides : Number(params.sides);
  const rawCount = typeof params.count === 'number' ? params.count : Number(params.count);

  const sides = clamp(Number.isFinite(rawSides) ? rawSides : 6, 2, 100);
  const count = clamp(Number.isFinite(rawCount) ? rawCount : 1, 1, 10);

  const summary = rollDice(sides, count);
  return {
    success: true,
    summary,
    message: `掷骰结果: ${summary.rolls.join(', ')}`
  };
}
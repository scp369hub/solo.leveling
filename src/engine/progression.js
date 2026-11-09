export const ATTRIBUTE_KEYS = ['strength', 'endurance', 'agility', 'intelligence', 'awareness'];
export const ATTRIBUTE_LABELS = {
  strength: 'Strength',
  endurance: 'Endurance',
  agility: 'Agility',
  intelligence: 'Intelligence',
  awareness: 'Awareness',
};

export function xpToNextLevel(level) {
  return Math.floor(100 * Math.max(1, level) ** 1.5);
}

export function addXp(level, xp, earned) {
  let nextLevel = Math.max(1, level);
  let nextXp = Math.max(0, xp) + Math.max(0, earned);
  const levelsGained = [];
  while (nextXp >= xpToNextLevel(nextLevel)) {
    nextXp -= xpToNextLevel(nextLevel);
    nextLevel += 1;
    levelsGained.push(nextLevel);
  }
  return { level: nextLevel, xp: nextXp, levelsGained };
}

export function calculateOverall(attributes, weights = {}) {
  const values = ATTRIBUTE_KEYS.map((key) => ({
    key,
    level: Math.max(1, Number(attributes[key]?.level) || 1),
    weight: Math.max(0, Number(weights[key]) || 1),
  }));
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0) || values.length;
  const geometricMean = Math.exp(
    values.reduce((sum, item) => sum + item.weight * Math.log(item.level), 0) / totalWeight,
  );
  const level = Math.max(1, Math.floor(geometricMean));
  const nextLevel = level + 1;
  const limiting = values
    .filter(({ level: attributeLevel }) => attributeLevel < nextLevel)
    .sort((a, b) => a.level - b.level);
  return {
    level,
    progress: Math.max(0, Math.min(99, Math.floor(((geometricMean - level) / (nextLevel - level)) * 100))),
    geometricMean: Number(geometricMean.toFixed(3)),
    blockers: limiting.map(({ key, level: attributeLevel }) => ({
      key,
      current: attributeLevel,
      needed: nextLevel,
      message: `${ATTRIBUTE_LABELS[key]} is level ${attributeLevel}; level ${nextLevel} is needed to contribute to the next balanced level.`,
    })),
    contributors: values.map(({ key, level: attributeLevel }) => ({ key, level: attributeLevel })),
  };
}

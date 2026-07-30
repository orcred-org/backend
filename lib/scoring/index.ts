export const SCORE_CRITERIA = [
  { key: "technical_depth",  label: "Technical depth",  weight: 0.35 },
  { key: "communication",    label: "Communication",    weight: 0.25 },
  { key: "reproducibility",  label: "Reproducibility",  weight: 0.20 },
  { key: "problem_solving",  label: "Problem solving",  weight: 0.20 },
] as const;

export type CriterionKey = (typeof SCORE_CRITERIA)[number]["key"];

export interface CriterionRating {
  value: number;
  excluded: boolean;
}

export function ratingTo100(value: number): number {
  return Math.round(value * 20);
}

/** Weighted total 0–100; excluded criteria drop out and weights redistribute. */
export function computeWeightedTotal(ratings: Record<CriterionKey, CriterionRating>): number {
  let weightedSum = 0;
  let activeWeight = 0;

  for (const c of SCORE_CRITERIA) {
    const r = ratings[c.key];
    if (!r.excluded) {
      activeWeight += c.weight;
      weightedSum += ratingTo100(r.value) * c.weight;
    }
  }

  if (activeWeight === 0) return 0;
  return Math.round(weightedSum / activeWeight);
}

export function excludedKeys(ratings: Record<CriterionKey, CriterionRating>): CriterionKey[] {
  return SCORE_CRITERIA.filter((c) => ratings[c.key].excluded).map((c) => c.key);
}

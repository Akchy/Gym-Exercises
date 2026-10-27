export const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function toDisplayWeight(kg: number, units: 'kg' | 'lb'): number {
  return round(units === 'kg' ? kg : kgToLb(kg));
}

export function fromDisplayWeight(value: number, units: 'kg' | 'lb'): number {
  return units === 'kg' ? value : lbToKg(value);
}

export function formatWeight(kg: number, units: 'kg' | 'lb'): string {
  return `${toDisplayWeight(kg, units)} ${units}`;
}

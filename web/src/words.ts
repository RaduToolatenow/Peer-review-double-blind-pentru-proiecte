/** "1 criteriu", "6 criterii": Romanian singular and plural. */
export function criteriaCount(n: number): string {
  return n === 1 ? '1 criteriu' : `${n} criterii`;
}

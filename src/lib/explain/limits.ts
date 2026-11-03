/** How many independent model reads a project needs. */
export const LARGE_PROJECT_ITEMS = 60;

/**
 * Three reads give the confidence interval more to work with. A large project
 * spends too much of the request budget on judging, so it uses two.
 */
export function judgeRunCount(itemCount: number): number {
  return itemCount > LARGE_PROJECT_ITEMS ? 2 : 3;
}

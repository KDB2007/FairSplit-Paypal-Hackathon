/**
 * Small fetch wrapper for the integrations. Bounded by a timeout, and errors
 * are phrased for the UI — they never echo a URL, so a token passed as a query
 * parameter (Trello) cannot leak into a message.
 */

export const INTEGRATION_TIMEOUT_MS = 15_000;

export class IntegrationError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "IntegrationError";
    this.status = status;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchJson<T>(
  service: string,
  url: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = fetch
): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(INTEGRATION_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = (error as Error)?.name === "TimeoutError";
    throw new IntegrationError(
      timedOut ? `${service} did not respond in time.` : `Could not reach ${service}.`
    );
  }

  if (!res.ok) {
    if (res.status === 401) throw new IntegrationError(`${service} rejected the token.`, 401);
    if (res.status === 403 || res.status === 429) {
      throw new IntegrationError(`${service} denied access or rate-limited the request.`, res.status);
    }
    if (res.status === 404) throw new IntegrationError(`${service}: not found (check the id and token access).`, 404);
    throw new IntegrationError(`${service} returned an error (${res.status}).`, res.status);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new IntegrationError(`${service} returned an unreadable response.`);
  }
}

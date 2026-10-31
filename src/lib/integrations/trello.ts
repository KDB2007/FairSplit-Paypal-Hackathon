import type { SyncedItem } from "./types";
import { IntegrationError, fetchJson, type FetchLike } from "./http";

/**
 * Trello: cards sitting in a "Done" list, credited to every member on the
 * card. The mapper is pure so it can be tested against fixtures.
 */

export const TRELLO_API = "https://api.trello.com/1";
export const DEFAULT_DONE_PATTERN = "done|complete|shipped";
export const BOARD_ID_PATTERN = /^[a-zA-Z0-9]{8,24}$/;

export interface TrelloList {
  id: string;
  name: string;
}

export interface TrelloMember {
  id: string;
  username: string;
  fullName?: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  idList: string;
  idMembers: string[];
  dateLastActivity: string;
  shortUrl: string;
}

export interface TrelloBoard {
  lists: TrelloList[];
  members: TrelloMember[];
  cards: TrelloCard[];
}

/** Accepts a board id, short link, or a pasted https://trello.com/b/<shortLink>/... URL. */
export function parseBoardId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/trello\.com\/b\/([a-zA-Z0-9]+)/);
  const id = fromUrl ? fromUrl[1] : trimmed;
  return BOARD_ID_PATTERN.test(id) ? id : null;
}

/** Compile a user-supplied list-name pattern; fall back to the default if it is invalid. */
export function donePattern(pattern?: string): RegExp {
  try {
    return new RegExp(pattern?.trim() || DEFAULT_DONE_PATTERN, "i");
  } catch {
    return new RegExp(DEFAULT_DONE_PATTERN, "i");
  }
}

/** One item per (card, member) for cards in a Done list. Pure. */
export function mapTrelloCards(board: TrelloBoard, pattern?: string): SyncedItem[] {
  const matcher = donePattern(pattern);
  const doneLists = new Set(board.lists.filter((l) => matcher.test(l.name)).map((l) => l.id));
  const members = new Map(board.members.map((m) => [m.id, m]));
  const items: SyncedItem[] = [];

  for (const card of board.cards) {
    if (!doneLists.has(card.idList)) continue;
    const base = {
      type: "trello" as const,
      title: card.name,
      timestamp: card.dateLastActivity,
      evidenceUrl: card.shortUrl,
    };

    if (card.idMembers.length === 0) {
      // Nobody on the card: surface it in the unassigned tray rather than drop it.
      items.push({ ...base, sourceId: `card:${card.id}` });
      continue;
    }
    for (const memberId of card.idMembers) {
      const member = members.get(memberId);
      items.push({
        ...base,
        sourceId: `card:${card.id}:${memberId}`,
        externalAuthor: {
          source: "trello",
          id: memberId,
          label: member ? `@${member.username}` : memberId,
        },
      });
    }
  }

  return items;
}

export async function fetchTrelloBoard(
  boardId: string,
  options: { key: string; token: string; fetchImpl?: FetchLike }
): Promise<TrelloBoard> {
  if (!BOARD_ID_PATTERN.test(boardId)) throw new IntegrationError(`Invalid Trello board id "${boardId}".`);
  const auth = `key=${encodeURIComponent(options.key)}&token=${encodeURIComponent(options.token)}`;
  const board = `${TRELLO_API}/boards/${encodeURIComponent(boardId)}`;
  const get = <T>(path: string) => fetchJson<T>("Trello", `${board}/${path}&${auth}`, {}, options.fetchImpl);

  const [lists, members, cards] = await Promise.all([
    get<TrelloList[]>("lists?fields=name"),
    get<TrelloMember[]>("members?fields=username,fullName"),
    get<TrelloCard[]>("cards?filter=all&fields=name,idList,idMembers,dateLastActivity,shortUrl"),
  ]);
  return { lists, members, cards };
}

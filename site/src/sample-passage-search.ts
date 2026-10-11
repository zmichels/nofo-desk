import type { PassageSearchResult, ReadDocumentResult, SourcePassage } from './types';

const wordCharacter = '[\\p{L}\\p{N}_]';
const singleWordCharacter = /^[\p{L}\p{N}_]$/u;

function wordAwarePattern(value: string): RegExp {
  // Bound the search at whole words, including one-letter terms such as Phase I.
  const characters = Array.from(value);
  const first = characters[0] ?? '';
  const last = characters.at(-1) ?? '';
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const before = singleWordCharacter.test(first) ? `(?<!${wordCharacter})` : '';
  const after = singleWordCharacter.test(last) ? `(?!${wordCharacter})` : '';
  return new RegExp(`${before}${escaped}${after}`, 'iu');
}

// The published preview searches only its fictional blocks. The connected
// client delegates this work to the Desk API, which checks the listed file.
export function searchSamplePassages(
  reading: ReadDocumentResult,
  query: string,
  limit: number,
): PassageSearchResult {
  const phrase = query.trim();
  const words = phrase.match(/[\p{L}\p{N}_]+/gu) ?? [];
  if (phrase.length < 2 || phrase.length > 160 || !words.length) {
    throw new Error('Enter two or more searchable characters.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('Choose between one and ten passages.');
  }

  const exactPattern = wordAwarePattern(phrase);
  const wordPatterns = words.map(wordAwarePattern);
  const matches: { rank: number; order: number; passage: SourcePassage }[] = [];
  for (const [order, block] of reading.blocks.entries()) {
    const exact = exactPattern.test(block.text);
    if (!exact && !wordPatterns.every((pattern) => pattern.test(block.text))) continue;
    matches.push({
      rank: exact ? 0 : 1,
      order,
      passage: {
        blockId: block.id,
        locator: block.locator,
        matchKind: exact ? 'phrase' : 'all_words',
        text: block.text,
        truncated: false,
      },
    });
  }
  matches.sort((left, right) => left.rank - right.rank || left.order - right.order);

  return {
    query: phrase,
    matchCount: matches.length,
    returnedCount: Math.min(matches.length, limit),
    resultsTruncated: matches.length > limit,
    passages: matches.slice(0, limit).map((match) => match.passage),
    status: reading.status,
    warnings: reading.warnings,
    sourceVersion: reading.sourceVersion,
    sourceUrl: reading.sourceUrl,
    retrievedAt: reading.retrievedAt,
  };
}

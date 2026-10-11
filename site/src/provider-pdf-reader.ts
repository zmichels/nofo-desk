import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { SourceBlock } from './types.ts';

interface PdfLimits {
  maxPages: number;
  maxBlocks: number;
  maxCharacters: number;
  maxBlockCharacters: number;
}

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Extract native PDF text with page locations; scanned pages need separate OCR. */
export async function readPdf(bytes: Uint8Array, limits: PdfLimits): Promise<{
  blocks: SourceBlock[];
  pageCount: number;
  warnings: string[];
  partial: boolean;
}> {
  const task = pdfjs.getDocument({ data: bytes });
  const blocks: SourceBlock[] = [];
  const warnings: string[] = [
    'PDF text comes from its embedded text layer; images, form fields, and visual layout are not verified.',
  ];
  let partial = false;
  let pageCount = 0;
  let totalCharacters = 0;
  let textLimitReached = false;
  const deadline = Date.now() + 20_000;
  const beforeDeadline = async <T>(work: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        work,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('PDF reading timed out after 20 seconds.')),
            Math.max(1, deadline - Date.now()));
        }),
      ]);
    } finally {
      clearTimeout(timer!);
    }
  };
  try {
    const document = await beforeDeadline(task.promise);
    pageCount = document.numPages;
    if (pageCount > limits.maxPages) {
      partial = true;
      warnings.push(`Read only the first ${limits.maxPages} of ${pageCount} PDF pages.`);
    }
    for (let pageNumber = 1; pageNumber <= Math.min(pageCount, limits.maxPages); pageNumber++) {
      if (blocks.length >= limits.maxBlocks || totalCharacters >= limits.maxCharacters) {
        partial = true;
        warnings.push('Later PDF text was not read after the browser text limit.');
        break;
      }
      let content;
      try {
        const page = await beforeDeadline(document.getPage(pageNumber));
        content = await beforeDeadline(page.getTextContent());
      } catch (error) {
        if (error instanceof Error && error.message.includes('PDF reading timed out')) throw error;
        partial = true;
        warnings.push(`Page ${pageNumber} could not be read.`);
        continue;
      }
      let part = 1;
      let pending = '';
      let pageHasText = false;
      const flush = () => {
        const text = pending.replace(/\s+/g, ' ').trim();
        pending = '';
        if (!text) return;
        const remaining = limits.maxCharacters - totalCharacters;
        if (blocks.length >= limits.maxBlocks || remaining <= 0) {
          partial = true;
          textLimitReached = true;
          return;
        }
        const kept = text.slice(0, remaining).trim();
        blocks.push({
          id: `pdf-p${pageNumber}-t${part}`,
          locator: `page ${pageNumber}, text part ${part}`,
          text: kept,
        });
        totalCharacters += kept.length;
        if (kept.length < text.length) {
          partial = true;
          textLimitReached = true;
        }
        part++;
      };
      for (const item of content.items) {
        if (textLimitReached) break;
        if (!('str' in item)) continue;
        const fragment = item.str.replace(/\s+/g, ' ').trim();
        if (!fragment) continue;
        pageHasText = true;
        let remaining = fragment;
        while (remaining && !textLimitReached) {
          const room = limits.maxBlockCharacters - pending.length - (pending ? 1 : 0);
          if (room <= 0) {
            flush();
            continue;
          }
          const segment = remaining.slice(0, room);
          pending += (pending ? ' ' : '') + segment;
          remaining = remaining.slice(segment.length);
          if (remaining) flush();
        }
        if (item.hasEOL) flush();
      }
      if (!textLimitReached) flush();
      if (!pageHasText) {
        partial = true;
        warnings.push(`Page ${pageNumber} has no extractable text; OCR may be needed.`);
      }
      if (textLimitReached) {
        warnings.push('Later PDF text was not read after the browser text limit.');
        break;
      }
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (error instanceof Error && error.message.includes('PDF reading timed out')) throw error;
    if (name === 'PasswordException') {
      throw new Error('This PDF is password protected and was not read.');
    }
    throw new Error('This PDF could not be parsed in the browser.');
  } finally {
    // A worker shutdown error should not conceal the original parse error.
    await task.destroy().catch(() => {});
  }
  if (!blocks.length) warnings.push('No native PDF text was found; OCR may be needed.');
  return { blocks, pageCount, warnings: [...new Set(warnings)], partial };
}

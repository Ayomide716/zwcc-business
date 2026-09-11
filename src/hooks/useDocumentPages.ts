/**
 * The pages of a document, ready to display.
 *
 * An image is already its own page and needs nothing. A PDF has to be
 * rasterised first, which happens once on the server — so the first person to
 * open a PDF waits a few seconds and everyone after them does not.
 *
 * The rendering call is a mutation rather than part of the query, because it
 * writes: firing it from a query would re-render the same PDF on every refetch,
 * every reconnect and every screen focus.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { storageService, type PageImage } from '@/services/storage.service';

export interface DocumentPagesInput {
  id: string;
  applicant_id: string;
  storage_path: string;
  mime_type: string;
  page_count?: number | null;
  pages_error?: string | null;
}

export interface DocumentPagesResult {
  pages: PageImage[];
  /** The server is rasterising the PDF right now. */
  preparing: boolean;
  loading: boolean;
  /** Rendering will not succeed for this file — offer the download instead. */
  failed: boolean;
  error: unknown;
  retry: () => void;
}

function isPdf(document: DocumentPagesInput): boolean {
  return document.mime_type === 'application/pdf';
}

export function useDocumentPages(
  document: DocumentPagesInput | null,
  options: { enabled?: boolean } = {},
): DocumentPagesResult {
  const enabled = (options.enabled ?? true) && Boolean(document);
  const client = useQueryClient();
  const key = ['document-pages', document?.id];

  /**
   * An image needs no server round trip at all: it is one page, and the
   * original file is that page. Rendering a JPEG into a JPEG would double the
   * storage and the data for nothing.
   */
  const pages = useQuery({
    queryKey: key,
    enabled,
    queryFn: async (): Promise<PageImage[]> => {
      if (!document) return [];

      if (!isPdf(document)) {
        const url = await storageService.getDocumentUrl(document.storage_path);
        return [{ path: document.storage_path, url, page: 1 }];
      }

      return storageService.getDocumentPages(document.applicant_id, document.id);
    },
    // Signed URLs are short-lived and cheap to re-mint; the images behind them
    // are cached on disk by path, so a refetch costs one small request.
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  const render = useMutation({
    mutationFn: async () => {
      if (!document) return;
      const { data, error } = await supabase.functions.invoke('render-document', {
        body: { documentId: document.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (error) => logger.error('Could not prepare the document for viewing', error),
  });

  // A PDF with no pages on file has never been rendered, so ask for it once.
  const needsRender =
    enabled &&
    Boolean(document) &&
    isPdf(document!) &&
    !document!.pages_error &&
    pages.isSuccess &&
    pages.data.length === 0 &&
    !render.isPending &&
    !render.isSuccess &&
    !render.isError;

  useEffect(() => {
    if (needsRender) render.mutate();
    // `render` is stable enough for this: the guard above is what prevents a
    // second call, not the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsRender]);

  const failed = Boolean(document?.pages_error) || render.isError;

  return {
    pages: pages.data ?? [],
    preparing: render.isPending,
    loading: pages.isLoading,
    failed,
    error: pages.error ?? render.error,
    retry: () => {
      render.reset();
      void pages.refetch();
    },
  };
}

import { QueryClient } from '@tanstack/react-query';

// Module-level instance so it can be imported by non-component code
// (e.g. saveEditedBlock called from exercise_block).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,   // We control invalidation manually
      gcTime: 1000 * 60 * 60, // Keep unused cache for 1 hour
      retry: 1,
    },
  },
});

// Tracks which date ranges the home screen has prefetched.
// Kept here so restore can clear it alongside the query cache.
export const prefetchedRanges = new Set<string>();

export function clearAllCaches() {
  queryClient.clear();
  prefetchedRanges.clear();
}

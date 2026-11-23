import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import { useToast } from '../lib/ui';

/** Reference data (branches, equipment types, parts, users, settings). */
export function useReference() {
  return useQuery({ queryKey: ['ref'], queryFn: () => api.ref.all(), staleTime: 60_000 });
}

export function useRefLookups() {
  const { data } = useReference();
  return {
    ref: data,
    branchName: (c?: string) => data?.branches.find((b) => b.code === c)?.name ?? c ?? '—',
    eqName: (c?: string) => data?.equipmentTypes.find((e) => e.code === c)?.name ?? c ?? '—',
    userName: (id?: string) => data?.users.find((u) => u.userId === id)?.name ?? id ?? '—',
    clientName: (c?: string) => data?.clients.find((x) => x.clientCode === c)?.clientName ?? c ?? '—',
    branchOptions: (data?.branches ?? []).filter((b) => !b.isHeadOffice).map((b) => ({ value: b.code, label: `${b.code} — ${b.name}` })),
    eqOptions: (data?.equipmentTypes ?? []).map((e) => ({ value: e.code, label: e.name })),
    clientOptions: (data?.clients ?? []).map((c) => ({ value: c.clientCode, label: `${c.clientCode} — ${c.clientName}` })),
    setting: (k: string) => data?.settings[k],
  };
}

export function useData<T>(key: QueryKey, fn: () => Promise<T>, enabled = true) {
  return useQuery({ queryKey: key, queryFn: fn, enabled });
}

/** Mutation with toast feedback; invalidates everything (the mock DB is shared by all screens). */
export function useAction<V, R>(fn: (v: V) => Promise<R>, opts: { success?: string | ((r: R) => string); onSuccess?: (r: R) => void; silent?: boolean } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries();
      if (!opts.silent && opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong', e instanceof ApiError ? e.code : undefined),
  });
}

export const fieldError = (err: unknown, field: string) => (err instanceof ApiError ? err.fields?.[field] : undefined);
export const errMessage = (err: unknown) => (err instanceof ApiError ? err.message : err ? String(err) : undefined);

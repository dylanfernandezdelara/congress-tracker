import { type DependencyList, useEffect, useState } from 'react'

export type UseAsyncDataResult<T> = {
  data: T | null
  error: string | null
  isLoading: boolean
}

type UseAsyncDataOptions<T> = {
  deps: DependencyList
  load: () => Promise<T>
  mapError: (err: unknown) => string
  validate?: () => string | null
}

export function useAsyncData<T>({
  deps,
  load,
  mapError,
  validate,
}: UseAsyncDataOptions<T>): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function run() {
      // Refetch keeps prior `data` until a new result arrives; gate UI on `isLoading`.
      setIsLoading(true)
      setError(null)

      const validationError = validate?.() ?? null
      if (validationError) {
        if (!cancelled) {
          setData(null)
          setError(validationError)
          setIsLoading(false)
        }
        return
      }

      try {
        const result = await load()
        if (cancelled) return
        setData(result)
      } catch (err) {
        if (cancelled) return
        setData(null)
        setError(mapError(err))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies explicit deps
  }, deps)

  return { data, error, isLoading }
}

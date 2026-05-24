import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isE2eMode } from '../utils/e2eMode'

export function useE2eMode(): boolean {
  const [searchParams] = useSearchParams()
  return useMemo(() => isE2eMode(searchParams.toString()), [searchParams])
}

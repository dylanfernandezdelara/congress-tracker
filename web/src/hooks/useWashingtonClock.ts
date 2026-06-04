import { useEffect, useMemo, useState } from 'react'
import {
  formatCalendarDate,
  formatWashingtonDate,
  formatWashingtonTime,
  localIsoDate,
} from '../utils/homeClock'

export function useWashingtonClock(harnessNow: Date | null) {
  const [currentDate, setCurrentDate] = useState(() => harnessNow ?? new Date())
  const [dcNow, setDcNow] = useState(() => harnessNow ?? new Date())

  useEffect(() => {
    if (harnessNow) return
    const intervalId = window.setInterval(() => {
      setCurrentDate((previousDate) => {
        const nextDate = new Date()
        return localIsoDate(previousDate) === localIsoDate(nextDate) ? previousDate : nextDate
      })
    }, 60_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [harnessNow])

  useEffect(() => {
    if (harnessNow) return
    const intervalId = window.setInterval(() => {
      setDcNow(new Date())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [harnessNow])

  const todayDate = useMemo(() => localIsoDate(currentDate), [currentDate])
  const todayLabel = useMemo(() => formatCalendarDate(currentDate), [currentDate])
  const dcTimeLabel = useMemo(() => formatWashingtonTime(dcNow), [dcNow])
  const dcDateLabel = useMemo(() => formatWashingtonDate(dcNow), [dcNow])

  return { todayDate, todayLabel, dcTimeLabel, dcDateLabel }
}

import React, { useEffect, useRef } from 'react'
import './progress.css'

const Progress: React.FC<React.PropsWithChildren<{
  percent?: number
}>> = props => {
  const { percent = 0 } = props
  const rateRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (rateRef.current) {
      rateRef.current.style.width = `${3 * percent}px`
    }
  }, [percent])

  return (
    <div className='update-progress'>
      <div className='update-progress-pr'>
        <div ref={rateRef} className='update-progress-rate' />
      </div>
      <span className='update-progress-num'>{(percent ?? 0).toString().substring(0, 4)}%</span>
    </div>
  )
}

export default Progress

import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BoxGeometry, InstancedMesh, Object3D } from 'three'

import type { PartySeatCount } from '../api/types'
import { useDocumentTheme } from '../hooks/useDocumentTheme'
import { partyColor } from '../utils/chamberPartyColors'
import {
  groupSeatsByParty,
  layoutHorseshoeSeats,
  type SeatCell,
} from '../utils/chamberSeatLayout'

const SEAT_WIDTH = 0.092
const SEAT_HEIGHT = 0.028
const SEAT_DEPTH = 0.062
/** Back: thin slab at rear-left corner of cushion — reads as L from plan view, not a centered T. */
const BACK_WIDTH = 0.036
const BACK_HEIGHT = 0.094
const BACK_DEPTH = 0.016

const SEAT_GEOMETRY = new BoxGeometry(SEAT_WIDTH, SEAT_HEIGHT, SEAT_DEPTH)
const BACK_GEOMETRY = new BoxGeometry(BACK_WIDTH, BACK_HEIGHT, BACK_DEPTH)

/** Back outer-left corner meets seat top-left/rear edge. */
const BACK_LOCAL_X = -SEAT_WIDTH / 2 + BACK_WIDTH / 2
const BACK_LOCAL_Y = SEAT_HEIGHT / 2 + BACK_HEIGHT / 2
const BACK_LOCAL_Z = -SEAT_DEPTH / 2 - BACK_DEPTH / 2 + 0.004

const dummy = new Object3D()
const backOffset = new Object3D()

type InstancedChairPartsProps = {
  cells: SeatCell[]
  color: string
}

function InstancedChairParts({ cells, color }: InstancedChairPartsProps) {
  const seatRef = useRef<InstancedMesh>(null)
  const backRef = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    const seatMesh = seatRef.current
    const backMesh = backRef.current
    if (!seatMesh || !backMesh || cells.length === 0) return

    cells.forEach((cell, index) => {
      dummy.position.set(cell.x * 1.16, cell.y, cell.z * 1.1)
      dummy.rotation.set(-0.42, cell.angle - Math.PI / 2, 0)
      dummy.updateMatrix()
      seatMesh.setMatrixAt(index, dummy.matrix)

      backOffset.copy(dummy)
      backOffset.translateX(BACK_LOCAL_X)
      backOffset.translateY(BACK_LOCAL_Y)
      backOffset.translateZ(BACK_LOCAL_Z)
      backOffset.updateMatrix()
      backMesh.setMatrixAt(index, backOffset.matrix)
    })

    seatMesh.instanceMatrix.needsUpdate = true
    backMesh.instanceMatrix.needsUpdate = true
    invalidate()
  }, [cells, invalidate])

  if (cells.length === 0) return null

  const material = (
    <meshStandardMaterial color={color} roughness={0.5} metalness={0.06} />
  )

  return (
    <>
      <instancedMesh
        ref={seatRef}
        args={[SEAT_GEOMETRY, undefined, cells.length]}
        frustumCulled={false}
      >
        {material}
      </instancedMesh>
      <instancedMesh
        ref={backRef}
        args={[BACK_GEOMETRY, undefined, cells.length]}
        frustumCulled={false}
      >
        {material}
      </instancedMesh>
    </>
  )
}

type ChamberSceneProps = {
  chamber: 'House' | 'Senate'
  seats: PartySeatCount[]
  dark: boolean
}

function ChamberScene({ chamber, seats, dark }: ChamberSceneProps) {
  const cells = useMemo(() => layoutHorseshoeSeats(chamber, seats), [chamber, seats])
  const groups = useMemo(() => groupSeatsByParty(cells), [cells])

  return (
    <>
      <ambientLight intensity={dark ? 0.9 : 1.1} />
      <directionalLight position={[2.5, 5, 3.5]} intensity={dark ? 0.7 : 0.9} />
      <directionalLight position={[-2.5, 3, 2]} intensity={0.3} />
      {[...groups.entries()].map(([party, partyCells]) => (
        <InstancedChairParts key={party} cells={partyCells} color={partyColor(party, dark)} />
      ))}
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableRotate={false}
        target={[0, 0.24, -0.46]}
      />
    </>
  )
}

type ChamberSeatDiagram3DProps = {
  chamber: 'House' | 'Senate'
  seats: PartySeatCount[]
  ariaLabel: string
}

export function ChamberSeatDiagram3D({ chamber, seats, ariaLabel }: ChamberSeatDiagram3DProps) {
  const theme = useDocumentTheme()
  const dark = theme === 'dark'

  return (
    <div className="chamber-diagram-3d-wrap" role="img" aria-label={ariaLabel}>
      <Canvas
        className="chamber-diagram-3d"
        camera={{ position: [0, 0.84, 0.92], fov: 39, near: 0.05, far: 30 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      >
        <ChamberScene chamber={chamber} seats={seats} dark={dark} />
      </Canvas>
    </div>
  )
}

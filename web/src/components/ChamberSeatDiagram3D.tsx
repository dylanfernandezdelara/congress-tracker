import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BoxGeometry, InstancedMesh, Object3D } from 'three'

import type { PartySeatCount } from '../api/types'
import { useDocumentTheme } from '../hooks/useDocumentTheme'
import { partySeatColor } from '../utils/chamberPartyColors'
import {
  groupSeatsByParty,
  layoutHorseshoeSeats,
  type SeatCell,
} from '../utils/chamberSeatLayout'

const CHAIR_SCALE: Record<'House' | 'Senate', number> = {
  House: 1,
  Senate: 1.55,
}

const SEAT_WIDTH = 0.092
const SEAT_HEIGHT = 0.028
const SEAT_DEPTH = 0.062
const BACK_WIDTH = 0.036
const BACK_HEIGHT = 0.094
const BACK_DEPTH = 0.016

const SEAT_GEOMETRY = new BoxGeometry(SEAT_WIDTH, SEAT_HEIGHT, SEAT_DEPTH)
const BACK_GEOMETRY = new BoxGeometry(BACK_WIDTH, BACK_HEIGHT, BACK_DEPTH)

const BACK_LOCAL_X = -SEAT_WIDTH / 2 + BACK_WIDTH / 2
const BACK_LOCAL_Y = SEAT_HEIGHT / 2 + BACK_HEIGHT / 2
const BACK_LOCAL_Z = -SEAT_DEPTH / 2 - BACK_DEPTH / 2 + 0.004

const dummy = new Object3D()
const backOffset = new Object3D()

type InstancedChairPartsProps = {
  cells: SeatCell[]
  color: string
  scale: number
}

function InstancedChairParts({ cells, color, scale }: InstancedChairPartsProps) {
  const seatRef = useRef<InstancedMesh>(null)
  const backRef = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    const seatMesh = seatRef.current
    const backMesh = backRef.current
    if (!seatMesh || !backMesh || cells.length === 0) return

    cells.forEach((cell, index) => {
      dummy.position.set(cell.x * 1.22 * scale, cell.y, cell.z * 1.18 * scale)
      dummy.rotation.set(-0.48, cell.angle - Math.PI / 2, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      seatMesh.setMatrixAt(index, dummy.matrix)

      backOffset.copy(dummy)
      backOffset.translateX(BACK_LOCAL_X * scale)
      backOffset.translateY(BACK_LOCAL_Y * scale)
      backOffset.translateZ(BACK_LOCAL_Z * scale)
      backOffset.updateMatrix()
      backMesh.setMatrixAt(index, backOffset.matrix)
    })

    seatMesh.instanceMatrix.needsUpdate = true
    backMesh.instanceMatrix.needsUpdate = true
    invalidate()
  }, [cells, invalidate, scale])

  if (cells.length === 0) return null

  const material = (
    <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
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
  seatParties?: string[] | null
}

function ChamberScene({ chamber, seats, seatParties }: ChamberSceneProps) {
  const theme = useDocumentTheme()
  const cells = useMemo(
    () => layoutHorseshoeSeats(chamber, seats, seatParties),
    [chamber, seats, seatParties]
  )
  const groups = useMemo(() => groupSeatsByParty(cells), [cells])
  const scale = CHAIR_SCALE[chamber]

  return (
    <>
      <ambientLight intensity={1.05} />
      <directionalLight position={[2.8, 6, 4]} intensity={1} />
      <directionalLight position={[-2.2, 3.5, 2.5]} intensity={0.35} />
      {[...groups.entries()].map(([party, partyCells]) => (
        <InstancedChairParts
          key={party}
          cells={partyCells}
          color={partySeatColor(party, theme)}
          scale={scale}
        />
      ))}
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableRotate={false}
        target={[0, 0.18, -0.42]}
      />
    </>
  )
}

type ChamberSeatDiagram3DProps = {
  chamber: 'House' | 'Senate'
  seats: PartySeatCount[]
  seatParties?: string[] | null
  ariaLabel: string
}

export function ChamberSeatDiagram3D({
  chamber,
  seats,
  seatParties,
  ariaLabel,
}: ChamberSeatDiagram3DProps) {
  const chamberClass =
    chamber === 'House' ? 'chamber-diagram-3d--house' : 'chamber-diagram-3d--senate'

  return (
    <div className={`chamber-diagram-3d-wrap ${chamberClass}`} role="img" aria-label={ariaLabel}>
      <Canvas
        className={`chamber-diagram-3d ${chamberClass}`}
        camera={{ position: [0, 0.95, 0.88], fov: 42, near: 0.05, far: 30 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      >
        <ChamberScene chamber={chamber} seats={seats} seatParties={seatParties} />
      </Canvas>
    </div>
  )
}

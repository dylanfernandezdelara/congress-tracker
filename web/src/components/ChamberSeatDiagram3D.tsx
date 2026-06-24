import { Bounds, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Object3D } from 'three'

import type { PartySeatCount } from '../api/types'
import { useDocumentTheme } from '../hooks/useDocumentTheme'
import {
  buildChamberHemicycle,
  hemicycleSeatsTo3D,
  type Seat3DCell,
} from '../utils/chamberHemicycle'
import { partySeatColor } from '../utils/chamberPartyColors'

const SPHERE_SEGMENTS = 10
const dummy = new Object3D()

type InstancedSpheresProps = {
  cells: Seat3DCell[]
  color: string
}

function InstancedSpheres({ cells, color }: InstancedSpheresProps) {
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || cells.length === 0) return

    cells.forEach((cell, index) => {
      dummy.position.set(cell.x, cell.y, cell.z)
      dummy.scale.setScalar(cell.radius / 0.025)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [cells])

  if (cells.length === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, cells.length]} frustumCulled={false}>
      <sphereGeometry args={[0.025, SPHERE_SEGMENTS, SPHERE_SEGMENTS]} />
      <meshStandardMaterial color={color} roughness={0.35} metalness={0.12} />
    </instancedMesh>
  )
}

type ChamberSceneProps = {
  chamber: 'House' | 'Senate'
  seats: PartySeatCount[]
  seatParties?: string[] | null
}

function ChamberScene({ chamber, seats, seatParties }: ChamberSceneProps) {
  const theme = useDocumentTheme()
  const cells = useMemo(() => {
    const built = buildChamberHemicycle(chamber, seats, seatParties, theme)
    return hemicycleSeatsTo3D(chamber, built.seats)
  }, [chamber, seats, seatParties, theme])

  const groups = useMemo(() => {
    const map = new Map<string, Seat3DCell[]>()
    for (const cell of cells) {
      const list = map.get(cell.party) ?? []
      list.push(cell)
      map.set(cell.party, list)
    }
    return map
  }, [cells])

  return (
    <>
      <ambientLight intensity={0.95} />
      <directionalLight position={[1.5, 4, 2.5]} intensity={0.85} />
      <directionalLight position={[-1.2, 2, 1.5]} intensity={0.25} />
      {[...groups.entries()].map(([party, partyCells]) => (
        <InstancedSpheres key={party} cells={partyCells} color={partySeatColor(party, theme)} />
      ))}
      <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
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
        orthographic
        camera={{ position: [0, 0.55, 1.4], zoom: 95, near: 0.01, far: 20 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      >
        <Bounds fit observe margin={1.35}>
          <ChamberScene chamber={chamber} seats={seats} seatParties={seatParties} />
        </Bounds>
      </Canvas>
    </div>
  )
}

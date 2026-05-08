import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'

const statusConfig = {
  normal: { color: '#10b981', label: 'RUNNING', running: true, factor: 1 },
  warning: { color: '#f59e0b', label: 'HIGH LOAD', running: true, factor: 0.82 },
  danger: { color: '#ef4444', label: 'TRIPPED', running: false, factor: 0 },
  offline: { color: '#64748b', label: 'OFFLINE', running: false, factor: 0 }
}

function getTelemetry(status, data, isLive) {
  if (!isLive) {
    return {
      targetRpm: 0,
      vibration: 0,
      blurOpacity: 0,
      airflowOpacity: 0
    }
  }

  const cfg = statusConfig[status] || statusConfig.offline
  const current = Number.isFinite(data?.current) ? data.current : 0.35
  const temperature = Number.isFinite(data?.temperature) ? data.temperature : 32

  if (!cfg.running) {
    return {
      targetRpm: 0,
      vibration: 0.0018,
      blurOpacity: 0,
      airflowOpacity: 0.05
    }
  }

  const load = THREE.MathUtils.clamp(current / 3.0, 0.22, 1.35)
  const thermalDrag = THREE.MathUtils.clamp(1 - Math.max(temperature - 55, 0) / 110, 0.68, 1)
  const targetRpm = (950 + load * 2650) * thermalDrag * cfg.factor
  const vibration = THREE.MathUtils.clamp(0.003 + load * 0.012 + (status === 'warning' ? 0.006 : 0), 0.003, 0.022)

  return {
    targetRpm,
    vibration,
    blurOpacity: THREE.MathUtils.clamp((targetRpm - 900) / 2200, 0, 0.78),
    airflowOpacity: THREE.MathUtils.clamp((targetRpm - 650) / 2600, 0.1, 0.65)
  }
}

function MotorAssembly({ status, data, isLive }) {
  const motorRef = useRef()
  const shaftRef = useRef()
  const blurDiskMatRef = useRef()
  const airflowOuterMatRef = useRef()
  const airflowInnerMatRef = useRef()
  const airflowGroupRef = useRef()
  const rpmRef = useRef(0)
  const accelRef = useRef(0)
  const blurRef = useRef(0)
  const cfg = statusConfig[status] || statusConfig.offline

  useFrame((state, delta) => {
    const telemetry = getTelemetry(status, data, isLive)
    const targetRpm = telemetry.targetRpm
    const rpmDelta = targetRpm - rpmRef.current
    const accel = THREE.MathUtils.clamp(rpmDelta * 0.0018, -22, 22)
    accelRef.current = THREE.MathUtils.lerp(accelRef.current, accel, 0.12)
    rpmRef.current = THREE.MathUtils.clamp(rpmRef.current + accelRef.current, 0, 3600)
    if (!isLive) {
      rpmRef.current = THREE.MathUtils.lerp(rpmRef.current, 0, 0.35)
    }

    const rotationStep = (rpmRef.current * Math.PI * 2 * delta) / 60

    if (shaftRef.current) {
      const wobble = Math.sin(state.clock.elapsedTime * 18) * 0.004
      shaftRef.current.rotation.z += rotationStep
      shaftRef.current.rotation.x = wobble
      shaftRef.current.rotation.y = -wobble * 0.6
    }

    if (motorRef.current) {
      const vib = telemetry.vibration
      motorRef.current.position.x = Math.sin(state.clock.elapsedTime * 42) * vib
      motorRef.current.position.y = -0.08 + Math.sin(state.clock.elapsedTime * 55) * vib * 0.65
      motorRef.current.position.z = Math.sin(state.clock.elapsedTime * 37) * vib * 0.35
    }

    const blurTarget = THREE.MathUtils.clamp((rpmRef.current - 700) / 2200, 0, 0.9)
    blurRef.current = THREE.MathUtils.lerp(blurRef.current, blurTarget, 0.12)

    if (blurDiskMatRef.current) {
      blurDiskMatRef.current.opacity = blurRef.current
    }

    if (airflowGroupRef.current) {
      airflowGroupRef.current.rotation.z += rotationStep * 0.12
    }

    if (airflowOuterMatRef.current) {
      airflowOuterMatRef.current.opacity = telemetry.airflowOpacity
    }

    if (airflowInnerMatRef.current) {
      airflowInnerMatRef.current.opacity = telemetry.airflowOpacity * 0.7
    }
  })

  return (
    <group ref={motorRef}>
      <mesh position={[0, -1.52, -0.55]} receiveShadow>
        <planeGeometry args={[3.3, 0.22]} />
        <meshStandardMaterial color="#17384a" metalness={0.74} roughness={0.36} side={THREE.DoubleSide} />
      </mesh>

      {[-1.15, 1.15].map((x) => (
        <mesh key={`foot-front-${x}`} position={[x, -1.31, 0.78]} castShadow receiveShadow>
          <boxGeometry args={[0.45, 0.24, 0.36]} />
          <meshStandardMaterial color="#224b60" metalness={0.66} roughness={0.34} />
        </mesh>
      ))}

      {[-1.15, 1.15].map((x) => (
        <mesh key={`foot-rear-${x}`} position={[x, -1.31, -0.78]} castShadow receiveShadow>
          <boxGeometry args={[0.45, 0.24, 0.36]} />
          <meshStandardMaterial color="#224b60" metalness={0.66} roughness={0.34} />
        </mesh>
      ))}

      <mesh position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.88, 0.95, 2.24, 72]} />
        <meshStandardMaterial color="#1a4e65" metalness={0.81} roughness={0.24} />
      </mesh>

      {Array.from({ length: 10 }).map((_, i) => {
        const z = -0.95 + i * 0.21
        return (
          <mesh key={`fin-${i}`} position={[0, -0.42, z]} castShadow>
            <torusGeometry args={[0.96, 0.02, 16, 80]} />
            <meshStandardMaterial color="#2c657f" metalness={0.65} roughness={0.3} />
          </mesh>
        )
      })}

      <mesh position={[0, -0.42, 1.12]} castShadow>
        <circleGeometry args={[0.77, 56]} />
        <meshStandardMaterial color="#2f708d" metalness={0.7} roughness={0.23} />
      </mesh>

      <mesh position={[0, -0.42, -1.12]} rotation={[0, Math.PI, 0]} castShadow>
        <circleGeometry args={[0.77, 56]} />
        <meshStandardMaterial color="#2f708d" metalness={0.7} roughness={0.23} />
      </mesh>

      <mesh position={[0, 0.48, 0]} castShadow>
        <boxGeometry args={[0.78, 0.34, 0.64]} />
        <meshStandardMaterial color="#143a4f" metalness={0.58} roughness={0.35} />
      </mesh>

      <group ref={shaftRef} position={[0, -0.42, 1.25]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.1, 0.1, 1.2, 32]} />
          <meshStandardMaterial color="#d2e8f1" metalness={0.95} roughness={0.12} />
        </mesh>

        <mesh position={[0, 0, 0.58]} castShadow>
          <cylinderGeometry args={[0.19, 0.19, 0.18, 36]} />
          <meshStandardMaterial color="#e1f2f9" metalness={0.93} roughness={0.1} />
        </mesh>

        {[0, 1, 2, 3, 4, 5, 6].map((idx) => {
          const angle = (idx / 7) * Math.PI * 2
          return (
            <group key={`blade-${idx}`} rotation={[0.12, 0.16, angle]}>
              <mesh position={[0.5, 0, 0.58]} castShadow>
                <boxGeometry args={[0.92, 0.1, 0.032]} />
                <meshStandardMaterial
                  color={cfg.color}
                  emissive={cfg.color}
                  emissiveIntensity={cfg.running ? 0.24 : 0.08}
                  transparent
                  opacity={0.86}
                  metalness={0.58}
                  roughness={0.22}
                />
              </mesh>
            </group>
          )
        })}

        <mesh position={[0, 0, 0.58]}>
          <ringGeometry args={[0.19, 0.95, 96]} />
          <meshBasicMaterial
            ref={blurDiskMatRef}
            color="#d9f2ff"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>

        <group position={[0, 0, 0.72]}>
          {[0.2, 0.48, 0.76].map((radius) => (
            <mesh key={`guard-${radius.toFixed(2)}`}>
              <ringGeometry args={[radius, radius + 0.015, 64]} />
              <meshBasicMaterial color="#9ec0d3" transparent opacity={0.34} />
            </mesh>
          ))}

          {[0, Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4].map((angle) => (
            <mesh key={`spoke-${angle}`} rotation={[0, 0, angle]} position={[0, 0, -0.01]}>
              <boxGeometry args={[1.62, 0.02, 0.02]} />
              <meshBasicMaterial color="#9ec0d3" transparent opacity={0.25} />
            </mesh>
          ))}
        </group>

        <group ref={airflowGroupRef} position={[0, 0, 0.92]}>
          <mesh>
            <ringGeometry args={[0.74, 0.94, 96]} />
            <meshBasicMaterial ref={airflowOuterMatRef} color={cfg.color} transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh>
            <ringGeometry args={[0.46, 0.62, 96]} />
            <meshBasicMaterial ref={airflowInnerMatRef} color={cfg.color} transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>

        <group position={[0, 0, -2.48]}>
          <mesh>
            <cylinderGeometry args={[0.16, 0.16, 0.2, 24]} />
            <meshStandardMaterial color="#c8dfe8" metalness={0.92} roughness={0.11} />
          </mesh>

          {[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((angle) => (
            <mesh key={`rear-blade-${angle}`} rotation={[0.1, 0, angle]} position={[0.27, 0, 0]}>
              <boxGeometry args={[0.52, 0.07, 0.03]} />
              <meshStandardMaterial color="#92d7c1" metalness={0.55} roughness={0.25} />
            </mesh>
          ))}
        </group>
      </group>

      <mesh position={[0, -1.69, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.44, 0.045, 16, 72]} />
        <meshBasicMaterial color={cfg.color} transparent opacity={0.38} />
      </mesh>
    </group>
  )
}

function AmbientDust({ status }) {
  const count = 180
  const cfg = statusConfig[status] || statusConfig.offline
  const ref = useRef()

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      const theta = Math.random() * Math.PI * 2
      const radius = 2.6 + Math.random() * 1.9
      pos[i * 3] = Math.cos(theta) * radius
      pos[i * 3 + 1] = -0.1 + (Math.random() - 0.5) * 2.9
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4.8
    }
    return pos
  }, [])

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.2) * 0.08
      ref.current.rotation.y += 0.0008
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.025} color={cfg.color} transparent opacity={0.42} sizeAttenuation />
    </points>
  )
}

function StatusLabel({ status }) {
  const cfg = statusConfig[status] || statusConfig.offline

  return (
    <Text
      position={[0, -2.15, 0]}
      fontSize={0.24}
      color={cfg.color}
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.008}
      outlineColor={cfg.color}
    >
      {cfg.label}
    </Text>
  )
}

function SpeedLabel({ status, data, isLive }) {
  const cfg = statusConfig[status] || statusConfig.offline
  const telemetry = getTelemetry(status, data, isLive)
  const rpm = cfg.running ? Math.round(telemetry.targetRpm) : 0

  return (
    <Text
      position={[0, -2.47, 0]}
      fontSize={0.15}
      color="#b8cad5"
      anchorX="center"
      anchorY="middle"
    >
      RPM {rpm}
    </Text>
  )
}

export default function Scene3D({ status, data, isLive }) {
  return (
    <Canvas
      camera={{ position: [2.8, 1.15, 5.1], fov: 44 }}
      style={{ background: 'transparent' }}
      gl={{ antialias: true, alpha: true }}
      shadows
    >
      <ambientLight intensity={0.28} />
      <hemisphereLight intensity={0.45} color="#d7f5ff" groundColor="#0d2634" />
      <directionalLight
        position={[4.8, 6.2, 3.5]}
        intensity={1.05}
        color="#f5fbff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[-4.3, 1.6, -2.6]} intensity={0.28} color="#39a9ff" />

      <MotorAssembly status={status} data={data} isLive={isLive} />
      <AmbientDust status={status} />

      <ContactShadows position={[0, -1.64, 0]} opacity={0.42} blur={2.1} far={4} scale={7} />

      <StatusLabel status={status} />
      <SpeedLabel status={status} data={data} isLive={isLive} />

      <Environment preset="warehouse" />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={false}
        maxPolarAngle={Math.PI / 1.45}
        minPolarAngle={Math.PI / 3.1}
      />
    </Canvas>
  )
}

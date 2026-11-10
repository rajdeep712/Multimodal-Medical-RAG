import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 3D centerpiece for the landing hero: a visual model of the Multimodal
 * Medical RAG pipeline.
 *
 * - The wireframe core with a medical cross = the encrypted vector index
 * - Three tilted orbit rings = the ingested modalities
 *   (text chunks / clinical tables / radiology images)
 * - The particle streams spiraling inward = chunks being embedded and indexed
 *
 * Everything rotates slowly and follows the pointer with a soft parallax.
 */

const TEAL = '#2FD8E6';
const NAVY = '#1B4A66';
const GREEN = '#3CD97B';
const PURPLE = '#A78BFA';

interface RingConfig {
  radius: number;
  tilt: [number, number, number];
  speed: number;
  color: string;
  nodes: number;
}

const RINGS: RingConfig[] = [
  { radius: 2.5, tilt: [Math.PI / 2.4, 0, 0.35], speed: 0.24, color: TEAL, nodes: 5 },   // text
  { radius: 3.15, tilt: [Math.PI / 1.75, 0.5, -0.3], speed: -0.17, color: GREEN, nodes: 4 }, // tables
  { radius: 3.8, tilt: [Math.PI / 2.9, -0.55, 0.15], speed: 0.11, color: PURPLE, nodes: 3 }, // imaging
];

function KnowledgeCore() {
  const wireRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const crossRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (wireRef.current) {
      wireRef.current.rotation.y = t * 0.14;
      wireRef.current.rotation.x = Math.sin(t * 0.22) * 0.16;
    }
    if (glowRef.current) {
      // Heartbeat-like pulse for the inner glow.
      const beat = 1 + Math.pow(Math.max(0, Math.sin(t * 2.4)), 6) * 0.12;
      glowRef.current.scale.setScalar(beat);
    }
    if (crossRef.current) {
      crossRef.current.rotation.y = -t * 0.2;
    }
  });

  return (
    <group>
      {/* Inner glow sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.05, 32, 32]} />
        <meshBasicMaterial color={TEAL} transparent opacity={0.12} />
      </mesh>
      {/* Wireframe shell = the vector index */}
      <mesh ref={wireRef}>
        <icosahedronGeometry args={[1.55, 1]} />
        <meshBasicMaterial color={TEAL} wireframe transparent opacity={0.5} />
      </mesh>
      {/* Medical cross inside the core */}
      <group ref={crossRef}>
        <mesh>
          <boxGeometry args={[1.0, 0.3, 0.3]} />
          <meshStandardMaterial color={TEAL} emissive={TEAL} emissiveIntensity={0.9} roughness={0.3} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.3, 1.0, 0.3]} />
          <meshStandardMaterial color={TEAL} emissive={TEAL} emissiveIntensity={0.9} roughness={0.3} />
        </mesh>
      </group>
      {/* Core point light so ring nodes catch a highlight */}
      <pointLight color={TEAL} intensity={6} distance={9} />
    </group>
  );
}

function OrbitRing({ config }: { config: RingConfig }) {
  const groupRef = useRef<THREE.Group>(null);
  const nodesRef = useRef<THREE.Group>(null);

  const nodePositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < config.nodes; i++) {
      const angle = (i / config.nodes) * Math.PI * 2;
      positions.push([
        Math.cos(angle) * config.radius,
        0,
        Math.sin(angle) * config.radius,
      ]);
    }
    return positions;
  }, [config.radius, config.nodes]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * config.speed;
    }
    if (nodesRef.current) {
      // Counter-rotate gently so nodes stay readable and lively.
      nodesRef.current.rotation.y = -nodesRef.current.parent!.rotation.y * 0.4;
    }
  });

  return (
    <group rotation={config.tilt}>
      <group ref={groupRef}>
        {/* Ring path */}
        <mesh>
          <torusGeometry args={[config.radius, 0.012, 8, 128]} />
          <meshBasicMaterial color={config.color} transparent opacity={0.35} />
        </mesh>
        {/* Modality nodes travelling the ring */}
        <group ref={nodesRef}>
          {nodePositions.map((position, i) => (
            <group key={i} position={position}>
              <mesh>
                <sphereGeometry args={[0.085, 16, 16]} />
                <meshStandardMaterial
                  color={config.color}
                  emissive={config.color}
                  emissiveIntensity={0.7}
                  roughness={0.25}
                />
              </mesh>
              <mesh>
                <sphereGeometry args={[0.13, 12, 12]} />
                <meshBasicMaterial color={config.color} transparent opacity={0.16} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

function EmbeddingStreams() {
  const pointsRef = useRef<THREE.Points>(null);

  const { geometry, speeds } = useMemo(() => {
    const COUNT = 420;
    const positions = new Float32Array(COUNT * 3);
    const speeds: { angle: number; radius: number; height: number; speed: number }[] = [];

    for (let i = 0; i < COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.7 + Math.random() * 3.6;
      const height = (Math.random() - 0.5) * 2.6;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      speeds.push({
        angle,
        radius,
        height,
        speed: 0.25 + Math.random() * 0.55,
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry, speeds };
  }, []);

  useFrame((_, delta) => {
    const attribute = pointsRef.current?.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!attribute) return;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < speeds.length; i++) {
      const particle = speeds[i];
      particle.angle += delta * particle.speed * 0.55;
      particle.radius -= delta * particle.speed * 0.42;
      if (particle.radius < 1.35) {
        // Recycle at the shell of the core.
        particle.radius = 4.9 + Math.random() * 0.6;
        particle.height = (Math.random() - 0.5) * 2.6;
      }
      array[i * 3] = Math.cos(particle.angle) * particle.radius;
      array[i * 3 + 1] = particle.height * (particle.radius / 4.9 + 0.3);
      array[i * 3 + 2] = Math.sin(particle.angle) * particle.radius;
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color={TEAL}
        size={0.032}
        transparent
        opacity={0.75}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function PointerParallax({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ pointer }) => {
    if (!groupRef.current) return;
    const targetY = pointer.x * 0.28;
    const targetX = -pointer.y * 0.18;
    groupRef.current.rotation.y += (targetY - groupRef.current.rotation.y) * 0.045;
    groupRef.current.rotation.x += (targetX - groupRef.current.rotation.x) * 0.045;
  });

  return <group ref={groupRef}>{children}</group>;
}

export const MultimodalRagScene: React.FC = () => {
  return (
    <Canvas
      camera={{ position: [0, 1.1, 9.4], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 8, 6]} intensity={0.8} color="#BFF3F7" />
      <PointerParallax>
        <KnowledgeCore />
        {RINGS.map((config, i) => (
          <OrbitRing key={i} config={config} />
        ))}
        <EmbeddingStreams />
      </PointerParallax>
    </Canvas>
  );
};

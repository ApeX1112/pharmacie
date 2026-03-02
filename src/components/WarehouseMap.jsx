import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import useWarehouseStore from '../store/useWarehouseStore';

extend({ OrbitControls });

// ---- CONSTANTS ----
const SCALE = 0.05;
const MAP_W = 1200;
const MAP_H = 900;

function to3D(x, y) {
    return [(x - MAP_W / 2) * SCALE, 0, (y - MAP_H / 2) * SCALE];
}

function parseColor(colorStr) {
    if (!colorStr) return { color: new THREE.Color(0.8, 0.8, 0.8), alpha: 0.5 };
    const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (m) {
        return {
            color: new THREE.Color(+m[1] / 255, +m[2] / 255, +m[3] / 255),
            alpha: m[4] !== undefined ? parseFloat(m[4]) : 1,
        };
    }
    return { color: new THREE.Color(colorStr), alpha: 1 };
}

function getRackHeight(zone) {
    switch (zone.type) {
        case 'storage': return 3.0;
        case 'picking': return 2.2;
        case 'workstation': return 1.0;
        case 'inbound': return 0.8;
        case 'outbound': return 0.8;
        case 'conveyor': return 0.3;
        default: return 1.5;
    }
}

function getShelfCount(zone) {
    switch (zone.type) {
        case 'storage': return 4;
        case 'picking': return 3;
        case 'conveyor': return 0;
        default: return 2;
    }
}

// Create text sprite texture (cached)
const textureCache = new Map();
function createTextTexture(text, bgColor = 'rgba(0,0,0,0.8)', textColor = '#fff', fontSize = 32) {
    const key = `${text}_${bgColor}_${textColor}_${fontSize}`;
    if (textureCache.has(key)) return textureCache.get(key);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${fontSize}px Arial`;
    const tw = ctx.measureText(text).width;
    const pad = 12;
    canvas.width = tw + pad * 2;
    canvas.height = fontSize + pad * 2;

    ctx.fillStyle = bgColor;
    const r = 6, w = canvas.width, h = canvas.height;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = textColor;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const result = { texture, aspect: canvas.width / canvas.height };
    textureCache.set(key, result);
    return result;
}

// ---- SHARED GEOMETRIES (reused across all instances) ----
const sharedGeo = {
    post: new THREE.CylinderGeometry(0.04, 0.04, 1, 6),
    shelf: new THREE.BoxGeometry(1, 0.04, 1),
    stockBox: new THREE.BoxGeometry(1, 1, 1),
    head: new THREE.SphereGeometry(0.15, 8, 6),
    body: new THREE.CylinderGeometry(0.1, 0.14, 0.5, 8),
    legs: new THREE.CylinderGeometry(0.05, 0.05, 0.35, 6),
    nodeGeo: new THREE.SphereGeometry(0.06, 4, 4),
    ring: new THREE.RingGeometry(0.2, 0.38, 16),
};

// Shared materials
const sharedMat = {
    metalPost: new THREE.MeshStandardMaterial({ color: '#7a8999', metalness: 0.7, roughness: 0.3 }),
    shelf: new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.3, roughness: 0.5 }),
    floorMat: new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.85 }),
    graphLine: new THREE.LineBasicMaterial({ color: '#888888', transparent: true, opacity: 0.15 }),
    graphNode: new THREE.MeshBasicMaterial({ color: '#aaaaaa', transparent: true, opacity: 0.2 }),
    skinMat: new THREE.MeshStandardMaterial({ color: '#f5d0a9', roughness: 0.8 }),
    floorBorder: new THREE.LineBasicMaterial({ color: '#9ca3af' }),
};

// ---- CAMERA CONTROLS ----
const CameraControls = () => {
    const { camera, gl } = useThree();
    const controlsRef = useRef();
    useEffect(() => {
        const c = new OrbitControls(camera, gl.domElement);
        c.enableDamping = true;
        c.dampingFactor = 0.12;
        c.minDistance = 5;
        c.maxDistance = 80;
        c.maxPolarAngle = Math.PI / 2.1;
        controlsRef.current = c;
        return () => c.dispose();
    }, [camera, gl]);
    useFrame(() => controlsRef.current?.update());
    return null;
};

// ---- TEXT SPRITE ----
const TextSprite = React.memo(({ text, position, scale = 1.2, bgColor, textColor }) => {
    const { texture, aspect } = useMemo(() => createTextTexture(text, bgColor, textColor), [text, bgColor, textColor]);
    const mat = useMemo(() => new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, sizeAttenuation: true }), [texture]);
    return <sprite position={position} material={mat} scale={[scale * aspect, scale, 1]} />;
});

// ---- RACK (Realistic shelving unit) ----
const RackMesh = React.memo(({ zone, isHovered, onHover, onUnhover }) => {
    const { color } = useMemo(() => parseColor(zone.color), [zone.color]);
    const h = getRackHeight(zone);
    const w = zone.width * SCALE;
    const d = zone.height * SCALE;
    const shelfCount = getShelfCount(zone);
    const fillRatio = (zone.stock !== undefined && zone.capacity)
        ? Math.min(zone.stock / zone.capacity, 1) : 0;
    const cx = (zone.x + zone.width / 2 - MAP_W / 2) * SCALE;
    const cz = (zone.y + zone.height / 2 - MAP_H / 2) * SCALE;

    // For very small zones, skip detailed rack → just render a simple box
    const isSmall = w < 0.8 || d < 0.8;
    const isFlat = zone.type === 'workstation' || zone.type === 'inbound' || zone.type === 'outbound';

    // Stock material per zone
    const stockMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.9,
        metalness: 0.1,
    }), [color]);

    const hoverMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
    }), []);

    // Build shelves and posts procedurally
    const shelves = useMemo(() => {
        const arr = [];
        for (let i = 0; i <= shelfCount; i++) {
            arr.push(i * (h / shelfCount));
        }
        return arr;
    }, [shelfCount, h]);

    // Determine how many shelves have stock (bottom-up fill)
    const filledShelves = Math.ceil(fillRatio * shelfCount);

    if (isSmall || isFlat) {
        // Simple flat zone for workstations/small zones
        return (
            <group position={[cx, 0, cz]}>
                {/* Floor marker */}
                <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}
                    onPointerOver={(e) => { e.stopPropagation(); onHover(zone); }}
                    onPointerOut={(e) => { e.stopPropagation(); onUnhover(); }}
                >
                    <planeGeometry args={[w, d]} />
                    <meshStandardMaterial color={color} transparent opacity={isFlat ? 0.15 : 0.6} side={THREE.DoubleSide} />
                </mesh>
                {/* Border */}
                <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                    <edgesGeometry args={[new THREE.PlaneGeometry(w, d)]} />
                    <lineBasicMaterial color={isHovered ? '#00ffff' : '#888'} />
                </lineSegments>
                <TextSprite text={zone.name} position={[0, 0.5, 0]} scale={0.9} />
            </group>
        );
    }

    const postPositions = [
        [-w / 2 + 0.03, 0, -d / 2 + 0.03],
        [w / 2 - 0.03, 0, -d / 2 + 0.03],
        [-w / 2 + 0.03, 0, d / 2 - 0.03],
        [w / 2 - 0.03, 0, d / 2 - 0.03],
    ];

    return (
        <group position={[cx, 0, cz]}>
            {/* Invisible hitbox for hover */}
            <mesh
                position={[0, h / 2, 0]}
                visible={isHovered}
                onPointerOver={(e) => { e.stopPropagation(); onHover(zone); }}
                onPointerOut={(e) => { e.stopPropagation(); onUnhover(); }}
            >
                <boxGeometry args={[w + 0.1, h + 0.1, d + 0.1]} />
                {isHovered ? (
                    <meshStandardMaterial color="#00ffff" transparent opacity={0.08} depthWrite={false} />
                ) : (
                    <meshBasicMaterial visible={false} />
                )}
            </mesh>

            {/* Vertical posts */}
            {postPositions.map((pos, i) => (
                <mesh castShadow receiveShadow key={`post-${i}`} geometry={sharedGeo.post} material={sharedMat.metalPost}
                    position={[pos[0], h / 2, pos[2]]} scale={[1, h, 1]} />
            ))}

            {/* Horizontal shelves */}
            {shelves.map((sy, i) => (
                <mesh castShadow receiveShadow key={`shelf-${i}`} geometry={sharedGeo.shelf} material={sharedMat.shelf}
                    position={[0, sy, 0]} scale={[w, 1, d]} />
            ))}

            {/* Cross braces (back side) */}
            <mesh position={[0, h / 2, -d / 2 + 0.02]}>
                <planeGeometry args={[w, h]} />
                <meshStandardMaterial color="#8896a5" transparent opacity={0.08} side={THREE.DoubleSide} />
            </mesh>

            {/* Stock boxes on shelves (multiple individual boxes for realism) */}
            {shelves.slice(0, -1).map((sy, i) => {
                if (i >= filledShelves) return null;
                const shelfHeight = h / shelfCount;
                const boxH = shelfHeight * 0.7;

                // Calculate how many distinct boxes we can fit side-by-side
                const numBoxes = Math.max(1, Math.floor(w / 0.8));
                const totalPadding = 0.05 * (numBoxes + 1);
                const boxW = (w * 0.9 - totalPadding) / numBoxes;
                const boxD = d * 0.8;

                return Array.from({ length: numBoxes }).map((_, c) => (
                    <mesh castShadow receiveShadow key={`stock-${i}-${c}`} geometry={sharedGeo.stockBox} material={stockMat}
                        position={[-w * 0.45 + 0.05 + boxW / 2 + c * (boxW + 0.05), sy + boxH / 2 + 0.03, 0]}
                        scale={[boxW, boxH, boxD]}
                    />
                ));
            })}

            {/* Highlight border on hover */}
            {isHovered && (
                <lineSegments position={[0, h / 2, 0]}>
                    <edgesGeometry args={[new THREE.BoxGeometry(w + 0.08, h + 0.08, d + 0.08)]} />
                    <lineBasicMaterial color="#00ffff" />
                </lineSegments>
            )}

            {/* Label */}
            <TextSprite text={zone.name} position={[0, h + 0.5, 0]} scale={1.0} />
        </group>
    );
});

// ---- AGENT (Human-like figure) ----
const AgentMesh = React.memo(({ agent }) => {
    const isStorekeeper = agent.type === 'Storekeeper';
    const isController = agent.type === 'Controller';
    const agentColor = isStorekeeper ? '#3b82f6' : isController ? '#10b981' : '#ef4444';
    const [px, , pz] = to3D(agent.x, agent.y);

    const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: agentColor,
        roughness: 0.5,
        metalness: 0.1,
    }), [agentColor]);

    const vestMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: isStorekeeper ? '#1d4ed8' : isController ? '#059669' : '#dc2626',
        emissive: agentColor,
        emissiveIntensity: 0.2,
        roughness: 0.6,
    }), [agentColor, isStorekeeper, isController]);

    const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
        color: agentColor,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
    }), [agentColor]);

    return (
        <group position={[px, 0, pz]}>
            {/* Legs */}
            <mesh castShadow receiveShadow geometry={sharedGeo.legs} material={bodyMat} position={[-0.07, 0.175, 0]} />
            <mesh castShadow receiveShadow geometry={sharedGeo.legs} material={bodyMat} position={[0.07, 0.175, 0]} />

            {/* Body / Torso (vest) */}
            <mesh castShadow receiveShadow geometry={sharedGeo.body} material={vestMat} position={[0, 0.6, 0]} />

            {/* Head */}
            <mesh castShadow receiveShadow geometry={sharedGeo.head} material={sharedMat.skinMat} position={[0, 0.95, 0]} />

            {/* Hard hat (small hemisphere on head) */}
            <mesh castShadow receiveShadow position={[0, 1.05, 0]}>
                <sphereGeometry args={[0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color={isController ? '#10b981' : isStorekeeper ? '#fbbf24' : '#fb923c'} roughness={0.4} metalness={0.1} />
            </mesh>

            {/* Ground ring indicator */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}
                geometry={sharedGeo.ring} material={ringMat} />

            {/* ID label */}
            <TextSprite
                text={agent.id}
                position={[0, 1.5, 0]}
                scale={0.8}
                bgColor={agentColor}
            />
        </group>
    );
});

// ---- PATHFINDING GRAPH ----
const GraphOverlay = React.memo(({ nodes, edges }) => {
    const linesGeo = useMemo(() => {
        if (!nodes || !edges) return null;
        const positions = [];
        edges.forEach(([id1, id2]) => {
            const n1 = nodes.find(n => n.id === id1);
            const n2 = nodes.find(n => n.id === id2);
            if (n1 && n2) {
                const [x1, , z1] = to3D(n1.x, n1.y);
                const [x2, , z2] = to3D(n2.x, n2.y);
                positions.push(x1, 0.03, z1, x2, 0.03, z2);
            }
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        return geo;
    }, [nodes, edges]);

    const nodePositions = useMemo(() => {
        if (!nodes) return [];
        return nodes.map(n => { const [x, , z] = to3D(n.x, n.y); return [x, 0.03, z]; });
    }, [nodes]);

    if (!linesGeo) return null;

    return (
        <group>
            <lineSegments geometry={linesGeo} material={sharedMat.graphLine} />
            {nodePositions.map((pos, i) => (
                <mesh key={i} position={pos} geometry={sharedGeo.nodeGeo} material={sharedMat.graphNode} />
            ))}
        </group>
    );
});

// ---- FLOOR ----
const Floor = React.memo(() => {
    const floorW = MAP_W * SCALE;
    const floorH = MAP_H * SCALE;
    const edgesGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(floorW, floorH)), []);

    return (
        <group>
            {/* Concrete floor */}
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
                <planeGeometry args={[floorW, floorH]} />
                <meshStandardMaterial color="#c8ced4" roughness={0.9} />
            </mesh>
            {/* Border */}
            <lineSegments rotation={[-Math.PI / 2, 0, 0]} geometry={edgesGeo} material={sharedMat.floorBorder} />
            {/* Subtle grid */}
            <gridHelper args={[Math.max(floorW, floorH), 30, '#c8cdd3', '#dde1e6']} position={[0, 0.001, 0]} />
        </group>
    );
});

// ---- TOOLTIP (React DOM overlay) ----
const TooltipOverlay = ({ zone, camera, size }) => {
    if (!zone) return null;
    const cx = (zone.x + zone.width / 2 - MAP_W / 2) * SCALE;
    const h = getRackHeight(zone) + 1.5;
    const cz = (zone.y + zone.height / 2 - MAP_H / 2) * SCALE;
    const vec = new THREE.Vector3(cx, h, cz);
    vec.project(camera);
    const screenX = (vec.x * 0.5 + 0.5) * size.width;
    const screenY = (-vec.y * 0.5 + 0.5) * size.height;
    const stockRatio = (zone.stock !== undefined && zone.capacity) ? zone.stock / zone.capacity : null;

    return (
        <div style={{
            position: 'absolute', left: screenX, top: screenY,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(15, 23, 42, 0.95)', color: '#fff',
            padding: '10px 14px', borderRadius: '8px', fontSize: '12px',
            fontFamily: 'Arial, sans-serif', minWidth: '150px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            border: '1px solid rgba(100,200,255,0.2)',
            pointerEvents: 'none', zIndex: 100,
            backdropFilter: 'blur(4px)',
        }}>
            <p style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>{zone.name}</p>
            <p style={{ color: '#94a3b8', margin: '2px 0' }}>Type: <span style={{ color: '#e2e8f0' }}>{zone.type}</span></p>
            {zone.stock !== undefined && (
                <>
                    <p style={{ margin: '2px 0' }}>Stock: <strong>{zone.stock}</strong> / {zone.capacity}</p>
                    <div style={{
                        background: '#334155', borderRadius: '4px', height: '6px',
                        marginTop: '4px', overflow: 'hidden',
                    }}>
                        <div style={{
                            background: stockRatio > 0.7 ? '#22c55e' : stockRatio > 0.3 ? '#eab308' : '#ef4444',
                            width: `${Math.min(stockRatio * 100, 100)}%`,
                            height: '100%', borderRadius: '4px', transition: 'width 0.3s',
                        }} />
                    </div>
                    {zone.threshold && <p style={{ color: '#94a3b8', marginTop: '4px' }}>Seuil: {zone.threshold}</p>}
                </>
            )}
        </div>
    );
};

// ---- BRIDGE for tooltip projection ----
const TooltipBridge = ({ hoveredZone, setTooltipData }) => {
    const { camera, size } = useThree();
    useFrame(() => {
        if (hoveredZone) setTooltipData({ zone: hoveredZone, camera, size });
    });
    return null;
};

// ---- CONVEYOR BELT (Tapis Roulant) ----
const Conveyor3D = React.memo(({ zone, conveyorQueue }) => {
    const w = zone.width * SCALE;
    const d = zone.height * SCALE;
    const cx = (zone.x + zone.width / 2 - MAP_W / 2) * SCALE;
    const cz = (zone.y + zone.height / 2 - MAP_H / 2) * SCALE;
    const rollerCount = Math.max(3, Math.floor(w / 0.2));
    const rollersRef = useRef([]);

    // Animate rollers spinning
    useFrame(() => {
        rollersRef.current.forEach(r => {
            if (r) r.rotation.z += 0.08;
        });
    });

    return (
        <group position={[cx, 0.4, cz]}>
            {/* Belt surface — dark rubber */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <planeGeometry args={[w, d]} />
                <meshStandardMaterial color="#2d2d2d" roughness={0.9} />
            </mesh>

            {/* Side rails */}
            <mesh position={[0, 0.03, -d / 2 - 0.01]}>
                <boxGeometry args={[w + 0.04, 0.08, 0.02]} />
                <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.03, d / 2 + 0.01]}>
                <boxGeometry args={[w + 0.04, 0.08, 0.02]} />
                <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
            </mesh>

            {/* Rollers (spinning cylinders) */}
            {Array.from({ length: rollerCount }, (_, i) => {
                const lx = -w / 2 + (i + 0.5) * (w / rollerCount);
                return (
                    <mesh key={`roller-${i}`}
                        ref={el => rollersRef.current[i] = el}
                        position={[lx, -0.01, 0]}
                        rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.015, 0.015, d * 0.9, 8]} />
                        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
                    </mesh>
                );
            })}

            {/* Legs / supports */}
            {[-w / 2, 0, w / 2].map((lx, i) => (
                <mesh key={`leg-${i}`} position={[lx, -0.12, 0]}>
                    <cylinderGeometry args={[0.025, 0.025, 0.2, 6]} />
                    <meshStandardMaterial color="#334155" metalness={0.5} />
                </mesh>
            ))}

            {/* Boxes sliding along the belt */}
            {(conveyorQueue || []).map((box, i) => {
                const bx = -w / 2 + box.progress * w;
                return (
                    <mesh key={`box-${i}`} position={[bx, 0.08, 0]}>
                        <boxGeometry args={[0.12, 0.1, d * 0.5]} />
                        <meshStandardMaterial color={box.color || '#c0392b'} roughness={0.5} />
                    </mesh>
                );
            })}

            <TextSprite text={zone.name} position={[0, 0.7, 0]} scale={0.9} bgColor="rgba(230, 126, 34, 0.9)" />
        </group>
    );
});

// ---- SCENE CONTENT ----
const SceneContent = ({ onHover, onUnhover, hoveredZoneId, hoveredZone, setTooltipData }) => {
    const { agents, layoutConfig: config, conveyorQueue } = useWarehouseStore();
    if (!config) return null;

    return (
        <>
            {/* Lighting */}
            <ambientLight intensity={0.5} color="#e8ecf0" />
            <directionalLight castShadow position={[25, 35, 15]} intensity={0.9} color="#fff5e0"
                shadow-mapSize-width={2048} shadow-mapSize-height={2048}
                shadow-camera-far={100} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} />
            <directionalLight position={[-15, 20, -10]} intensity={0.3} color="#c8d8ff" />
            <hemisphereLight args={['#b0c4de', '#7a8999', 0.3]} />

            <Floor />
            <GraphOverlay nodes={config.nodes} edges={config.edges} />

            {config.zones.filter(z => z.type !== 'conveyor').map(zone => (
                <RackMesh key={zone.id} zone={zone}
                    isHovered={hoveredZoneId === zone.id}
                    onHover={onHover} onUnhover={onUnhover} />
            ))}

            {/* Conveyor zones */}
            {config.zones.filter(z => z.type === 'conveyor').map(zone => (
                <Conveyor3D key={zone.id} zone={zone} conveyorQueue={conveyorQueue} />
            ))}

            {agents.map(agent => (
                <AgentMesh key={agent.id} agent={agent} />
            ))}

            <CameraControls />
            <TooltipBridge hoveredZone={hoveredZone} setTooltipData={setTooltipData} />
        </>
    );
};

// ---- MAIN COMPONENT ----
const WarehouseMap = () => {
    const config = useWarehouseStore(state => state.layoutConfig);
    const [hoveredZone, setHoveredZone] = useState(null);
    const [tooltipData, setTooltipData] = useState(null);

    const handleHover = useCallback((zone) => setHoveredZone(zone), []);
    const handleUnhover = useCallback(() => { setHoveredZone(null); setTooltipData(null); }, []);

    return (
        <div className="flex-1 bg-gray-900 relative overflow-hidden h-full">
            {config ? (
                <>
                    <Canvas
                        shadows
                        camera={{ position: [0, 40, 35], fov: 50, near: 0.1, far: 200 }}
                        dpr={[1, 1.5]}
                        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                        style={{ background: '#1a2332' }}
                    >
                        <SceneContent
                            onHover={handleHover} onUnhover={handleUnhover}
                            hoveredZoneId={hoveredZone?.id} hoveredZone={hoveredZone}
                            setTooltipData={setTooltipData}
                        />
                    </Canvas>
                    {tooltipData && (
                        <TooltipOverlay zone={tooltipData.zone}
                            camera={tooltipData.camera} size={tooltipData.size} />
                    )}
                </>
            ) : (
                <div className="flex items-center justify-center h-full text-white">
                    Loading configuration...
                </div>
            )}
        </div>
    );
};

export default WarehouseMap;

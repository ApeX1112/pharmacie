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
const WALL_H = 6;

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

// Text sprite texture cache
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

// ---- SHARED GEOMETRIES ----
const sharedGeo = {
    post: new THREE.CylinderGeometry(0.04, 0.04, 1, 6),
    shelf: new THREE.BoxGeometry(1, 0.04, 1),
    stockBox: new THREE.BoxGeometry(1, 1, 1),
    head: new THREE.SphereGeometry(0.15, 8, 6),
    body: new THREE.CylinderGeometry(0.1, 0.14, 0.5, 8),
    legs: new THREE.CylinderGeometry(0.05, 0.05, 0.35, 6),
    arm: new THREE.CylinderGeometry(0.04, 0.035, 0.35, 6),
    hand: new THREE.SphereGeometry(0.04, 6, 4),
    shoe: new THREE.BoxGeometry(0.08, 0.04, 0.14),
    nodeGeo: new THREE.SphereGeometry(0.06, 4, 4),
    ring: new THREE.RingGeometry(0.2, 0.38, 16),
};

const MEDICINE_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

const sharedMat = {
    metalPost: new THREE.MeshStandardMaterial({ color: '#7a8599', metalness: 0.85, roughness: 0.15 }),
    shelf: new THREE.MeshStandardMaterial({ color: '#9aa5bf', metalness: 0.7, roughness: 0.3 }),
    floorMat: new THREE.MeshStandardMaterial({ color: '#d4d8e0', roughness: 0.7, metalness: 0.05 }),
    graphLine: new THREE.LineBasicMaterial({ color: '#888888', transparent: true, opacity: 0.15 }),
    graphNode: new THREE.MeshBasicMaterial({ color: '#aaaaaa', transparent: true, opacity: 0.2 }),
    skinMat: new THREE.MeshStandardMaterial({ color: '#f5d0a9', roughness: 0.8 }),
    floorBorder: new THREE.LineBasicMaterial({ color: '#7a8090' }),
    wallMat: new THREE.MeshStandardMaterial({ color: '#e0e4eb', roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    wallEdge: new THREE.LineBasicMaterial({ color: '#94a3b8' }),
    ceilingMat: new THREE.MeshStandardMaterial({ color: '#f0f2f5', roughness: 0.8, metalness: 0.05, transparent: true, opacity: 0.15, side: THREE.DoubleSide }),
    trussMat: new THREE.MeshStandardMaterial({ color: '#6b7a8d', metalness: 0.7, roughness: 0.3 }),
    safetyYellow: new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.6 }),
    safetyStripe: new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.5 }),
    coldGlass: new THREE.MeshStandardMaterial({ color: '#67e8f9', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.2, side: THREE.DoubleSide }),
    dockMat: new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.5, metalness: 0.4 }),
    pantsMat: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.8 }),
    shoeMat: new THREE.MeshStandardMaterial({ color: '#2d2317', roughness: 0.8 }),
    chariotMetal: new THREE.MeshStandardMaterial({ color: '#778899', metalness: 0.8, roughness: 0.2 }),
    chariotShelf: new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.6, roughness: 0.3 }),
    wheelMat: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 }),
    bollardMat: new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.4, metalness: 0.3 }),
    steelBeam: new THREE.MeshStandardMaterial({ color: '#6b7d8f', metalness: 0.85, roughness: 0.15 }),
    corrugatedWall: new THREE.MeshStandardMaterial({ color: '#8899aa', metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }),
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

// ---- WAREHOUSE WALLS ----
const Walls = React.memo(() => {
    const fw = MAP_W * SCALE;
    const fh = MAP_H * SCALE;
    const h = WALL_H;
    const colCount = 8;

    return (
        <group>
            {/* Back wall */}
            <mesh position={[0, h / 2, -fh / 2]} material={sharedMat.wallMat}>
                <planeGeometry args={[fw, h]} />
            </mesh>
            {/* Front wall */}
            <mesh position={[0, h / 2, fh / 2]} material={sharedMat.wallMat} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[fw, h]} />
            </mesh>
            {/* Left wall */}
            <mesh position={[-fw / 2, h / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={sharedMat.wallMat}>
                <planeGeometry args={[fh, h]} />
            </mesh>
            {/* Right wall */}
            <mesh position={[fw / 2, h / 2, 0]} rotation={[0, -Math.PI / 2, 0]} material={sharedMat.wallMat}>
                <planeGeometry args={[fh, h]} />
            </mesh>

            {/* Steel columns along front & back walls */}
            {Array.from({ length: colCount + 1 }, (_, i) => {
                const x = -fw / 2 + i * (fw / colCount);
                return (
                    <React.Fragment key={`col-fb-${i}`}>
                        <mesh position={[x, h / 2, -fh / 2 + 0.05]} material={sharedMat.steelBeam}>
                            <boxGeometry args={[0.12, h, 0.12]} />
                        </mesh>
                        <mesh position={[x, h / 2, fh / 2 - 0.05]} material={sharedMat.steelBeam}>
                            <boxGeometry args={[0.12, h, 0.12]} />
                        </mesh>
                    </React.Fragment>
                );
            })}

            {/* Steel columns along side walls */}
            {Array.from({ length: colCount + 1 }, (_, i) => {
                const z = -fh / 2 + i * (fh / colCount);
                return (
                    <React.Fragment key={`col-lr-${i}`}>
                        <mesh position={[-fw / 2 + 0.05, h / 2, z]} material={sharedMat.steelBeam}>
                            <boxGeometry args={[0.12, h, 0.12]} />
                        </mesh>
                        <mesh position={[fw / 2 - 0.05, h / 2, z]} material={sharedMat.steelBeam}>
                            <boxGeometry args={[0.12, h, 0.12]} />
                        </mesh>
                    </React.Fragment>
                );
            })}

            {/* Ventilation ducts along top of walls */}
            <mesh position={[0, h - 0.3, -fh / 2 + 0.15]}>
                <boxGeometry args={[fw * 0.8, 0.25, 0.2]} />
                <meshStandardMaterial color="#7a8a9a" metalness={0.7} roughness={0.25} />
            </mesh>
            <mesh position={[0, h - 0.3, fh / 2 - 0.15]}>
                <boxGeometry args={[fw * 0.8, 0.25, 0.2]} />
                <meshStandardMaterial color="#7a8a9a" metalness={0.7} roughness={0.25} />
            </mesh>

            {/* Wall edges */}
            {[
                [-fw / 2, 0, -fh / 2, fw / 2, 0, -fh / 2],
                [-fw / 2, 0, fh / 2, fw / 2, 0, fh / 2],
                [-fw / 2, 0, -fh / 2, -fw / 2, 0, fh / 2],
                [fw / 2, 0, -fh / 2, fw / 2, 0, fh / 2],
                [-fw / 2, h, -fh / 2, fw / 2, h, -fh / 2],
                [-fw / 2, h, fh / 2, fw / 2, h, fh / 2],
            ].map((coords, i) => {
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
                return <lineSegments key={`we-${i}`} geometry={geo} material={sharedMat.wallEdge} />;
            })}
        </group>
    );
});

// ---- CEILING with TRUSSES ----
const Ceiling = React.memo(() => {
    const fw = MAP_W * SCALE;
    const fh = MAP_H * SCALE;
    const h = WALL_H;

    return (
        <group>
            {/* Semi-transparent ceiling */}
            <mesh position={[0, h, 0]} rotation={[-Math.PI / 2, 0, 0]} material={sharedMat.ceilingMat}>
                <planeGeometry args={[fw, fh]} />
            </mesh>

            {/* Metal trusses running across */}
            {Array.from({ length: 6 }, (_, i) => {
                const z = -fh / 2 + (i + 0.5) * (fh / 6);
                return (
                    <group key={`truss-${i}`}>
                        {/* Main beam */}
                        <mesh position={[0, h - 0.15, z]} material={sharedMat.trussMat}>
                            <boxGeometry args={[fw, 0.12, 0.08]} />
                        </mesh>
                        {/* Cross supports */}
                        {Array.from({ length: 8 }, (_, j) => {
                            const x = -fw / 2 + (j + 0.5) * (fw / 8);
                            return (
                                <mesh key={`v-${j}`} position={[x, h - 0.3, z]} material={sharedMat.trussMat}>
                                    <boxGeometry args={[0.04, 0.25, 0.04]} />
                                </mesh>
                            );
                        })}
                    </group>
                );
            })}
        </group>
    );
});

// ---- CEILING LIGHTS ----
const CeilingLights = React.memo(() => {
    const fw = MAP_W * SCALE;
    const fh = MAP_H * SCALE;
    const lights = [];

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
            const x = -fw / 2 + (i + 0.5) * (fw / 4);
            const z = -fh / 2 + (j + 0.5) * (fh / 3);
            lights.push(
                <group key={`light-${i}-${j}`} position={[x, WALL_H - 0.5, z]}>
                    {/* Light fixture box */}
                    <mesh>
                        <boxGeometry args={[1.5, 0.08, 0.4]} />
                        <meshStandardMaterial color="#f8fafc" emissive="#f1f5f9" emissiveIntensity={0.5} />
                    </mesh>
                    <pointLight intensity={0.3} distance={20} color="#fffaf0" decay={2} />
                </group>
            );
        }
    }
    return <group>{lights}</group>;
});

// ---- FLOOR MARKINGS (Safety lines) ----
const FloorMarkings = React.memo(() => {
    const fw = MAP_W * SCALE;
    const fh = MAP_H * SCALE;

    // Create aisle markings — dashed yellow lines on floor
    const markings = [];

    // Main horizontal aisles
    const horizontalY = [280, 520, 600, 750].map(y => (y - MAP_H / 2) * SCALE);
    horizontalY.forEach((z, i) => {
        for (let s = 0; s < 20; s++) {
            markings.push(
                <mesh key={`h-${i}-${s}`} position={[-fw / 3 + s * 1.8, 0.005, z]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[1.2, 0.03]} />
                    <meshStandardMaterial color="#eab308" emissive="#ca8a04" emissiveIntensity={0.2} />
                </mesh>
            );
        }
    });

    // Vertical corridor markings
    const verticalX = [80, 420, 540, 680].map(x => (x - MAP_W / 2) * SCALE);
    verticalX.forEach((x, i) => {
        for (let s = 0; s < 15; s++) {
            markings.push(
                <mesh key={`v-${i}-${s}`} position={[x, 0.005, -fh / 3 + s * 2]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[0.03, 1.5]} />
                    <meshStandardMaterial color="#eab308" emissive="#ca8a04" emissiveIntensity={0.2} />
                </mesh>
            );
        }
    });

    return <group>{markings}</group>;
});

// ---- SAFETY ZONE MARKINGS ----
const SafetyZones = React.memo(() => {
    // Yellow-black striped areas near conveyor and shipping
    const zones = [
        { x: 250, y: 155, w: 260, h: 25 },   // Conveyor area
        { x: 50, y: 140, w: 80, h: 80 },       // Shipping area
        { x: 850, y: 75, w: 100, h: 50 },       // Reception area
    ];

    return (
        <group>
            {zones.map((z, i) => {
                const cx = (z.x - MAP_W / 2) * SCALE;
                const cz = (z.y - MAP_H / 2) * SCALE;
                const w = z.w * SCALE * 1.3;
                const d = z.h * SCALE * 1.3;
                return (
                    <mesh key={`sz-${i}`} position={[cx, 0.003, cz]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[w, d]} />
                        <meshStandardMaterial color="#fbbf24" transparent opacity={0.08} side={THREE.DoubleSide} />
                    </mesh>
                );
            })}
        </group>
    );
});

// ---- LOADING DOCK ----
const LoadingDock = React.memo(() => {
    // Raised platform at reception
    const cx = (800 + 50 - MAP_W / 2) * SCALE;
    const cz = (50 - MAP_H / 2) * SCALE;

    return (
        <group position={[cx, 0, cz]}>
            {/* Elevated platform */}
            <mesh position={[0, 0.2, 0]} material={sharedMat.dockMat}>
                <boxGeometry args={[6, 0.4, 3]} />
            </mesh>
            {/* Ramp */}
            <mesh position={[0, 0.1, 2]} rotation={[0.15, 0, 0]} material={sharedMat.dockMat}>
                <boxGeometry args={[5, 0.08, 1.5]} />
            </mesh>
            {/* Dock door frame */}
            <mesh position={[0, 1.5, -1.5]}>
                <boxGeometry args={[5, 3, 0.1]} />
                <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} transparent opacity={0.3} />
            </mesh>
            {/* Bumpers */}
            {[-2, 2].map((x, i) => (
                <mesh key={`bump-${i}`} position={[x, 0.3, -1.4]}>
                    <cylinderGeometry args={[0.15, 0.15, 0.5, 8]} />
                    <meshStandardMaterial color="#1e293b" roughness={0.8} />
                </mesh>
            ))}
            <TextSprite text="RÉCEPTION" position={[0, 2.5, -1.5]} scale={1.0} bgColor="rgba(34, 197, 94, 0.9)" />
        </group>
    );
});

// ---- COLD STORAGE CHAMBER (Chambre Froide) ----
const ColdStorage = React.memo(() => {
    const cx = (1060 + 10 - MAP_W / 2) * SCALE;
    const cz = (140 + 150 - MAP_H / 2) * SCALE;
    const w = 3;
    const d = 18;
    const h = 3.5;

    return (
        <group position={[cx + 2, 0, cz]}>
            {/* Glass walls with blue tint */}
            {/* Front */}
            <mesh position={[0, h / 2, d / 2]} material={sharedMat.coldGlass}>
                <planeGeometry args={[w, h]} />
            </mesh>
            {/* Back */}
            <mesh position={[0, h / 2, -d / 2]} material={sharedMat.coldGlass}>
                <planeGeometry args={[w, h]} />
            </mesh>
            {/* Left */}
            <mesh position={[-w / 2, h / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={sharedMat.coldGlass}>
                <planeGeometry args={[d, h]} />
            </mesh>
            {/* Right */}
            <mesh position={[w / 2, h / 2, 0]} rotation={[0, -Math.PI / 2, 0]} material={sharedMat.coldGlass}>
                <planeGeometry args={[d, h]} />
            </mesh>
            {/* Top */}
            <mesh position={[0, h, 0]} rotation={[-Math.PI / 2, 0, 0]} material={sharedMat.coldGlass}>
                <planeGeometry args={[w, d]} />
            </mesh>

            {/* Frost effect - subtle blue floor */}
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[w, d]} />
                <meshStandardMaterial color="#a5f3fc" transparent opacity={0.15} />
            </mesh>

            {/* Blue ambient light inside */}
            <pointLight color="#67e8f9" intensity={0.4} distance={8} position={[0, 2.5, 0]} />

            <TextSprite text="❄ Chambre Froide" position={[0, h + 0.5, 0]} scale={1.0} bgColor="rgba(6, 182, 212, 0.9)" />
        </group>
    );
});

// ---- FIRE EXTINGUISHER ----
const FireExtinguisher = React.memo(({ position }) => {
    return (
        <group position={position}>
            {/* Wall bracket */}
            <mesh position={[0, 1, 0]}>
                <boxGeometry args={[0.1, 0.3, 0.08]} />
                <meshStandardMaterial color="#475569" metalness={0.7} />
            </mesh>
            {/* Cylinder */}
            <mesh position={[0, 0.7, 0.05]}>
                <cylinderGeometry args={[0.06, 0.06, 0.45, 8]} />
                <meshStandardMaterial color="#dc2626" roughness={0.4} />
            </mesh>
            {/* Nozzle */}
            <mesh position={[0, 0.95, 0.05]}>
                <cylinderGeometry args={[0.02, 0.03, 0.08, 6]} />
                <meshStandardMaterial color="#1e293b" />
            </mesh>
        </group>
    );
});

// ---- PALLET (ambient detail) ----
const Pallet = React.memo(({ position, rotation = 0 }) => {
    return (
        <group position={position} rotation={[0, rotation, 0]}>
            {/* Planks */}
            {[-0.15, 0, 0.15].map((z, i) => (
                <mesh key={`p-${i}`} position={[0, 0.02, z]}>
                    <boxGeometry args={[0.5, 0.03, 0.12]} />
                    <meshStandardMaterial color="#a16207" roughness={0.9} />
                </mesh>
            ))}
            {/* Supports */}
            {[-0.2, 0, 0.2].map((x, i) => (
                <mesh key={`s-${i}`} position={[x, 0.06, 0]}>
                    <boxGeometry args={[0.08, 0.05, 0.4]} />
                    <meshStandardMaterial color="#92400e" roughness={0.9} />
                </mesh>
            ))}
        </group>
    );
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

    const isSmall = w < 0.8 || d < 0.8;
    const isFlat = zone.type === 'workstation' || zone.type === 'inbound' || zone.type === 'outbound';

    // Stock warning color
    const isRupture = zone.stock !== undefined && zone.stock <= 0;
    const isLow = zone.stock !== undefined && zone.threshold && zone.stock <= zone.threshold;

    const stockMat = useMemo(() => {
        const baseColor = new THREE.Color(color);
        const plasticColor = baseColor.lerp(new THREE.Color(0xffffff), 0.15);
        return new THREE.MeshStandardMaterial({
            color: plasticColor,
            roughness: 0.7,
            metalness: 0.15,
        });
    }, [color]);

    const shelves = useMemo(() => {
        const arr = [];
        for (let i = 0; i <= shelfCount; i++) {
            arr.push(i * (h / shelfCount));
        }
        return arr;
    }, [shelfCount, h]);

    const filledShelves = Math.ceil(fillRatio * shelfCount);

    if (isSmall || isFlat) {
        return (
            <group position={[cx, 0, cz]}>
                <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}
                    onPointerOver={(e) => { e.stopPropagation(); onHover(zone); }}
                    onPointerOut={(e) => { e.stopPropagation(); onUnhover(); }}
                >
                    <planeGeometry args={[w, d]} />
                    <meshStandardMaterial color={color} transparent opacity={isFlat ? 0.15 : 0.6} side={THREE.DoubleSide} />
                </mesh>
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

            {/* Stock boxes on shelves */}
            {shelves.slice(0, -1).map((sy, i) => {
                if (i >= filledShelves) return null;
                const shelfHeight = h / shelfCount;
                const boxH = shelfHeight * 0.7;
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

            {/* Rupture indicator: red glow on floor */}
            {isRupture && (
                <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[w + 0.2, d + 0.2]} />
                    <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.5} transparent opacity={0.3} />
                </mesh>
            )}

            {/* Low stock indicator: amber glow */}
            {isLow && !isRupture && (
                <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[w + 0.1, d + 0.1]} />
                    <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={0.3} transparent opacity={0.15} />
                </mesh>
            )}

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

// ---- AGENT (Human-like figure with Chariot) ----
const AgentMesh = React.memo(({ agent }) => {
    const isStorekeeper = agent.type === 'Storekeeper';
    const isController = agent.type === 'Controller';
    const agentColor = isStorekeeper ? '#3b82f6' : isController ? '#10b981' : '#ef4444';

    const groupRef = useRef();
    const leftLegRef = useRef();
    const rightLegRef = useRef();
    const leftArmRef = useRef();
    const rightArmRef = useRef();
    const upperBodyRef = useRef();
    const wheelsRef = useRef([]);
    const prevPos = useRef({ x: 0, z: 0 });
    const facingAngle = useRef(0);

    const [initialX, , initialZ] = to3D(agent.x, agent.y);

    const vestMat = useMemo(() => new THREE.MeshStandardMaterial({
        color: isStorekeeper ? '#1d4ed8' : isController ? '#059669' : '#dc2626',
        emissive: agentColor, emissiveIntensity: 0.15, roughness: 0.6,
    }), [agentColor, isStorekeeper, isController]);

    // State-based aura color
    const auraColor = useMemo(() => {
        const s = agent.state;
        if (s === 'idle') return '#3b82f6';
        if (s === 'picking_order') return '#22c55e';
        if (s === 'controlling') return '#a855f7';
        if (s?.startsWith('delivering')) return '#f97316';
        if (s?.startsWith('moving')) return '#eab308';
        return '#6b7280';
    }, [agent.state]);

    const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
        color: auraColor, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    }), [auraColor]);

    const isAtRack = (agent.state === 'picking_order' && (!agent.path || agent.path.length === 0))
        || (agent.state === 'depositing_reserve' && (!agent.path || agent.path.length === 0));

    const carryCount = agent.carrying || 0;
    const boxCount = Math.min(Math.ceil(carryCount / 8), 8);

    // Determine if agent should be walking based on STATE
    const agentIsMoving = agent.state !== 'idle' && agent.state !== 'controlling'
        && !isAtRack && agent.state !== 'depositing_reserve';

    useFrame((state) => {
        if (!groupRef.current) return;
        const [targetX, , targetZ] = to3D(agent.x, agent.y);
        const t = state.clock.elapsedTime;

        // Slow lerp = visible smooth movement
        groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, 0.06);
        groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, 0.06);

        const curX = groupRef.current.position.x;
        const curZ = groupRef.current.position.z;

        // Frame-to-frame movement detection
        const dx = curX - prevPos.current.x;
        const dz = curZ - prevPos.current.z;
        const frameDist = Math.sqrt(dx * dx + dz * dz);
        prevPos.current.x = curX;
        prevPos.current.z = curZ;

        // Calculate facing angle from movement
        if (frameDist > 0.0005) {
            facingAngle.current = Math.atan2(dx, dz);
        }

        // Walking: true if agent state says moving OR we detect frame movement
        const isWalking = agentIsMoving || frameDist > 0.001;

        if (isWalking) {
            // Smoothly rotate agent (and chariot, since it's a child) toward facing direction
            let rotY = groupRef.current.rotation.y;
            const target = facingAngle.current;
            while (target - rotY > Math.PI) rotY += Math.PI * 2;
            while (rotY - target > Math.PI) rotY -= Math.PI * 2;
            groupRef.current.rotation.y = THREE.MathUtils.lerp(rotY, target, 0.12);

            // Walking animation
            const walkT = t * 10;
            if (leftLegRef.current && rightLegRef.current) {
                leftLegRef.current.rotation.x = Math.sin(walkT) * 0.9;
                rightLegRef.current.rotation.x = Math.sin(walkT + Math.PI) * 0.9;
            }
            if (leftArmRef.current && rightArmRef.current) {
                leftArmRef.current.rotation.x = Math.sin(walkT + Math.PI) * 0.6;
                rightArmRef.current.rotation.x = Math.sin(walkT) * 0.6;
            }
            if (upperBodyRef.current) {
                upperBodyRef.current.position.y = Math.abs(Math.sin(walkT * 2)) * 0.06;
                upperBodyRef.current.rotation.z = Math.sin(walkT) * 0.05;
            }
            wheelsRef.current.forEach(w => { if (w) w.rotation.x += 0.2; });
        } else {
            // Idle / at rack — smoothly return to neutral
            const breathe = Math.sin(t * 2) * 0.008;
            if (leftLegRef.current) leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, 0, 0.08);
            if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, 0, 0.08);
            if (upperBodyRef.current) {
                upperBodyRef.current.position.y = THREE.MathUtils.lerp(upperBodyRef.current.position.y, breathe, 0.08);
                upperBodyRef.current.rotation.z = THREE.MathUtils.lerp(upperBodyRef.current.rotation.z, 0, 0.08);
            }

            if (isAtRack) {
                if (leftArmRef.current) leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, -1.1, 0.07);
                if (rightArmRef.current) rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, -1.1 + Math.sin(t * 3.5) * 0.3, 0.07);
            } else {
                if (leftArmRef.current) leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, 0, 0.08);
                if (rightArmRef.current) rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0, 0.08);
            }
        }
    });

    return (
        <group ref={groupRef} position={[initialX, 0, initialZ]}>
            {/* Aura ring */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}
                geometry={sharedGeo.ring} material={ringMat} />

            {/* Left Leg */}
            <group ref={leftLegRef} position={[-0.07, 0.35, 0]}>
                <mesh castShadow geometry={sharedGeo.legs} material={sharedMat.pantsMat} position={[0, -0.175, 0]} />
                <mesh geometry={sharedGeo.shoe} material={sharedMat.shoeMat} position={[0, -0.35, 0.03]} />
            </group>

            {/* Right Leg */}
            <group ref={rightLegRef} position={[0.07, 0.35, 0]}>
                <mesh castShadow geometry={sharedGeo.legs} material={sharedMat.pantsMat} position={[0, -0.175, 0]} />
                <mesh geometry={sharedGeo.shoe} material={sharedMat.shoeMat} position={[0, -0.35, 0.03]} />
            </group>

            {/* Upper Body */}
            <group ref={upperBodyRef}>
                {/* Torso */}
                <mesh castShadow geometry={sharedGeo.body} material={vestMat} position={[0, 0.6, 0]} />

                {/* Left Arm */}
                <group ref={leftArmRef} position={[-0.18, 0.75, 0]}>
                    <mesh castShadow geometry={sharedGeo.arm} material={vestMat} position={[0, -0.175, 0]} />
                    <mesh geometry={sharedGeo.hand} material={sharedMat.skinMat} position={[0, -0.36, 0]} />
                </group>

                {/* Right Arm */}
                <group ref={rightArmRef} position={[0.18, 0.75, 0]}>
                    <mesh castShadow geometry={sharedGeo.arm} material={vestMat} position={[0, -0.175, 0]} />
                    <mesh geometry={sharedGeo.hand} material={sharedMat.skinMat} position={[0, -0.36, 0]} />
                </group>

                {/* Head */}
                <mesh castShadow geometry={sharedGeo.head} material={sharedMat.skinMat} position={[0, 0.95, 0]} />
                {/* Hard hat */}
                <mesh castShadow position={[0, 1.05, 0]}>
                    <sphereGeometry args={[0.14, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    <meshStandardMaterial
                        color={isController ? '#10b981' : isStorekeeper ? '#fbbf24' : '#fb923c'}
                        roughness={0.3} metalness={0.2}
                    />
                </mesh>
            </group>

            {/* ---- CHARIOT (Large Medicine Cart) — not for Controller ---- */}
            {!isController && <group position={[0, 0, 0.9]}>
                {/* Push handle — U-shape angled back toward agent */}
                {[-0.3, 0.3].map((x, i) => (
                    <mesh key={`hbar-${i}`} position={[x, 0.7, -0.38]} rotation={[-0.35, 0, 0]} material={sharedMat.chariotMetal}>
                        <cylinderGeometry args={[0.018, 0.018, 0.65, 8]} />
                    </mesh>
                ))}
                <mesh position={[0, 0.95, -0.5]} material={sharedMat.chariotMetal}>
                    <boxGeometry args={[0.62, 0.025, 0.025]} />
                </mesh>
                {/* Grip rubber */}
                <mesh position={[0, 0.95, -0.5]}>
                    <boxGeometry args={[0.5, 0.032, 0.032]} />
                    <meshStandardMaterial color="#333" roughness={0.95} />
                </mesh>

                {/* Lower shelf (basket-style) */}
                <mesh position={[0, 0.18, 0]} material={sharedMat.chariotShelf}>
                    <boxGeometry args={[0.7, 0.025, 0.5]} />
                </mesh>
                {/* Lower shelf rim */}
                {[[-0.35, 0], [0.35, 0], [0, -0.25], [0, 0.25]].map(([x, z], i) => (
                    <mesh key={`lr-${i}`} position={[x, 0.22, z]} material={sharedMat.chariotMetal}>
                        <boxGeometry args={[i < 2 ? 0.015 : 0.7, 0.06, i < 2 ? 0.5 : 0.015]} />
                    </mesh>
                ))}

                {/* Upper shelf */}
                <mesh position={[0, 0.48, 0]} material={sharedMat.chariotShelf}>
                    <boxGeometry args={[0.7, 0.025, 0.5]} />
                </mesh>

                {/* Side guard rails */}
                {[-0.35, 0.35].map((x, i) => (
                    <React.Fragment key={`siderail-${i}`}>
                        {/* Vertical posts */}
                        <mesh position={[x, 0.33, -0.24]} material={sharedMat.chariotMetal}>
                            <cylinderGeometry args={[0.012, 0.012, 0.35, 6]} />
                        </mesh>
                        <mesh position={[x, 0.33, 0.24]} material={sharedMat.chariotMetal}>
                            <cylinderGeometry args={[0.012, 0.012, 0.35, 6]} />
                        </mesh>
                        <mesh position={[x, 0.33, 0]} material={sharedMat.chariotMetal}>
                            <cylinderGeometry args={[0.012, 0.012, 0.35, 6]} />
                        </mesh>
                        {/* Horizontal cross bar */}
                        <mesh position={[x, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]} material={sharedMat.chariotMetal}>
                            <cylinderGeometry args={[0.01, 0.01, 0.5, 6]} />
                        </mesh>
                    </React.Fragment>
                ))}
                {/* Back guard rail */}
                <mesh position={[0, 0.5, -0.25]} material={sharedMat.chariotMetal}>
                    <boxGeometry args={[0.7, 0.015, 0.015]} />
                </mesh>

                {/* Legs (4 corner tubes) */}
                {[[-0.32, -0.22], [0.32, -0.22], [-0.32, 0.22], [0.32, 0.22]].map(([x, z], i) => (
                    <mesh key={`cl-${i}`} position={[x, 0.09, z]} material={sharedMat.chariotMetal}>
                        <cylinderGeometry args={[0.015, 0.015, 0.18, 6]} />
                    </mesh>
                ))}

                {/* Wheels (larger, with rubber tire + metal hub) */}
                {[[-0.33, -0.23], [0.33, -0.23], [-0.33, 0.23], [0.33, 0.23]].map(([x, z], i) => (
                    <group key={`wg-${i}`} position={[x, 0.04, z]}>
                        {/* Rubber tire */}
                        <mesh ref={el => wheelsRef.current[i] = el}
                            rotation={[0, 0, Math.PI / 2]}
                            material={sharedMat.wheelMat}>
                            <cylinderGeometry args={[0.04, 0.04, 0.022, 12]} />
                        </mesh>
                        {/* Metal hub */}
                        <mesh rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[0.018, 0.018, 0.026, 8]} />
                            <meshStandardMaterial color="#aaa" metalness={0.8} roughness={0.2} />
                        </mesh>
                        {/* Caster fork */}
                        <mesh position={[0, 0.035, 0]} material={sharedMat.chariotMetal}>
                            <boxGeometry args={[0.01, 0.03, 0.04]} />
                        </mesh>
                    </group>
                ))}

                {/* Medicine boxes on cart (based on carrying count) */}
                {Array.from({ length: boxCount }).map((_, i) => {
                    const shelf = i < 4 ? 0 : 1;
                    const col = i % 4;
                    const y = shelf === 0 ? 0.22 : 0.52;
                    const x = (col - 1.5) * 0.16;
                    return (
                        <mesh key={`mb-${i}`} position={[x, y, 0]}>
                            <boxGeometry args={[0.13, 0.09, 0.12]} />
                            <meshStandardMaterial color={MEDICINE_COLORS[i % 6]} roughness={0.5} />
                        </mesh>
                    );
                })}
            </group>}

            {/* Controller clipboard */}
            {isController && (
                <group position={[0.22, 0.45, 0.05]} rotation={[0.3, 0, 0.1]}>
                    <mesh>
                        <boxGeometry args={[0.15, 0.2, 0.015]} />
                        <meshStandardMaterial color="#92400e" roughness={0.8} />
                    </mesh>
                    <mesh position={[0, 0.02, 0.01]}>
                        <boxGeometry args={[0.12, 0.16, 0.005]} />
                        <meshStandardMaterial color="#fefce8" roughness={0.5} />
                    </mesh>
                    <mesh position={[0, 0.11, 0]}>
                        <boxGeometry args={[0.06, 0.02, 0.02]} />
                        <meshStandardMaterial color="#71717a" metalness={0.7} />
                    </mesh>
                </group>
            )}

            {/* Label */}
            <TextSprite text={agent.id} position={[0, 1.5, 0]} scale={0.8} bgColor={agentColor} />
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

    // Expansion joint positions
    const joints = useMemo(() => {
        const arr = [];
        for (let i = -3; i <= 3; i++) {
            arr.push({ x: i * (floorW / 6), z: 0, rot: 0, len: floorH });
            arr.push({ x: 0, z: i * (floorH / 6), rot: Math.PI / 2, len: floorW });
        }
        return arr;
    }, [floorW, floorH]);

    return (
        <group>
            {/* Polished epoxy concrete floor */}
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
                <planeGeometry args={[floorW, floorH]} />
                <meshStandardMaterial color="#c4cad4" roughness={0.35} metalness={0.08} />
            </mesh>
            <lineSegments rotation={[-Math.PI / 2, 0, 0]} geometry={edgesGeo} material={sharedMat.floorBorder} />
            <gridHelper args={[Math.max(floorW, floorH), 40, '#bcc3cc', '#d4d9e0']} position={[0, 0.001, 0]} />

            {/* Expansion joints */}
            {joints.map((j, i) => (
                <mesh key={`joint-${i}`} position={[j.x, 0.002, j.z]} rotation={[-Math.PI / 2, j.rot, 0]}>
                    <planeGeometry args={[j.len, 0.015]} />
                    <meshStandardMaterial color="#9ca3af" transparent opacity={0.3} />
                </mesh>
            ))}
        </group>
    );
});

// ---- BOLLARDS (Safety pillars) ----
const Bollards = React.memo(() => {
    const fw = MAP_W * SCALE;
    const fh = MAP_H * SCALE;
    const positions = [
        [-fw / 3, -fh / 4], [fw / 4, -fh / 4], [-fw / 3, fh / 4], [fw / 4, fh / 4],
        [-fw / 6, 0], [fw / 6, 0], [0, -fh / 3], [0, fh / 3],
    ];
    return (
        <group>
            {positions.map(([x, z], i) => (
                <group key={`bollard-${i}`} position={[x, 0, z]}>
                    <mesh position={[0, 0.25, 0]} material={sharedMat.bollardMat}>
                        <cylinderGeometry args={[0.06, 0.08, 0.5, 8]} />
                    </mesh>
                    <mesh position={[0, 0.52, 0]}>
                        <cylinderGeometry args={[0.07, 0.07, 0.03, 8]} />
                        <meshStandardMaterial color="#111" roughness={0.8} />
                    </mesh>
                </group>
            ))}
        </group>
    );
});

// ---- TOOLTIP ----
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

// ---- BRIDGE for tooltip ----
const TooltipBridge = ({ hoveredZone, setTooltipData }) => {
    const { camera, size } = useThree();
    useFrame(() => {
        if (hoveredZone) setTooltipData({ zone: hoveredZone, camera, size });
    });
    return null;
};

// ---- CONVEYOR BOX ANIMATION ----
const ConveyorBox = React.memo(({ box, w, d }) => {
    const groupRef = useRef();

    useFrame(() => {
        if (!groupRef.current || box.progress === undefined) return;

        // Horizontal position: Clamp to 0 so it stays at the edge while dropping vertically
        const clampedProgress = Math.max(0, box.progress);
        const targetX = w / 2 - clampedProgress * w;

        // Vertical drop animation: Maps progress from -0.05 -> 0 to Y from 0.6 -> 0.16
        let targetY = 0.16; // Resting perfectly on top of the belt
        if (box.progress < 0) {
            // t goes from 0 (at -0.05) to 1 (at 0)
            const t = 1 - (Math.abs(box.progress) / 0.05);
            // Drop from Y=0.6 (picker hands) down to Y=0.16 (belt top)
            targetY = THREE.MathUtils.lerp(0.6, 0.16, Math.max(0, Math.min(1, t)));
        }

        groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, 0.15);
        // Faster lerp for the drop to make it feel snappy like dropping a box
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, 0.3);
    });

    // Initial spawn position (progress < 0 puts it high up initially)
    const initialY = box.progress < 0 ? 0.6 : 0.16;
    const initialX = w / 2 - Math.max(0, box.progress) * w;

    return (
        <group ref={groupRef} position={[initialX, initialY, 0]}>
            {/* Main box (Made larger: 0.22 width, 0.20 height) */}
            <mesh castShadow>
                <boxGeometry args={[0.22, 0.20, d * 0.65]} />
                <meshStandardMaterial color={box.color || '#c0392b'} roughness={0.4} metalness={0.1} />
            </mesh>
            {/* Tape/seal on top (Y = half height = 0.10) */}
            <mesh position={[0, 0.101, 0]}>
                <boxGeometry args={[0.06, 0.002, d * 0.65]} />
                <meshStandardMaterial color="#92400e" roughness={0.8} />
            </mesh>
            {/* Green checkmark tick for controlled boxes */}
            {box.controlled && (
                <group position={[0, 0.103, 0]}>
                    <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[0.12, 0.12]} />
                        <meshStandardMaterial color="#22c55e" emissive="#16a34a" emissiveIntensity={0.5} />
                    </mesh>
                    <TextSprite text="✓" position={[0, 0.06, 0]} scale={0.4} bgColor="rgba(34, 197, 94, 0.95)" textColor="#fff" />
                </group>
            )}
        </group>
    );
});

// ---- CONVEYOR BELT (Enhanced with supports, tapis roulant, checkpoint) ----
const Conveyor3D = React.memo(({ zone, conveyorQueue }) => {
    const w = zone.width * SCALE;
    const d = zone.height * SCALE;
    const cx = (zone.x + zone.width / 2 - MAP_W / 2) * SCALE;
    const cz = (zone.y + zone.height / 2 - MAP_H / 2) * SCALE;
    const rollerCount = Math.max(8, Math.floor(w / 0.12));
    const rollersRef = useRef([]);
    const beltRef = useRef();
    const CONTROL_POINT = 0.45;

    useFrame((state) => {
        // Animate rollers spinning
        rollersRef.current.forEach(r => {
            if (r) r.rotation.y -= 0.25;
        });
        // Animate belt texture offset for tapis roulant effect
        if (beltRef.current && beltRef.current.map) {
            beltRef.current.map.offset.x -= 0.008;
        }
    });

    // Belt texture (procedural striped pattern)
    const beltTexture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, 128, 32);
        // Tread pattern
        for (let i = 0; i < 128; i += 8) {
            ctx.fillStyle = i % 16 === 0 ? '#252540' : '#1e1e35';
            ctx.fillRect(i, 0, 4, 32);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(8, 1);
        return tex;
    }, []);

    // Leg positions (every ~20% of length, plus both ends)
    const legPositions = useMemo(() => {
        const positions = [];
        const count = 6;
        for (let i = 0; i <= count; i++) {
            positions.push(-w / 2 + i * (w / count));
        }
        return positions;
    }, [w]);

    const conveyorHeight = 0.4;
    const legHeight = conveyorHeight;
    const controlX = -w / 2 + CONTROL_POINT * w;

    return (
        <group position={[cx, conveyorHeight, cz]}>
            {/* Belt surface (animated tapis roulant) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
                <planeGeometry args={[w, d * 0.85]} />
                <meshStandardMaterial
                    map={beltTexture}
                    ref={beltRef}
                    roughness={0.85}
                    metalness={0.05}
                    color="#2a2a3e"
                />
            </mesh>

            {/* Side rails (thicker, industrial steel) */}
            <mesh position={[0, 0.04, -d / 2 - 0.015]} castShadow>
                <boxGeometry args={[w + 0.06, 0.1, 0.03]} />
                <meshStandardMaterial color="#4a5568" metalness={0.85} roughness={0.15} />
            </mesh>
            <mesh position={[0, 0.04, d / 2 + 0.015]} castShadow>
                <boxGeometry args={[w + 0.06, 0.1, 0.03]} />
                <meshStandardMaterial color="#4a5568" metalness={0.85} roughness={0.15} />
            </mesh>

            {/* Rollers (more, spinning faster) */}
            {Array.from({ length: rollerCount }, (_, i) => {
                const lx = -w / 2 + (i + 0.5) * (w / rollerCount);
                return (
                    <mesh key={`roller-${i}`}
                        ref={el => rollersRef.current[i] = el}
                        position={[lx, -0.015, 0]}
                        rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.018, 0.018, d * 0.85, 8]} />
                        <meshStandardMaterial color="#8899aa" metalness={0.7} roughness={0.2} />
                    </mesh>
                );
            })}

            {/* ===== SUPPORT STRUCTURE ===== */}
            {/* Legs (with base plates) */}
            {legPositions.map((lx, i) => (
                <React.Fragment key={`leg-struct-${i}`}>
                    {/* Front leg */}
                    <mesh position={[lx, -legHeight / 2, -d / 2 - 0.01]} castShadow>
                        <boxGeometry args={[0.04, legHeight, 0.04]} />
                        <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.2} />
                    </mesh>
                    {/* Back leg */}
                    <mesh position={[lx, -legHeight / 2, d / 2 + 0.01]} castShadow>
                        <boxGeometry args={[0.04, legHeight, 0.04]} />
                        <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.2} />
                    </mesh>
                    {/* Cross brace between legs */}
                    <mesh position={[lx, -legHeight / 2, 0]}>
                        <boxGeometry args={[0.02, 0.02, d + 0.04]} />
                        <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.3} />
                    </mesh>
                    {/* Front base plate */}
                    <mesh position={[lx, -legHeight + 0.005, -d / 2 - 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[0.1, 0.1]} />
                        <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} side={THREE.DoubleSide} />
                    </mesh>
                    {/* Back base plate */}
                    <mesh position={[lx, -legHeight + 0.005, d / 2 + 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[0.1, 0.1]} />
                        <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} side={THREE.DoubleSide} />
                    </mesh>
                </React.Fragment>
            ))}

            {/* Horizontal bottom frame bars (connecting legs along length) */}
            <mesh position={[0, -legHeight + 0.05, -d / 2 - 0.01]}>
                <boxGeometry args={[w + 0.04, 0.03, 0.025]} />
                <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.2} />
            </mesh>
            <mesh position={[0, -legHeight + 0.05, d / 2 + 0.01]}>
                <boxGeometry args={[w + 0.04, 0.03, 0.025]} />
                <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.2} />
            </mesh>

            {/* ===== CONTROL CHECKPOINT STATION ===== */}
            {/* Yellow-black striped line on belt at control point */}
            <mesh position={[controlX, 0.007, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.05, d * 0.85]} />
                <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={0.4} />
            </mesh>
            {/* Small overhead gantry/arch at control point */}
            {/* Left post */}
            <mesh position={[controlX, 0.25, -d / 2 - 0.03]} castShadow>
                <boxGeometry args={[0.03, 0.5, 0.03]} />
                <meshStandardMaterial color="#065f46" metalness={0.7} roughness={0.2} />
            </mesh>
            {/* Right post */}
            <mesh position={[controlX, 0.25, d / 2 + 0.03]} castShadow>
                <boxGeometry args={[0.03, 0.5, 0.03]} />
                <meshStandardMaterial color="#065f46" metalness={0.7} roughness={0.2} />
            </mesh>
            {/* Top bar */}
            <mesh position={[controlX, 0.51, 0]}>
                <boxGeometry args={[0.04, 0.04, d + 0.12]} />
                <meshStandardMaterial color="#059669" metalness={0.6} roughness={0.3} />
            </mesh>
            {/* Control light (green indicator) */}
            <mesh position={[controlX, 0.55, 0]}>
                <sphereGeometry args={[0.03, 8, 6]} />
                <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.8} />
            </mesh>

            {/* ===== BOXES ON CONVEYOR ===== */}
            {(conveyorQueue || []).map((box, i) => (
                <ConveyorBox key={`cbox-${box.orderId || i}`} box={box} w={w} d={d} />
            ))}

            {/* End stops (bumpers at both ends) */}
            <mesh position={[-w / 2 - 0.02, 0.025, 0]}>
                <boxGeometry args={[0.04, 0.07, d + 0.04]} />
                <meshStandardMaterial color="#ef4444" roughness={0.5} />
            </mesh>
            <mesh position={[w / 2 + 0.02, 0.025, 0]}>
                <boxGeometry args={[0.04, 0.07, d + 0.04]} />
                <meshStandardMaterial color="#22c55e" roughness={0.5} />
            </mesh>

            {/* Labels */}
            <TextSprite text="CONTRÔLE" position={[controlX, 0.75, 0]} scale={0.6} bgColor="rgba(5, 150, 105, 0.9)" />
            <TextSprite text={zone.name} position={[0, 0.9, 0]} scale={0.9} bgColor="rgba(230, 126, 34, 0.9)" />
            <TextSprite text="EXPÉDITION →" position={[w / 2 - 0.3, 0.65, 0]} scale={0.5} bgColor="rgba(239, 68, 68, 0.9)" />
        </group>
    );
});

// ---- SCENE CONTENT ----
const SceneContent = ({ onHover, onUnhover, hoveredZoneId, hoveredZone, setTooltipData }) => {
    const { agents, layoutConfig: config, conveyorQueue } = useWarehouseStore();
    if (!config) return null;

    const fw = MAP_W * SCALE;
    const fh = MAP_H * SCALE;

    return (
        <>
            {/* Enhanced Lighting */}
            <ambientLight intensity={0.35} color="#e8ecf0" />
            <directionalLight castShadow position={[25, 35, 15]} intensity={1.0} color="#fffaf0"
                shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0005}
                shadow-camera-far={100} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} />
            <directionalLight position={[-15, 20, -10]} intensity={0.35} color="#e0e8ff" />
            <hemisphereLight args={['#dce6f2', '#8291a1', 0.4]} />

            <Floor />
            <Walls />
            <Ceiling />
            <CeilingLights />
            <FloorMarkings />
            <SafetyZones />
            <LoadingDock />
            <ColdStorage />
            <GraphOverlay nodes={config.nodes} edges={config.edges} />

            {/* Fire extinguishers */}
            <FireExtinguisher position={[-fw / 2 + 0.3, 0, -fh / 4]} />
            <FireExtinguisher position={[fw / 4, 0, -fh / 2 + 0.3]} />
            <FireExtinguisher position={[-fw / 2 + 0.3, 0, fh / 4]} />

            {/* Bollards */}
            <Bollards />

            {/* Scattered pallets */}
            <Pallet position={[-fw / 3, 0, fh / 3 - 1]} rotation={0.3} />
            <Pallet position={[fw / 5, 0, -fh / 4]} rotation={-0.5} />
            <Pallet position={[-fw / 6, 0, fh / 5]} rotation={1.2} />
            <Pallet position={[fw / 3.5, 0, fh / 3]} rotation={0.7} />
            <Pallet position={[-fw / 4, 0, -fh / 3]} rotation={-0.2} />

            {config.zones.filter(z => z.type !== 'conveyor').map(zone => (
                <RackMesh key={zone.id} zone={zone}
                    isHovered={hoveredZoneId === zone.id}
                    onHover={onHover} onUnhover={onUnhover} />
            ))}

            {config.zones.filter(z => z.type === 'conveyor').map(zone => (
                <Conveyor3D key={zone.id} zone={zone} conveyorQueue={conveyorQueue} />
            ))}

            {agents.filter(a => !a.offDuty).map(agent => (
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

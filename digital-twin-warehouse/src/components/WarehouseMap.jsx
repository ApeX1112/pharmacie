import React, { useRef, useEffect, useState } from 'react';
import useWarehouseStore from '../store/useWarehouseStore';

const WarehouseMap = () => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [scale, setScale] = useState(1);
    const [hoveredZoneId, setHoveredZoneId] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const { agents, layoutConfig: config } = useWarehouseStore();

    // Derive the active zone object from the latest config
    const hoveredZone = config?.zones.find(z => z.id === hoveredZoneId);

    const handleMouseMove = (e) => {
        if (!config || !canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;

        const zone = config.zones.find(z =>
            x >= z.x && x <= z.x + z.width &&
            y >= z.y && y <= z.y + z.height
        );

        if (zone) {
            setHoveredZoneId(zone.id);
            setTooltipPos({ x: e.clientX, y: e.clientY });
        } else {
            setHoveredZoneId(null);
        }
    };

    // Handle resizing / scaling
    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && config) {
                const { width: containerW, height: containerH } = containerRef.current.getBoundingClientRect();
                const { width: mapW, height: mapH } = config.dimensions;

                const scaleW = containerW / mapW;
                const scaleH = containerH / mapH;
                const newScale = Math.min(scaleW, scaleH) * 0.95; // 95% fit

                setScale(newScale);
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize(); // Initial calculation

        return () => window.removeEventListener('resize', handleResize);
    }, [config]);

    // Main Draw Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !config) return;

        const ctx = canvas.getContext('2d');
        const { width: mapW, height: mapH } = config.dimensions;

        // Set actual canvas size (resolution)
        canvas.width = mapW;
        canvas.height = mapH;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Draw Background
        ctx.fillStyle = '#f8f9fa'; // Lighter, cleaner background
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Draw Graph (Debug)
        if (config.nodes && config.edges) {
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.lineWidth = 1;
            config.edges.forEach(edge => {
                const n1 = config.nodes.find(n => n.id === edge[0]);
                const n2 = config.nodes.find(n => n.id === edge[1]);
                if (n1 && n2) {
                    ctx.beginPath();
                    ctx.moveTo(n1.x, n1.y);
                    ctx.lineTo(n2.x, n2.y);
                    ctx.stroke();
                }
            });

            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            config.nodes.forEach(n => {
                ctx.beginPath();
                ctx.arc(n.x, n.y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // 3. Draw Zones
        config.zones.forEach(zone => {
            let fillStyle = zone.color || 'rgba(200, 200, 200, 0.3)';

            // If it has stock/capacity, modulate opacity/saturation
            if (zone.stock !== undefined && zone.capacity) {
                const stock = zone.stock;
                const capacity = zone.capacity;
                // 0.2 min opacity, up to 0.8
                const alpha = Math.min((stock / capacity) * 0.6 + 0.2, 0.8);

                // Parse base color (assume rgba or hex, but config uses rgba strings mostly)
                // Simple hack: Regex replace alpha
                if (fillStyle.startsWith('rgba')) {
                    fillStyle = fillStyle.replace(/[\d\.]+\)$/, `${alpha})`);
                }
            }

            ctx.fillStyle = fillStyle;
            ctx.fillRect(zone.x, zone.y, zone.width, zone.height);

            // Border
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1;
            ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);

            // Label
            ctx.fillStyle = '#000';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(zone.name, zone.x + zone.width / 2, zone.y + zone.height / 2);
        });

        // 4. Draw Agents
        agents.forEach(agent => {
            ctx.fillStyle = agent.type === 'Storekeeper' ? 'blue' : 'red';
            ctx.beginPath();
            ctx.arc(agent.x, agent.y, 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(agent.id, agent.x, agent.y + 3);
        });

    }, [config, agents]);

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredZoneId(null)}
            className="flex-1 bg-gray-50 relative overflow-hidden h-full flex items-center justify-center cursor-crosshair"
        >
            {config ? (
                <>
                    <canvas
                        ref={canvasRef}
                        style={{
                            width: config.dimensions.width * scale,
                            height: config.dimensions.height * scale,
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                            backgroundColor: 'white'
                        }}
                    />
                    {hoveredZone && (
                        <div style={{
                            position: 'fixed',
                            left: tooltipPos.x + 15,
                            top: tooltipPos.y + 15,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            color: 'white',
                            padding: '8px',
                            borderRadius: '4px',
                            pointerEvents: 'none',
                            zIndex: 100,
                            fontSize: '12px'
                        }}>
                            <p className="font-bold">{hoveredZone.name}</p>
                            <p>Type: {hoveredZone.type}</p>
                            {hoveredZone.stock !== undefined && (
                                <>
                                    <p>Stock: {hoveredZone.stock} / {hoveredZone.capacity}</p>
                                    {hoveredZone.threshold && <p>Threshold: {hoveredZone.threshold}</p>}
                                </>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <div>Loading configuration...</div>
            )}
        </div>
    );
};

export default WarehouseMap;

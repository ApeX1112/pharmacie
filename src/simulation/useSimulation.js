
import { useEffect, useRef } from 'react';
import useWarehouseStore from '../store/useWarehouseStore';
import { Engine } from './Engine';

export const useSimulation = () => {
    const { isPlaying, simulationSpeed, agents, updateAgents, layoutConfig, updateMetrics } = useWarehouseStore();
    const engineRef = useRef(new Engine({}));
    const lastTimeRef = useRef(0);
    const requestRef = useRef();

    // Initialize/Update engine config
    useEffect(() => {
        if (layoutConfig) {
            engineRef.current.config = layoutConfig;
            engineRef.current.config.parameters = useWarehouseStore.getState().parameters;
        }
    }, [layoutConfig]);

    // Initialize engine with agents when they change (or on mount)
    useEffect(() => {
        engineRef.current.loadAgents(agents);
    }, []);

    const animate = (time) => {
        if (lastTimeRef.current === 0) lastTimeRef.current = time;
        const delta = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;

        if (isPlaying) {
            engineRef.current.loadAgents(useWarehouseStore.getState().agents);
            engineRef.current.tasks = useWarehouseStore.getState().orders;
            engineRef.current.config.parameters = useWarehouseStore.getState().parameters;

            const { agents: updatedAgents, distance, zones: updatedZones, timeInfo, totalArrivals, newOrders, completedOrderIds } = engineRef.current.update(delta, simulationSpeed);

            // Sync Agents
            useWarehouseStore.getState().updateAgents(updatedAgents);

            // Sync Metrics
            const currentMetrics = useWarehouseStore.getState().metrics;
            const updatedMetrics = {
                totalArrivals: totalArrivals,
                totalDistance: (currentMetrics.totalDistance || 0) + distance
            };

            useWarehouseStore.getState().updateMetrics(updatedMetrics);
            useWarehouseStore.getState().updateTimeInfo(timeInfo);

            // Sync Orders
            if (newOrders && newOrders.length > 0) {
                newOrders.forEach(order => useWarehouseStore.getState().addOrder(order));
            }
            if (completedOrderIds && completedOrderIds.length > 0) {
                completedOrderIds.forEach(id => useWarehouseStore.getState().updateOrder(id, 'completed'));
            }

            // Update zones for stock changes
            if (updatedZones) {
                useWarehouseStore.getState().updateZoneStock(updatedZones);
            }
        }

        requestRef.current = requestAnimationFrame(animate);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current);
    }, [isPlaying, simulationSpeed]);

    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.tasks = useWarehouseStore.getState().orders;
        }
    }, []);
};

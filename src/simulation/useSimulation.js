
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

            const result = engineRef.current.update(delta, simulationSpeed);
            const { agents: updatedAgents, distance, zones: updatedZones, timeInfo, totalArrivals, totalReplenishments, conveyorQueue, newOrders, completedOrderIds, advancedMetrics, alerts } = result;

            // Sync Agents
            useWarehouseStore.getState().updateAgents(updatedAgents);

            // Sync Conveyor Queue (clone array to force React re-render of new boxes)
            useWarehouseStore.getState().updateConveyorQueue([...(conveyorQueue || [])]);

            // Sync Metrics (basic + advanced)
            const currentMetrics = useWarehouseStore.getState().metrics;
            const updatedMetrics = {
                totalArrivals: totalArrivals,
                totalReplenishments: totalReplenishments || 0,
                totalDistance: (currentMetrics.totalDistance || 0) + distance,
                ...(advancedMetrics || {})
            };

            useWarehouseStore.getState().updateMetrics(updatedMetrics);
            useWarehouseStore.getState().updateTimeInfo(timeInfo);

            // Sync Alerts
            if (alerts) {
                useWarehouseStore.getState().setAlerts(alerts);
            }

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

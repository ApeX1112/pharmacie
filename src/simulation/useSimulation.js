
import { useEffect, useRef } from 'react';
import useWarehouseStore from '../store/useWarehouseStore';
import { Engine } from './Engine';

export const useSimulation = () => {
    const { isPlaying, simulationSpeed, agents, updateAgents, layoutConfig, updateMetrics } = useWarehouseStore();
    const engineRef = useRef(new Engine({}));
    const baselineEngineRef = useRef(new Engine({}));
    const lastTimeRef = useRef(0);
    const requestRef = useRef();

    // Initialize/Update engine config
    useEffect(() => {
        if (layoutConfig) {
            engineRef.current.config = layoutConfig;
            engineRef.current.config.parameters = useWarehouseStore.getState().parameters;

            // Setup Ghost Baseline Engine if not initialized
            if (!baselineEngineRef.current.initialized) {
                baselineEngineRef.current.initialized = true;
                baselineEngineRef.current.config = JSON.parse(JSON.stringify(layoutConfig));
                baselineEngineRef.current.config.parameters = JSON.parse(JSON.stringify(useWarehouseStore.getState().parameters));
                // Load base agents
                const baseAgents = useWarehouseStore.getState().initialAgents || agents;
                baselineEngineRef.current.loadAgents([...baseAgents.map(a => ({ ...a }))]);
            }
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
            engineRef.current.loadAgents([...useWarehouseStore.getState().agents]);
            engineRef.current.tasks = [...useWarehouseStore.getState().orders];
            engineRef.current.config.parameters = useWarehouseStore.getState().parameters;

            // Sync Ghost Engine to reality if NO SCENARIO IS ACTIVE
            const scenarioActive = useWarehouseStore.getState().scenarioActive;
            if (!scenarioActive) {
                baselineEngineRef.current.completedCount = engineRef.current.completedCount;
                baselineEngineRef.current.config = JSON.parse(JSON.stringify(engineRef.current.config));
                baselineEngineRef.current.tasks = JSON.parse(JSON.stringify(engineRef.current.tasks));
                baselineEngineRef.current.agents = JSON.parse(JSON.stringify(engineRef.current.agents));
                baselineEngineRef.current.simulationTime = engineRef.current.simulationTime;
            }

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

            // Baseline Ghost Engine Step
            if (baselineEngineRef.current.initialized) {
                const baseResult = baselineEngineRef.current.update(delta, simulationSpeed);
                const currentBaseMetrics = useWarehouseStore.getState().baselineMetrics || {};

                const updatedBaseMetrics = {
                    totalArrivals: baseResult.totalArrivals,
                    totalReplenishments: baseResult.totalReplenishments || 0,
                    totalDistance: (currentBaseMetrics.totalDistance || 0) + baseResult.distance,
                    completedOrders: baselineEngineRef.current.completedCount || 0,
                    ...(baseResult.advancedMetrics || {})
                };
                useWarehouseStore.getState().updateBaselineMetrics(updatedBaseMetrics);
            }

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
            engineRef.current.tasks = [...useWarehouseStore.getState().orders];
        }
    }, []);
};

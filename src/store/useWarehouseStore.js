import { create } from 'zustand';

const useWarehouseStore = create((set, get) => ({
    isPlaying: false,
    simulationSpeed: 1,
    agents: [
        { id: 'M1', type: 'Storekeeper', x: 100, y: 650, state: 'idle', shifts: { start1: 6, end1: 12, start2: 13, end2: 17 } },
        { id: 'M2', type: 'Storekeeper', x: 200, y: 400, state: 'idle', shifts: { start1: 10, end1: 14, start2: 15, end2: 19 } },
        { id: 'M3', type: 'Storekeeper', x: 300, y: 500, state: 'idle', shifts: { start1: 14, end1: 18, start2: 19, end2: 22 } },
        { id: 'P1', type: 'Picker', x: 800, y: 150, state: 'idle', shifts: { start1: 6, end1: 12, start2: 13, end2: 17 } },
        { id: 'P2', type: 'Picker', x: 750, y: 400, state: 'idle', shifts: { start1: 10, end1: 14, start2: 15, end2: 19 } },
        { id: 'P3', type: 'Picker', x: 900, y: 600, state: 'idle', shifts: { start1: 14, end1: 18, start2: 19, end2: 22 } },
        { id: 'C1', type: 'Controller', x: 237, y: 180, state: 'idle' }
    ],
    initialAgents: [
        { id: 'M1', type: 'Storekeeper', x: 100, y: 650, state: 'idle', shifts: { start1: 6, end1: 12, start2: 13, end2: 17 } },
        { id: 'M2', type: 'Storekeeper', x: 200, y: 400, state: 'idle', shifts: { start1: 10, end1: 14, start2: 15, end2: 19 } },
        { id: 'M3', type: 'Storekeeper', x: 300, y: 500, state: 'idle', shifts: { start1: 14, end1: 18, start2: 19, end2: 22 } },
        { id: 'P1', type: 'Picker', x: 800, y: 150, state: 'idle', shifts: { start1: 6, end1: 12, start2: 13, end2: 17 } },
        { id: 'P2', type: 'Picker', x: 750, y: 400, state: 'idle', shifts: { start1: 10, end1: 14, start2: 15, end2: 19 } },
        { id: 'P3', type: 'Picker', x: 900, y: 600, state: 'idle', shifts: { start1: 14, end1: 18, start2: 19, end2: 22 } },
        { id: 'C1', type: 'Controller', x: 237, y: 180, state: 'idle' }
    ],
    orders: [],
    conveyorQueue: [],
    currentTime: 0,
    timeInfo: { day: 1, hour: 6, totalHours: 6 },
    metrics: {
        completedOrders: 0,
        totalDistance: 0,
        idleTime: 0,
        totalArrivals: 0,
        totalReplenishments: 0,
        // Advanced KPIs
        avgPrepTime: 0,
        avgControlWaitTime: 0,
        pickerUtilization: 0,
        conveyorUtilization: 0,
        pickingRuptureRate: 0,
        pendingOrders: 0,
        throughput: 0
    },
    alerts: [],
    layoutConfig: null,

    // Scenario system
    scenarioActive: null,
    baselineSnapshot: null,

    parameters: {
        inboundFrequency: 5,
        replenishThreshold: 20,
        arrivalParams: {
            A: { peak1: 9, peak2: 14, stdDev1: 1.5, stdDev2: 2, weight1: 0.5, maxRate: 50, enabled: true },
            B: { peak1: 9, peak2: 14, stdDev1: 1.5, stdDev2: 2, weight1: 0.5, maxRate: 50, enabled: true },
            C: { peak1: 9, peak2: 14, stdDev1: 1.5, stdDev2: 2, weight1: 0.5, maxRate: 50, enabled: true },
            D: { peak1: 9, peak2: 14, stdDev1: 1.5, stdDev2: 2, weight1: 0.5, maxRate: 50, enabled: true }
        },
        outboundParams: {
            peak1: 10,
            peak2: 15,
            stdDev1: 1.5,
            stdDev2: 2,
            weight1: 0.5,
            maxRate: 0.1,
            enabled: true
        }
    },

    togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
    setSpeed: (speed) => set({ simulationSpeed: speed }),
    updateAgents: (agents) => set({ agents }),
    updateAgentShifts: (id, newShifts) => set((state) => ({
        agents: state.agents.map(a => a.id === id ? { ...a, shifts: newShifts } : a),
        initialAgents: state.initialAgents.map(a => a.id === id ? { ...a, shifts: newShifts } : a)
    })),
    updateConveyorQueue: (queue) => set({ conveyorQueue: queue }),
    updateMetrics: (newMetrics) => set((state) => ({
        metrics: { ...state.metrics, ...newMetrics }
    })),
    setAlerts: (alerts) => set({ alerts }),
    setLayoutConfig: (config) => set({ layoutConfig: config }),
    randomizeStock: () => set((state) => {
        if (!state.layoutConfig) return {};
        const zones = state.layoutConfig.zones.map(z => {
            if (z.type === 'picking' && z.capacity) {
                return { ...z, stock: Math.floor(Math.random() * z.capacity * 0.4) + 5 };
            }
            if (z.type === 'storage' && z.capacity) {
                return { ...z, stock: Math.floor(Math.random() * z.capacity * 0.6) + 50 };
            }
            return z;
        });
        return { layoutConfig: { ...state.layoutConfig, zones } };
    }),
    updateZoneStock: (zonesOrId, amount) => set((state) => {
        if (Array.isArray(zonesOrId)) {
            return { layoutConfig: { ...state.layoutConfig, zones: zonesOrId } };
        }
        return { layoutConfig: { ...state.layoutConfig, zones: state.layoutConfig.zones } };
    }),
    setParameter: (key, value) => set((state) => ({
        parameters: { ...state.parameters, [key]: value }
    })),
    setArrivalParam: (zone, key, value) => set((state) => ({
        parameters: {
            ...state.parameters,
            arrivalParams: {
                ...state.parameters.arrivalParams,
                [zone]: {
                    ...state.parameters.arrivalParams[zone],
                    [key]: value
                }
            }
        }
    })),
    setOutboundParam: (key, value) => set((state) => ({
        parameters: {
            ...state.parameters,
            outboundParams: {
                ...state.parameters.outboundParams,
                [key]: value
            }
        }
    })),
    toggleArrivalZone: (zone) => set((state) => ({
        parameters: {
            ...state.parameters,
            arrivalParams: {
                ...state.parameters.arrivalParams,
                [zone]: {
                    ...state.parameters.arrivalParams[zone],
                    enabled: !state.parameters.arrivalParams[zone].enabled
                }
            }
        }
    })),
    addOrder: (order) => set((state) => ({ orders: [...state.orders, order] })),
    updateOrder: (orderId, status) => set((state) => ({
        orders: state.orders.map(o => o.id === orderId ? { ...o, status } : o),
        metrics: status === 'completed' ? { ...state.metrics, completedOrders: state.metrics.completedOrders + 1 } : state.metrics
    })),
    updateTimeInfo: (info) => set({ timeInfo: info }),
    tick: () => set((state) => ({ currentTime: state.currentTime + 1 })),

    // Live Baseline Metrics from Ghost Engine
    baselineMetrics: null,
    updateBaselineMetrics: (metrics) => set({ baselineMetrics: metrics }),

    // Scenario management
    saveBaseline: () => set((state) => ({
        baselineSnapshot: {
            metrics: { ...state.metrics },
            parameters: JSON.parse(JSON.stringify(state.parameters)),
            agentCount: state.agents.length,
            timestamp: state.timeInfo
        }
    })),
    resetToBaseline: () => set((state) => {
        if (!state.baselineSnapshot) return { scenarioActive: null };
        return {
            parameters: JSON.parse(JSON.stringify(state.baselineSnapshot.parameters)),
            agents: [...state.initialAgents.map(a => ({ ...a }))],
            scenarioActive: null
        };
    }),
    applyScenario: (scenarioId) => set((state) => {
        const s = { ...state };
        switch (scenarioId) {
            case 'plus20_commands': {
                const newParams = JSON.parse(JSON.stringify(state.parameters));
                newParams.outboundParams.maxRate *= 1.2;
                Object.keys(newParams.arrivalParams).forEach(zone => {
                    newParams.arrivalParams[zone].maxRate *= 1.2;
                });
                return { parameters: newParams, scenarioActive: scenarioId };
            }
            case 'minus1_picker': {
                const pickers = state.agents.filter(a => a.type === 'Picker');
                if (pickers.length <= 1) return { scenarioActive: scenarioId };
                const newAgents = state.agents.filter(a => a.id !== pickers[pickers.length - 1].id);
                return { agents: newAgents, scenarioActive: scenarioId };
            }
            case 'fridge_surge': {
                const newParams = JSON.parse(JSON.stringify(state.parameters));
                newParams.outboundParams.maxRate *= 2;
                return { parameters: newParams, scenarioActive: scenarioId };
            }
            case 'frequent_rupture': {
                if (!state.layoutConfig) return { scenarioActive: scenarioId };
                const zones = state.layoutConfig.zones.map(z => {
                    if (z.type === 'picking') {
                        return { ...z, stock: Math.max(0, (z.threshold || 20) - 5) };
                    }
                    return z;
                });
                return { layoutConfig: { ...state.layoutConfig, zones }, scenarioActive: scenarioId };
            }
            case 'slow_control': {
                return { scenarioActive: scenarioId };
            }
            default:
                return {};
        }
    }),
}));

export default useWarehouseStore;

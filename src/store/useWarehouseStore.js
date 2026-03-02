import { create } from 'zustand';

const useWarehouseStore = create((set) => ({
    isPlaying: false,
    simulationSpeed: 1,
    agents: [
        { id: 'M1', type: 'Storekeeper', x: 100, y: 650, state: 'idle' },
        { id: 'M2', type: 'Storekeeper', x: 200, y: 400, state: 'idle' },
        { id: 'M3', type: 'Storekeeper', x: 300, y: 500, state: 'idle' },
        { id: 'P1', type: 'Picker', x: 800, y: 150, state: 'idle' },
        { id: 'P2', type: 'Picker', x: 750, y: 400, state: 'idle' },
        { id: 'P3', type: 'Picker', x: 900, y: 600, state: 'idle' },
        { id: 'C1', type: 'Controller', x: 250, y: 120, state: 'idle' }
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
        totalReplenishments: 0
    },
    layoutConfig: null,
    parameters: {
        inboundFrequency: 5,
        replenishThreshold: 20,
        arrivalParams: {
            A: { mean: 12, stdDev: 3, maxRate: 50, enabled: true },  // Peak at noon
            B: { mean: 12, stdDev: 3, maxRate: 50, enabled: true },  // Peak at noon
            C: { mean: 12, stdDev: 3, maxRate: 50, enabled: true },  // Peak at noon
            D: { mean: 12, stdDev: 3, maxRate: 50, enabled: true }   // Peak at noon
        },
        outboundParams: {
            mean: 14, // Peak at 14:00
            stdDev: 4,
            maxRate: 0.1, // 0.1 orders/hour = 1 order every 10 hours at peak (very realistic)
            enabled: true
        }
    },

    togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
    setSpeed: (speed) => set({ simulationSpeed: speed }),
    updateAgents: (agents) => set({ agents }),
    updateConveyorQueue: (queue) => set({ conveyorQueue: queue }),
    updateMetrics: (newMetrics) => set((state) => ({
        metrics: { ...state.metrics, ...newMetrics }
    })),
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
            // Bulk update from Engine
            return { layoutConfig: { ...state.layoutConfig, zones: zonesOrId } };
        }
        // Legacy single update (if needed)
        // ... (existing logic)
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
    tick: () => set((state) => ({ currentTime: state.currentTime + 1 })), // Placeholder to ensure I find the file first.
    // I will use `grep_search` to find where `engine.update` is called. tick
}));

export default useWarehouseStore;

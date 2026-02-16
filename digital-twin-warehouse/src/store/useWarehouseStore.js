import { create } from 'zustand';

const useWarehouseStore = create((set) => ({
    isPlaying: false,
    simulationSpeed: 1,
    agents: [
        { id: 'M1', type: 'Storekeeper', x: 100, y: 650, state: 'idle', target: { x: 350, y: 150 } },
        { id: 'P1', type: 'Picker', x: 800, y: 150, state: 'idle', target: { x: 1000, y: 650 } }
    ],
    orders: [],
    currentTime: 0,
    timeInfo: { day: 1, hour: 6, totalHours: 6 },
    metrics: {
        completedOrders: 0,
        totalDistance: 0,
        idleTime: 0,
        totalArrivals: 0
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
    updateMetrics: (newMetrics) => set((state) => ({
        metrics: { ...state.metrics, ...newMetrics }
    })),
    setLayoutConfig: (config) => set({ layoutConfig: config }),
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

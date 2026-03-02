import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { X, Settings } from 'lucide-react';
import useWarehouseStore from '../store/useWarehouseStore';

const ArrivalsModal = ({ isOpen, onClose }) => {
    const parameters = useWarehouseStore(state => state.parameters);
    const setArrivalParam = useWarehouseStore(state => state.setArrivalParam);
    const toggleArrivalZone = useWarehouseStore(state => state.toggleArrivalZone);
    const { arrivalParams } = parameters;

    // Generate data points for the chart based on current parameters
    const chartData = useMemo(() => {
        const data = [];
        // Time from 6:00 to 20:00 (14 hours)
        for (let hour = 6; hour <= 20; hour += 0.5) {
            const point = { time: hour };

            ['A', 'B', 'C', 'D'].forEach(zone => {
                const { mean, stdDev, maxRate = 50, enabled } = arrivalParams[zone];
                if (!enabled) {
                    point[zone] = 0;
                    return;
                }
                // Gaussian Bell Curve scaled to Max Rate
                // Peak at 'mean' (Hour of Day)
                const intensity = Math.exp(-0.5 * Math.pow((hour - mean) / stdDev, 2));
                point[zone] = intensity * maxRate;
            });

            data.push(point);
        }
        return data;
    }, [arrivalParams]);

    if (!isOpen) return null;

    const colors = {
        A: "#ef4444", // Red
        B: "#3b82f6", // Blue
        C: "#10b981", // Green
        D: "#f59e0b"  // Amber
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <Settings className="w-6 h-6 text-indigo-600" />
                            Configuration des Arrivées
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Ajustez les courbes de distribution pour chaque Zone de Réserve (A, B, C, D).
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                        {/* Chart Section */}
                        <div className="lg:col-span-2 bg-gray-50 rounded-xl p-4 border border-gray-100 h-[400px]">
                            <h3 className="text-sm font-semibold text-gray-700 mb-4 px-2">Visualisation (6h00 - 20h00)</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis
                                        dataKey="time"
                                        tickFormatter={(val) => `${Math.floor(val)}h${val % 1 === 0.5 ? '30' : '00'}`}
                                        stroke="#9ca3af"
                                        fontSize={12}
                                    />
                                    <YAxis hide />
                                    <Tooltip
                                        labelFormatter={(val) => `Heure: ${Math.floor(val)}h${val % 1 === 0.5 ? '30' : '00'}`}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                    />
                                    <Legend />

                                    {['A', 'B', 'C', 'D'].map(zone => (
                                        <Area
                                            key={zone}
                                            type="monotone"
                                            dataKey={zone}
                                            stackId="1" // Stack them to show total volume, or remove stackId to overlap
                                            name={`Zone ${zone}`}
                                            stroke={colors[zone]}
                                            fill={colors[zone]}
                                            fillOpacity={0.6}
                                        />
                                    ))}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Controls Section */}
                        <div className="space-y-6">
                            {['A', 'B', 'C', 'D'].map(zone => {
                                const { mean, stdDev, enabled } = arrivalParams[zone];
                                return (
                                    <div key={zone} className={`p-4 rounded-lg border transition-all ${enabled ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[zone] }}></div>
                                                <span className="font-bold text-gray-700">Zone {zone}</span>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={enabled}
                                                    onChange={() => toggleArrivalZone(zone)}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                            </label>
                                        </div>

                                        {enabled && (
                                            <div className="space-y-4">
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-gray-500">Heure de Pic (Moyenne)</span>
                                                        <span className="font-medium text-gray-900">{mean}h00</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="6" max="20" step="0.5"
                                                        value={mean}
                                                        onChange={(e) => setArrivalParam(zone, 'mean', parseFloat(e.target.value))}
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-gray-500">Étalement (Écart Type)</span>
                                                        <span className="font-medium text-gray-900">{stdDev}h</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0.5" max="5" step="0.5"
                                                        value={stdDev}
                                                        onChange={(e) => setArrivalParam(zone, 'stdDev', parseFloat(e.target.value))}
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-gray-500">Volume Max (Commandes/h)</span>
                                                        <span className="font-medium text-gray-900">{arrivalParams[zone].maxRate || 50}</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="10" max="200" step="10"
                                                        value={arrivalParams[zone].maxRate || 50}
                                                        onChange={(e) => setArrivalParam(zone, 'maxRate', parseInt(e.target.value))}
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm"
                    >
                        Valider & Fermer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ArrivalsModal;

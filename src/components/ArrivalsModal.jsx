import React, { useMemo } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { X, Settings } from 'lucide-react';
import useWarehouseStore from '../store/useWarehouseStore';

const ArrivalsModal = ({ isOpen, onClose }) => {
    const parameters = useWarehouseStore(state => state.parameters);
    const setArrivalParam = useWarehouseStore(state => state.setArrivalParam);
    const toggleArrivalZone = useWarehouseStore(state => state.toggleArrivalZone);
    const { arrivalParams } = parameters;

    // Generate data points for the chart using BIMODAL distribution
    const chartData = useMemo(() => {
        const data = [];
        for (let hour = 6; hour <= 20; hour += 0.5) {
            const point = { time: hour };

            ['A', 'B', 'C', 'D'].forEach(zone => {
                const { peak1, peak2, stdDev1, stdDev2, weight1, maxRate = 50, enabled } = arrivalParams[zone];
                if (!enabled) {
                    point[zone] = 0;
                    return;
                }
                // Bimodal: two Gaussian peaks
                const w1 = weight1;
                const w2 = 1 - weight1;
                const g1 = Math.exp(-0.5 * Math.pow((hour - peak1) / stdDev1, 2));
                const g2 = Math.exp(-0.5 * Math.pow((hour - peak2) / stdDev2, 2));
                point[zone] = (w1 * g1 + w2 * g2) * maxRate;
            });

            data.push(point);
        }
        return data;
    }, [arrivalParams]);

    if (!isOpen) return null;

    const colors = {
        A: "#ef4444",
        B: "#3b82f6",
        C: "#10b981",
        D: "#f59e0b"
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <Settings className="w-6 h-6 text-indigo-600" />
                            Configuration des Arrivées (Bimodale)
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Distribution bimodale: pics matin + après-midi pour chaque zone de réserve
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Chart Section */}
                        <div className="lg:col-span-2 bg-gray-50 rounded-xl p-4 border border-gray-100 h-[380px]">
                            <h3 className="text-sm font-semibold text-gray-700 mb-3 px-2">
                                Distribution Bimodale (6h → 20h)
                            </h3>
                            <ResponsiveContainer width="100%" height="90%">
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
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                    />
                                    <Legend />

                                    {['A', 'B', 'C', 'D'].map(zone => (
                                        <Area
                                            key={zone}
                                            type="monotone"
                                            dataKey={zone}
                                            stackId="1"
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
                        <div className="space-y-4 overflow-y-auto max-h-[60vh]">
                            {['A', 'B', 'C', 'D'].map(zone => {
                                const { peak1, peak2, stdDev1, stdDev2, weight1, enabled } = arrivalParams[zone];
                                return (
                                    <div key={zone} className={`p-3 rounded-lg border transition-all ${enabled ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[zone] }}></div>
                                                <span className="font-bold text-gray-700 text-sm">Zone {zone}</span>
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
                                            <div className="space-y-3">
                                                {/* Peak 1 (Morning) */}
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-gray-500">🌅 Pic Matin</span>
                                                        <span className="font-medium text-gray-900">{peak1}h00</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="6" max="13" step="0.5"
                                                        value={peak1}
                                                        onChange={(e) => setArrivalParam(zone, 'peak1', parseFloat(e.target.value))}
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                    />
                                                </div>
                                                {/* Peak 2 (Afternoon) */}
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-gray-500">🌇 Pic Après-midi</span>
                                                        <span className="font-medium text-gray-900">{peak2}h00</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="12" max="20" step="0.5"
                                                        value={peak2}
                                                        onChange={(e) => setArrivalParam(zone, 'peak2', parseFloat(e.target.value))}
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                    />
                                                </div>
                                                {/* Spread */}
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-gray-500">Étalement</span>
                                                        <span className="font-medium text-gray-900">{stdDev1}h / {stdDev2}h</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="range" min="0.5" max="4" step="0.5"
                                                            value={stdDev1}
                                                            onChange={(e) => setArrivalParam(zone, 'stdDev1', parseFloat(e.target.value))}
                                                            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-400"
                                                        />
                                                        <input
                                                            type="range" min="0.5" max="4" step="0.5"
                                                            value={stdDev2}
                                                            onChange={(e) => setArrivalParam(zone, 'stdDev2', parseFloat(e.target.value))}
                                                            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-400"
                                                        />
                                                    </div>
                                                </div>
                                                {/* Weight */}
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-gray-500">Poids Matin/AM</span>
                                                        <span className="font-medium text-gray-900">{Math.round(weight1 * 100)}% / {Math.round((1 - weight1) * 100)}%</span>
                                                    </div>
                                                    <input
                                                        type="range" min="0.1" max="0.9" step="0.1"
                                                        value={weight1}
                                                        onChange={(e) => setArrivalParam(zone, 'weight1', parseFloat(e.target.value))}
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                                                    />
                                                </div>
                                                {/* Max Rate */}
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-gray-500">Volume Max</span>
                                                        <span className="font-medium text-gray-900">{arrivalParams[zone].maxRate || 50} cmd/h</span>
                                                    </div>
                                                    <input
                                                        type="range" min="10" max="200" step="10"
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
                <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end">
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

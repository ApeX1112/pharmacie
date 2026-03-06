import React from 'react';
import { X, Clock, Sun, Moon } from 'lucide-react';
import useWarehouseStore from '../store/useWarehouseStore';

// Helper to check if a specific hour is inside a shift block
const isInsideBlock = (h, s, e) => {
    if (s <= e) return h >= s && h < e;
    return h >= s || h < e; // Wraps around midnight
};

// Sub-component to visualize the 24h timeline
const TimelineVisualizer = ({ shifts }) => {
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
        <div className="mt-4">
            <div className="flex w-full h-4 rounded-full overflow-hidden bg-slate-800 border border-slate-600">
                {hours.map(h => {
                    const isWork1 = isInsideBlock(h, shifts.start1, shifts.end1);
                    const isWork2 = isInsideBlock(h, shifts.start2, shifts.end2);
                    const isOverlap = isWork1 && isWork2;

                    let bgColor = 'bg-transparent';
                    if (isOverlap) bgColor = 'bg-purple-500';
                    else if (isWork1) bgColor = 'bg-blue-500';
                    else if (isWork2) bgColor = 'bg-green-500';

                    return (
                        <div
                            key={h}
                            className={`flex-1 flex justify-center items-center group relative ${bgColor}`}
                        >
                            {/* Hour tick mark */}
                            {h % 6 === 0 && <div className="absolute top-full mt-1 text-[10px] text-slate-400 font-mono">{h}h</div>}

                            {/* Hover tooltip for the specific hour */}
                            <div className="hidden group-hover:block absolute bottom-full mb-1 bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded border border-slate-600 z-10 whitespace-nowrap">
                                {h}h
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* Timeline legend/padding block */}
            <div className="h-6 w-full flex justify-between px-1 text-slate-500 mt-1">
                <Sun size={12} className="text-yellow-500 mt-1" />
                <Sun size={12} className="text-orange-500 mt-1" />
                <Moon size={12} className="text-indigo-400 mt-1" />
            </div>
        </div>
    );
};

const ShiftsModal = ({ isOpen, onClose }) => {
    const { agents, updateAgentShifts } = useWarehouseStore();

    if (!isOpen) return null;

    // Filter out the controller
    const shiftAgents = agents.filter(a => a.type !== 'Controller');

    const handleShiftChange = (id, currentShifts, key, value) => {
        const newShifts = { ...currentShifts, [key]: parseInt(value) };
        updateAgentShifts(id, newShifts);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] backdrop-blur-md">
            <div className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-700 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex justify-between items-center px-8 py-5 border-b border-slate-700 bg-slate-800/80 sticky top-0 rounded-t-2xl z-20">
                    <div className="flex items-center space-x-4">
                        <div className="p-2.5 bg-blue-500/20 rounded-xl">
                            <Clock className="text-blue-400" size={26} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-wide">Plannings & Quarts de Travail</h2>
                            <p className="text-sm text-slate-400 mt-0.5">Configurer 2 blocs de travail par agent (supporte les nuits et pauses)</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 overflow-y-auto space-y-6 flex-1 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
                    {shiftAgents.map(agent => (
                        <div key={agent.id} className="bg-slate-700/40 border border-slate-600 rounded-xl p-5 hover:border-slate-500 transition-colors">

                            {/* Agent Header */}
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-600/50">
                                <div className="flex items-center space-x-3">
                                    <span className={`px-2.5 py-1 rounded text-sm font-bold shadow-sm ${agent.type === 'Storekeeper' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                        }`}>
                                        {agent.id}
                                    </span>
                                    <span className="text-white font-semibold">{agent.type}</span>
                                </div>
                                <div className="flex space-x-3 text-xs font-mono">
                                    <span className="bg-blue-500/10 text-blue-300 px-2 py-1 rounded border border-blue-500/20">
                                        Bloc 1: {agent.shifts.start1}h - {agent.shifts.end1}h
                                    </span>
                                    <span className="bg-green-500/10 text-green-300 px-2 py-1 rounded border border-green-500/20">
                                        Bloc 2: {agent.shifts.start2}h - {agent.shifts.end2}h
                                    </span>
                                </div>
                            </div>

                            {/* Sliders Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Block 1 */}
                                <div className="space-y-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Bloc de Travail 1</h4>

                                    <div>
                                        <div className="flex justify-between text-xs text-slate-400 mb-2">
                                            <span>Début: <strong className="text-white">{agent.shifts.start1}h</strong></span>
                                        </div>
                                        <input
                                            type="range" min="0" max="23"
                                            value={agent.shifts.start1}
                                            onChange={(e) => handleShiftChange(agent.id, agent.shifts, 'start1', e.target.value)}
                                            className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:h-2 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs text-slate-400 mb-2">
                                            <span>Fin: <strong className="text-white">{agent.shifts.end1}h</strong></span>
                                        </div>
                                        <input
                                            type="range" min="0" max="24"
                                            value={agent.shifts.end1}
                                            onChange={(e) => handleShiftChange(agent.id, agent.shifts, 'end1', e.target.value)}
                                            className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-400 hover:h-2 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Block 2 */}
                                <div className="space-y-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                    <h4 className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">Bloc de Travail 2</h4>

                                    <div>
                                        <div className="flex justify-between text-xs text-slate-400 mb-2">
                                            <span>Début: <strong className="text-white">{agent.shifts.start2}h</strong></span>
                                        </div>
                                        <input
                                            type="range" min="0" max="23"
                                            value={agent.shifts.start2}
                                            onChange={(e) => handleShiftChange(agent.id, agent.shifts, 'start2', e.target.value)}
                                            className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-green-500 hover:h-2 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs text-slate-400 mb-2">
                                            <span>Fin: <strong className="text-white">{agent.shifts.end2}h</strong></span>
                                        </div>
                                        <input
                                            type="range" min="0" max="24"
                                            value={agent.shifts.end2}
                                            onChange={(e) => handleShiftChange(agent.id, agent.shifts, 'end2', e.target.value)}
                                            className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-green-400 hover:h-2 transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 24h Timeline Visualizer */}
                            <TimelineVisualizer shifts={agent.shifts} />

                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-8 py-5 border-t border-slate-700 bg-slate-800/80 sticky bottom-0 rounded-b-2xl flex justify-between items-center">
                    <p className="text-xs text-slate-400 max-w-md">
                        * Astuce : Si l'heure de fin est inférieure à l'heure de début (ex: 22h - 04h), le système simulera automatiquement un <span className="text-indigo-300">quart de nuit</span>. L'espace gris représente le temps de repos.
                    </p>
                    <button
                        onClick={onClose}
                        className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                    >
                        Terminer
                    </button>
                </div>

            </div>
        </div>
    );
};

export default ShiftsModal;

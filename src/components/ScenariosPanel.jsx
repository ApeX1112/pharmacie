import React from 'react';
import useWarehouseStore from '../store/useWarehouseStore';
import { X, FlaskConical, Play, RotateCcw, Save, Users, TrendingUp, Snowflake, AlertTriangle, Timer } from 'lucide-react';

const scenarios = [
    {
        id: 'plus20_commands',
        name: '+20% Commandes',
        description: 'Augmenter le volume de commandes de 20%',
        icon: TrendingUp,
        color: 'blue'
    },
    {
        id: 'minus1_picker',
        name: '-1 Préparateur',
        description: 'Simuler l\'absence d\'un préparateur',
        icon: Users,
        color: 'orange'
    },
    {
        id: 'frequent_rupture',
        name: 'Rupture Fréquente',
        description: 'Stock picking réduit sous le seuil',
        icon: AlertTriangle,
        color: 'red'
    },
    {
        id: 'slow_control',
        name: 'Contrôle Ralenti',
        description: 'Doubler le temps de contrôle qualité',
        icon: Timer,
        color: 'purple'
    }
];

const colorMap = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', hover: 'hover:bg-blue-100', icon: 'text-blue-500' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600', hover: 'hover:bg-orange-100', icon: 'text-orange-500' },
    cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-600', hover: 'hover:bg-cyan-100', icon: 'text-cyan-500' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', hover: 'hover:bg-red-100', icon: 'text-red-500' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600', hover: 'hover:bg-purple-100', icon: 'text-purple-500' },
};

const ScenariosPanel = ({ isOpen, onClose }) => {
    const scenarioActive = useWarehouseStore(state => state.scenarioActive);
    const baselineSnapshot = useWarehouseStore(state => state.baselineSnapshot);
    const baselineMetrics = useWarehouseStore(state => state.baselineMetrics);
    const metrics = useWarehouseStore(state => state.metrics);
    const saveBaseline = useWarehouseStore(state => state.saveBaseline);
    const resetToBaseline = useWarehouseStore(state => state.resetToBaseline);
    const applyScenario = useWarehouseStore(state => state.applyScenario);

    if (!isOpen) return null;

    const handleApply = (id) => {
        if (!baselineSnapshot) {
            saveBaseline();
        }
        applyScenario(id);
    };

    const handleReset = () => {
        resetToBaseline();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <FlaskConical className="w-5 h-5 text-indigo-600" />
                            Scénarios "What-If"
                        </h2>
                        <p className="text-gray-500 text-sm mt-0.5">
                            Testez différentes configurations et comparez les résultats
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">

                    {/* Active Scenario Banner */}
                    {scenarioActive && (
                        <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Play size={14} className="text-indigo-600" />
                                <span className="text-sm font-medium text-indigo-700">
                                    Scénario actif: {scenarios.find(s => s.id === scenarioActive)?.name || scenarioActive}
                                </span>
                            </div>
                            <button
                                onClick={handleReset}
                                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-md text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition"
                            >
                                <RotateCcw size={12} /> Réinitialiser
                            </button>
                        </div>
                    )}

                    {/* Baseline vs Current Comparison */}
                    {baselineSnapshot && (
                        <div className="mb-4 bg-gray-50 border border-indigo-200 rounded-lg p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <h4 className="text-sm font-bold text-indigo-800 uppercase">Comparaison : Réf. vs Actuel</h4>
                                <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
                                    Scénario en cours
                                </span>
                            </div>

                            <div className="grid grid-cols-4 gap-4 text-center">
                                {/* Commandes */}
                                <div className="bg-white p-2 rounded border border-gray-100 shadow-sm flex flex-col items-center">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Commandes</p>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-gray-400 line-through text-xs">{baselineMetrics?.completedOrders || 0}</p>
                                        <p className={`font-bold text-sm ${(metrics.completedOrders || 0) > (baselineMetrics?.completedOrders || 0) ? 'text-emerald-600' :
                                            (metrics.completedOrders || 0) < (baselineMetrics?.completedOrders || 0) ? 'text-red-500' : 'text-gray-700'
                                            }`}>
                                            {metrics.completedOrders || 0}
                                        </p>
                                    </div>
                                </div>

                                {/* Débit */}
                                <div className="bg-white p-2 rounded border border-gray-100 shadow-sm flex flex-col items-center">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Débit (cmd/h)</p>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-gray-400 line-through text-xs">{(baselineMetrics?.throughput || 0).toFixed(2)}</p>
                                        <p className={`font-bold text-sm ${(metrics.throughput || 0) > (baselineMetrics?.throughput || 0) ? 'text-emerald-600' :
                                            (metrics.throughput || 0) < (baselineMetrics?.throughput || 0) ? 'text-red-500' : 'text-gray-700'
                                            }`}>
                                            {(metrics.throughput || 0).toFixed(2)}
                                        </p>
                                    </div>
                                </div>

                                {/* Utilisation Préparateurs */}
                                <div className="bg-white p-2 rounded border border-gray-100 shadow-sm flex flex-col items-center">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Util. Prépa.</p>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-gray-400 line-through text-xs">{(baselineMetrics?.pickerUtilization || 0).toFixed(0)}%</p>
                                        <p className={`font-bold text-sm ${(metrics.pickerUtilization || 0) < (baselineMetrics?.pickerUtilization || 0) ? 'text-emerald-600' :
                                            (metrics.pickerUtilization || 0) > (baselineMetrics?.pickerUtilization || 0) ? 'text-red-500' : 'text-gray-700'
                                            }`}>
                                            {(metrics.pickerUtilization || 0).toFixed(0)}%
                                        </p>
                                    </div>
                                </div>

                                {/* Ruptures Picking */}
                                <div className="bg-white p-2 rounded border border-gray-100 shadow-sm flex flex-col items-center">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Taux Ruptures</p>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-gray-400 line-through text-xs">{(baselineMetrics?.pickingRuptureRate || 0).toFixed(0)}%</p>
                                        <p className={`font-bold text-sm ${(metrics.pickingRuptureRate || 0) < (baselineMetrics?.pickingRuptureRate || 0) ? 'text-emerald-600' :
                                            (metrics.pickingRuptureRate || 0) > (baselineMetrics?.pickingRuptureRate || 0) ? 'text-red-500' : 'text-gray-700'
                                            }`}>
                                            {(metrics.pickingRuptureRate || 0).toFixed(0)}%
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Scenario Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {scenarios.map(scenario => {
                            const c = colorMap[scenario.color];
                            const isActive = scenarioActive === scenario.id;
                            return (
                                <div
                                    key={scenario.id}
                                    className={`${c.bg} border ${c.border} rounded-lg p-4 transition-all ${isActive ? 'ring-2 ring-offset-1 ring-indigo-400' : c.hover} cursor-pointer`}
                                    onClick={() => handleApply(scenario.id)}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`p-2 rounded-lg bg-white shadow-sm`}>
                                            <scenario.icon size={20} className={c.icon} />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className={`text-sm font-bold ${c.text}`}>{scenario.name}</h4>
                                            <p className="text-xs text-gray-500 mt-0.5">{scenario.description}</p>
                                            {isActive && (
                                                <span className="inline-block mt-1.5 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
                                                    ACTIF
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Save Baseline Button */}
                    {!baselineSnapshot && (
                        <div className="mt-4">
                            <button
                                onClick={saveBaseline}
                                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 transition"
                            >
                                <Save size={14} />
                                Sauvegarder la Baseline actuelle
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between">
                    {baselineSnapshot && (
                        <button
                            onClick={handleReset}
                            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-1.5"
                        >
                            <RotateCcw size={14} /> Réinitialiser tout
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm ml-auto"
                    >
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScenariosPanel;

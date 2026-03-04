import React from 'react';
import useWarehouseStore from '../store/useWarehouseStore';
import { AlertTriangle, AlertCircle, XCircle } from 'lucide-react';

const AlertsPanel = () => {
    const alerts = useWarehouseStore(state => state.alerts);

    if (!alerts || alerts.length === 0) {
        return (
            <div className="px-3 pb-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-emerald-600 font-medium">✓ Aucune alerte active</p>
                </div>
            </div>
        );
    }

    const criticals = alerts.filter(a => a.severity === 'critical');
    const warnings = alerts.filter(a => a.severity === 'warning');

    return (
        <div className="px-3 pb-3 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-red-500" />
                Alertes ({alerts.length})
            </h3>

            {/* Critical alerts */}
            {criticals.map(alert => (
                <div key={alert.id} className="bg-red-50 border border-red-200 rounded-lg p-2.5 animate-pulse">
                    <div className="flex items-start gap-2">
                        <XCircle size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-red-700">CRITIQUE</p>
                            <p className="text-xs text-red-600 mt-0.5">{alert.message}</p>
                        </div>
                    </div>
                </div>
            ))}

            {/* Warning alerts */}
            {warnings.map(alert => (
                <div key={alert.id} className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <div className="flex items-start gap-2">
                        <AlertCircle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-amber-700">ATTENTION</p>
                            <p className="text-xs text-amber-600 mt-0.5">{alert.message}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AlertsPanel;

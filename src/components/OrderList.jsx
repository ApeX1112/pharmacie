import React, { useRef, useEffect } from 'react';
import useWarehouseStore from '../store/useWarehouseStore';
import { Package, CheckCircle, Clock } from 'lucide-react';

const OrderList = () => {
    const orders = useWarehouseStore(state => state.orders);
    const bottomRef = useRef(null);

    // Auto-scroll to bottom of list when new orders arrive
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [orders.length]);

    // Show only active orders (pending or assigned), limit to 20 most recent
    const activeOrders = orders.filter(o => o.status === 'pending' || o.status === 'assigned');
    const visibleOrders = activeOrders.slice(-20);

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
            <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-600" />
                    Liste des Commandes (Picking)
                </h3>
                <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                    {activeOrders.length} En attente
                </span>
            </div>

            <div className="flex-1 overflow-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-2 border-b">ID</th>
                            <th className="px-4 py-2 border-b">Zone</th>
                            <th className="px-4 py-2 border-b">Quantité</th>
                            <th className="px-4 py-2 border-b">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {visibleOrders.map((order) => (
                            <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-2 font-mono text-xs">{order.id.slice(0, 8)}</td>
                                <td className="px-4 py-2">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium 
                                        ${order.zoneId.includes('A') ? 'bg-red-100 text-red-700' :
                                            order.zoneId.includes('B') ? 'bg-blue-100 text-blue-700' :
                                                order.zoneId.includes('C') ? 'bg-green-100 text-green-700' :
                                                    order.zoneId.includes('Q') || order.zoneId.includes('P') ? 'bg-purple-100 text-purple-700' :
                                                        'bg-amber-100 text-amber-700'}`}>
                                        {order.zoneId.replace('zone_', '').replace('_pick', '').toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-4 py-2 font-medium">{order.quantity}</td>
                                <td className="px-4 py-2">
                                    {order.status === 'completed' ? (
                                        <span className="flex items-center gap-1 text-green-600 text-xs">
                                            <CheckCircle className="w-3 h-3" /> Terminé
                                        </span>
                                    ) : order.status === 'assigned' ? (
                                        <span className="flex items-center gap-1 text-blue-600 text-xs">
                                            <Clock className="w-3 h-3" /> En cours
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-gray-400 text-xs">
                                            <Clock className="w-3 h-3" /> En attente
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        <div ref={bottomRef} />
                    </tbody>
                </table>

                {visibleOrders.length === 0 && (
                    <div className="p-8 text-center text-gray-400 text-sm">
                        Aucune commande en attente
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrderList;

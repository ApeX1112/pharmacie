import React from 'react';
import useWarehouseStore from '../store/useWarehouseStore';

const Dashboard = () => {
    const { metrics, agents } = useWarehouseStore();

    return (
        <div className="w-80 bg-gray-50 flex flex-col border-l border-gray-200 p-4">
            <h2 className="text-xl font-bold mb-4">Dashboard</h2>
            <div className="space-y-4">
                <div className="bg-white p-3 rounded shadow-sm border-l-4 border-indigo-500">
                    <p className="text-sm text-gray-500">Total Arrivals</p>
                    <p className="text-2xl font-bold">{metrics.totalArrivals}</p>
                </div>
                <div className="bg-white p-3 rounded shadow-sm">
                    <p className="text-sm text-gray-500">Completed Orders</p>
                    <p className="text-2xl font-bold">{metrics.completedOrders}</p>
                </div>
                <div className="bg-white p-3 rounded shadow-sm">
                    <p className="text-sm text-gray-500">Agents Active</p>
                    <p className="text-2xl font-bold">{agents.length}</p>
                </div>
                <div className="bg-white p-3 rounded shadow-sm">
                    <p className="text-sm text-gray-500">Total Distance (m)</p>
                    <p className="text-2xl font-bold">{metrics.totalDistance.toFixed(2)}</p>
                </div>
            </div>
        </div>
    );
};


export default Dashboard;

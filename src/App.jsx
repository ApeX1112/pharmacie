import React, { useEffect } from 'react';
import WarehouseMap from './components/WarehouseMap';
import Dashboard from './components/Dashboard';
import Sidebar from './components/Sidebar';
import OrderList from './components/OrderList';
import { useSimulation } from './simulation/useSimulation';
import useWarehouseStore from './store/useWarehouseStore';

function App() {
  const setLayoutConfig = useWarehouseStore(state => state.setLayoutConfig);
  useSimulation();

  useEffect(() => {
    fetch('/config.json')
      .then(res => res.json())
      .then(data => setLayoutConfig(data))
      .catch(err => console.error("Failed to load config:", err));
  }, [setLayoutConfig]);

  return (
    <div className="h-screen w-screen flex bg-gray-100 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full relative">
        <div className="flex-1 relative">
          <WarehouseMap />
        </div>
        <div className="h-1/3 border-t border-gray-200">
          <OrderList />
        </div>
      </div>
      <Dashboard />
    </div>
  )
}

export default App



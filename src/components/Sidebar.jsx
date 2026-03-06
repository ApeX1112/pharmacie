import React, { useRef, useState } from "react";
import useWarehouseStore from "../store/useWarehouseStore";
import {
  Play,
  Pause,
  Upload,
  List,
  Plus,
  Settings,
  Shuffle,
  FlaskConical,
  Clock,
} from "lucide-react";
import { parseExcelOrders } from "../utils/ExcelImporter";
import OrderList from "./OrderList";
import ArrivalsModal from "./ArrivalsModal";
import ShiftsModal from "./ShiftsModal";
import ScenariosPanel from "./ScenariosPanel";

const Sidebar = () => {
  const {
    isPlaying,
    togglePlay,
    simulationSpeed,
    setSpeed,
    addOrder,
    randomizeStock,
  } = useWarehouseStore();
  const fileInputRef = useRef(null);
  const [showOrderList, setShowOrderList] = useState(false);
  const [showArrivalsConfig, setShowArrivalsConfig] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);
  const [showShifts, setShowShifts] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const orders = await parseExcelOrders(file);
      console.log("Imported orders:", orders);
      orders.forEach((o) => addOrder(o));
      alert(`Imported ${orders.length} orders!`);
    } catch (err) {
      console.error(err);
      alert("Failed to import orders");
    }
  };

  const handleAddRandomOrder = () => {
    const config = useWarehouseStore.getState().layoutConfig;
    if (!config) return;

    const pickingZones = config.zones
      .filter((z) => z.type === "picking")
      .map((z) => z.id);
    const randomZone =
      pickingZones[Math.floor(Math.random() * pickingZones.length)];

    const order = {
      id: `RND-${Math.floor(Math.random() * 1000)}`,
      zoneId: randomZone,
      items: [],
      assigned: false,
    };
    addOrder(order);
  };

  return (
    <>
      <div className="w-16 bg-slate-800 flex flex-col items-center py-4 space-y-4 text-white z-50 relative">
        <button
          onClick={togglePlay}
          className="p-2 hover:bg-slate-700 rounded transition"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} />}
        </button>

        <button
          onClick={() => setShowOrderList(!showOrderList)}
          className={`p-2 rounded transition ${showOrderList ? "bg-blue-600" : "hover:bg-slate-700"}`}
          title="Orders List"
        >
          <List size={24} />
        </button>

        <button
          onClick={handleAddRandomOrder}
          className="p-2 hover:bg-slate-700 rounded transition"
          title="Add Random Order"
        >
          <Plus size={24} />
        </button>

        <button
          onClick={randomizeStock}
          className="p-2 hover:bg-slate-700 rounded transition"
          title="Randomize Stock Levels"
        >
          <Shuffle size={24} />
        </button>

        <div className="flex flex-col items-center space-y-1">
          <span className="text-xs text-gray-400">Speed</span>
          <button
            onClick={() => setSpeed(1)}
            className={`p-1 rounded ${simulationSpeed === 1 ? "bg-blue-600" : "hover:bg-slate-700"}`}
          >
            1 s/s
          </button>
          <button
            onClick={() => setSpeed(60)}
            className={`p-1 rounded ${simulationSpeed === 60 ? "bg-blue-600" : "hover:bg-slate-700"}`}
          >
            1 min/s
          </button>
          <button
            onClick={() => setSpeed(3600)}
            className={`p-1 rounded ${simulationSpeed === 3600 ? "bg-blue-600" : "hover:bg-slate-700"}`}
          >
            1 h/s
          </button>
          <button
            onClick={() => setSpeed(21600)}
            className={`p-1 rounded ${simulationSpeed === 21600 ? "bg-blue-600" : "hover:bg-slate-700"}`}
          >
            6 h/s
          </button>
        </div>

        <div className="flex flex-col items-center space-y-1">
          <span className="text-xs text-gray-400">Arrivées</span>
          <button
            onClick={() => setShowArrivalsConfig(true)}
            className="p-2 hover:bg-slate-700 rounded transition text-blue-400"
            title="Configurer les Arrivées"
          >
            <Settings size={24} />
          </button>
        </div>

        {/* Scenarios Button */}
        <div className="flex flex-col items-center space-y-1">
          <span className="text-xs text-gray-400">What-If</span>
          <button
            onClick={() => setShowScenarios(true)}
            className="p-2 hover:bg-slate-700 rounded transition text-purple-400"
            title="Scénarios What-If"
          >
            <FlaskConical size={24} />
          </button>
        </div>

        {/* Shifts Button */}
        <div className="flex flex-col items-center space-y-1">
          <span className="text-xs text-gray-400">Shifts</span>
          <button
            onClick={() => setShowShifts(true)}
            className="p-2 hover:bg-slate-700 rounded transition text-amber-400"
            title="Configurer les Horaires (Shifts)"
          >
            <Clock size={24} />
          </button>
        </div>

        <div className="flex flex-col items-center space-y-1">
          <span className="text-xs text-gray-400">Freq.</span>
          <input
            type="range"
            min="1"
            max="60"
            value={useWarehouseStore(
              (state) => state.parameters.inboundFrequency,
            )}
            onChange={(e) =>
              useWarehouseStore
                .getState()
                .setParameter("inboundFrequency", parseInt(e.target.value))
            }
            className="w-12 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            title={`Inbound Frequency: ${useWarehouseStore((state) => state.parameters.inboundFrequency)}s`}
          />
        </div>

        <div className="flex flex-col items-center space-y-1">
          <span className="text-xs text-gray-400">Repl.</span>
          <input
            type="range"
            min="0"
            max="100"
            value={useWarehouseStore(
              (state) => state.parameters.replenishThreshold,
            )}
            onChange={(e) =>
              useWarehouseStore
                .getState()
                .setParameter("replenishThreshold", parseInt(e.target.value))
            }
            className="w-12 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            title={`Replenishment Threshold: ${useWarehouseStore((state) => state.parameters.replenishThreshold)}`}
          />
        </div>

        <div className="border-t border-slate-600 w-10 my-2"></div>

        <button
          onClick={() => fileInputRef.current.click()}
          className="p-2 hover:bg-slate-700 rounded transition"
          title="Upload Excel Orders"
        >
          <Upload size={24} />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept=".xlsx, .xls, .csv"
        />
      </div>

      {showOrderList && <OrderList onClose={() => setShowOrderList(false)} />}
      {showArrivalsConfig && (
        <ArrivalsModal
          isOpen={showArrivalsConfig}
          onClose={() => setShowArrivalsConfig(false)}
        />
      )}
      {showScenarios && (
        <ScenariosPanel
          isOpen={showScenarios}
          onClose={() => setShowScenarios(false)}
        />
      )}
      {showShifts && (
        <ShiftsModal isOpen={showShifts} onClose={() => setShowShifts(false)} />
      )}
    </>
  );
};

export default Sidebar;

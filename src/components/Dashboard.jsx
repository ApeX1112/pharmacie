import React from "react";
import useWarehouseStore from "../store/useWarehouseStore";
import AlertsPanel from "./AlertsPanel";
import {
  Clock,
  Package,
  Truck,
  Users,
  Activity,
  AlertTriangle,
  Gauge,
  TrendingUp,
  Timer,
  BarChart3,
} from "lucide-react";

const KpiCard = ({
  icon: Icon,
  label,
  value,
  unit,
  accent = "indigo",
  small = false,
}) => {
  const accents = {
    indigo: "border-indigo-500 text-indigo-600",
    orange: "border-orange-400 text-orange-500",
    green: "border-emerald-500 text-emerald-600",
    red: "border-red-500 text-red-500",
    blue: "border-blue-500 text-blue-500",
    purple: "border-purple-500 text-purple-500",
    amber: "border-amber-500 text-amber-500",
    cyan: "border-cyan-500 text-cyan-500",
  };
  return (
    <div
      className={`bg-white p-2.5 rounded-lg shadow-sm border-l-4 ${accents[accent] || accents.indigo}`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon size={small ? 12 : 14} className="text-gray-400" />
        <p className="text-xs text-gray-500 truncate">{label}</p>
      </div>
      <div className="flex items-baseline gap-1">
        <p
          className={`${small ? "text-lg" : "text-xl"} font-bold text-gray-800`}
        >
          {value}
        </p>
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { metrics, agents, timeInfo, orders, alerts } = useWarehouseStore();

  // Format simulation clock
  const day = timeInfo?.day || 1;
  const hourRaw = timeInfo?.hour || 6;
  const hh = Math.floor(hourRaw);
  const mmFloat = (hourRaw % 1) * 60;
  const mm = Math.floor(mmFloat);
  const ss = Math.floor((mmFloat % 1) * 60);
  const timeStr = `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const assignedCount = orders.filter((o) => o.status === "assigned").length;

  return (
    <div className="w-80 bg-gray-50 flex flex-col border-l border-gray-200 overflow-y-auto">
      {/* Clock Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-blue-300" />
            <span className="text-xs text-gray-300 uppercase tracking-wider">
              Simulation
            </span>
          </div>
          <span className="text-xs text-gray-400">Jour {day}</span>
        </div>
        <p className="text-3xl font-mono font-bold tracking-wider mt-1">
          {timeStr}
        </p>
      </div>

      {/* KPIs Grid */}
      <div className="p-3 space-y-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Indicateurs Clés
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <KpiCard
            icon={Package}
            label="Arrivées"
            value={metrics.totalArrivals}
            accent="indigo"
            small
          />
          <KpiCard
            icon={Truck}
            label="Terminées"
            value={metrics.completedOrders}
            accent="green"
            small
          />
          <KpiCard
            icon={Activity}
            label="Réappro."
            value={metrics.totalReplenishments || 0}
            accent="orange"
            small
          />
          <KpiCard
            icon={Users}
            label="Agents"
            value={agents.length}
            accent="blue"
            small
          />
        </div>

        <div className="border-t border-gray-200 pt-2 mt-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Performance
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <KpiCard
              icon={Timer}
              label="Moy. Prépa."
              value={((metrics.avgPrepTime || 0) * 60).toFixed(1)}
              unit="min"
              accent="purple"
              small
            />
            <KpiCard
              icon={Clock}
              label="Attente Ctrl"
              value={((metrics.avgControlWaitTime || 0) * 60).toFixed(1)}
              unit="min"
              accent="amber"
              small
            />
            <KpiCard
              icon={Users}
              label="Util. Prépa."
              value={(metrics.pickerUtilization || 0).toFixed(0)}
              unit="%"
              accent="cyan"
              small
            />
            <KpiCard
              icon={Gauge}
              label="Util. Convoyeur"
              value={(metrics.conveyorUtilization || 0).toFixed(0)}
              unit="%"
              accent="blue"
              small
            />
            <KpiCard
              icon={AlertTriangle}
              label="Rupture Pick."
              value={(metrics.pickingRuptureRate || 0).toFixed(0)}
              unit="%"
              accent="red"
              small
            />
            <KpiCard
              icon={BarChart3}
              label="En attente"
              value={metrics.pendingOrders || pendingCount}
              accent="amber"
              small
            />
          </div>
        </div>

        <div className="border-t border-gray-200 pt-2 mt-2">
          <div className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-emerald-500">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp size={14} className="text-emerald-500" />
              <p className="text-xs text-gray-500">Débit</p>
            </div>
            <div className="flex items-baseline gap-1">
              <p className="text-2xl font-bold text-gray-800">
                {(metrics.throughput || 0).toFixed(2)}
              </p>
              <span className="text-xs text-gray-400">cmd/heure</span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-2 mt-2">
          <div className="bg-white p-2.5 rounded-lg shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity size={12} className="text-gray-400" />
              <p className="text-xs text-gray-500">Distance Totale</p>
            </div>
            <p className="text-lg font-bold text-gray-700">
              {(metrics.totalDistance || 0).toFixed(0)}{" "}
              <span className="text-xs text-gray-400">m</span>
            </p>
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      <AlertsPanel />
    </div>
  );
};

export default Dashboard;

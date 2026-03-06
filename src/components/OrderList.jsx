import React, { useRef, useEffect, useMemo, useState } from "react";
import useWarehouseStore from "../store/useWarehouseStore";
import { Package, CheckCircle, Clock } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";

const KPI_SAMPLE_HOURS = 0.05;
const KPI_WINDOW_HOURS = 24 * 7;
const MAX_KPI_POINTS = Math.ceil(KPI_WINDOW_HOURS / KPI_SAMPLE_HOURS);

const OrderList = () => {
  const { orders, metrics, timeInfo } = useWarehouseStore();
  const bottomRef = useRef(null);
  const [activeTab, setActiveTab] = useState("orders");
  const [kpiHistory, setKpiHistory] = useState([]);
  const lastSampleRef = useRef(0);

  // Auto-scroll to bottom of list when new orders arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [orders.length]);

  // Show all active orders (pending or assigned)
  const activeOrders = orders.filter(
    (o) => o.status === "pending" || o.status === "assigned",
  );
  const visibleOrders = activeOrders;
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const assignedCount = orders.filter((o) => o.status === "assigned").length;

  const timeLabel = useMemo(() => {
    if (!timeInfo) return "";
    const day = timeInfo.day || 1;
    const hh = Math.floor(timeInfo.hour || 0);
    const mm = Math.floor(((timeInfo.hour || 0) % 1) * 60);
    return `J${day} ${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
  }, [timeInfo]);

  useEffect(() => {
    if (!timeInfo) return;
    const now = timeInfo.totalHours || 0;
    if (now - lastSampleRef.current < KPI_SAMPLE_HOURS) return;
    lastSampleRef.current = now;
    const dataPoint = {
      t: timeLabel,
      active: activeOrders.length,
      throughput: Number((metrics.throughput || 0).toFixed(2)),
      pickerUtil: Number((metrics.pickerUtilization || 0).toFixed(1)),
      conveyorUtil: Number((metrics.conveyorUtilization || 0).toFixed(1)),
      prepTimeMin: Number(((metrics.avgPrepTime || 0) * 60).toFixed(2)),
      controlWaitMin: Number(
        ((metrics.avgControlWaitTime || 0) * 60).toFixed(2),
      ),
    };

    setKpiHistory((prev) => {
      const next = [...prev, dataPoint];
      return next.slice(-MAX_KPI_POINTS);
    });
  }, [
    timeInfo?.totalHours,
    timeLabel,
    activeOrders.length,
    metrics.throughput,
    metrics.pickerUtilization,
    metrics.conveyorUtilization,
    metrics.avgPrepTime,
    metrics.avgControlWaitTime,
  ]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
      <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600" />
            Commandes & KPIs
          </h3>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                activeTab === "orders"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Commandes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("kpis")}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                activeTab === "kpis"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              KPIs
            </button>
          </div>
        </div>
        <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
          {activeOrders.length} En attente
        </span>
      </div>

      {activeTab === "orders" ? (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 border-b">ID</th>
                <th className="px-4 py-2 border-b">Zone</th>
                <th className="px-4 py-2 border-b">Quantite</th>
                <th className="px-4 py-2 border-b">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleOrders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-xs">
                    {order.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium 
                                            ${
                                              order.zoneId.includes("A")
                                                ? "bg-red-100 text-red-700"
                                                : order.zoneId.includes("B")
                                                  ? "bg-blue-100 text-blue-700"
                                                  : order.zoneId.includes("C")
                                                    ? "bg-green-100 text-green-700"
                                                    : order.zoneId.includes(
                                                          "Q",
                                                        ) ||
                                                        order.zoneId.includes(
                                                          "P",
                                                        )
                                                      ? "bg-purple-100 text-purple-700"
                                                      : "bg-amber-100 text-amber-700"
                                            }`}
                    >
                      {order.zoneId
                        .replace("zone_", "")
                        .replace("_pick", "")
                        .toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-medium">{order.quantity}</td>
                  <td className="px-4 py-2">
                    {order.status === "completed" ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle className="w-3 h-3" /> Termine
                      </span>
                    ) : order.status === "assigned" ? (
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
              <tr ref={bottomRef}>
                <td colSpan={4} className="p-0"></td>
              </tr>
            </tbody>
          </table>

          {visibleOrders.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">
              Aucune commande en attente
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 bg-white">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Commandes Actives
                </h4>
                <span className="text-xs text-gray-500">
                  {pendingCount} en attente, {assignedCount} en cours
                </span>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={kpiHistory}
                    margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="active"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Debit (cmd/heure)
                </h4>
                <span className="text-xs text-gray-500">
                  {(metrics.throughput || 0).toFixed(2)}
                </span>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={kpiHistory}
                    margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="throughputFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#10b981"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="#10b981"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="throughput"
                      stroke="#10b981"
                      fill="url(#throughputFill)"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Utilisation
                </h4>
                <span className="text-xs text-gray-500">
                  Pickers vs Convoyeur
                </span>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={kpiHistory}
                    margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="pickerUtil"
                      name="Pickers"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="conveyorUtil"
                      name="Convoyeur"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Temps de traitement (min)
                </h4>
                <span className="text-xs text-gray-500">
                  Preparation vs Controle
                </span>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={kpiHistory}
                    margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="prepTimeMin"
                      name="Prep"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="controlWaitMin"
                      name="Controle"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderList;

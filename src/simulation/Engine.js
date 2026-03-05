

export class Engine {
    constructor(config) {
        this.config = config;
        this.agents = [];
        this.tasks = [];
        this.conveyorQueue = []; // Boxes on the conveyor belt

        // Advanced metrics tracking
        this.orderTimestamps = {}; // { orderId: { created, assigned, onConveyor, controlled, completed } }
        this.completedPrepTimes = [];
        this.completedControlWaits = [];
        this.completedCount = 0;
        this.lastHourCompletions = [];
    }

    loadAgents(agents) {
        this.agents = agents.map(a => ({ ...a }));
    }

    // Bimodal intensity: two Gaussian peaks
    bimodalIntensity(hour, params) {
        const { peak1, peak2, stdDev1, stdDev2, weight1, maxRate = 50 } = params;
        const w1 = weight1;
        const w2 = 1 - weight1;
        const g1 = Math.exp(-0.5 * Math.pow((hour - peak1) / stdDev1, 2));
        const g2 = Math.exp(-0.5 * Math.pow((hour - peak2) / stdDev2, 2));
        return (w1 * g1 + w2 * g2) * maxRate;
    }

    update(deltaTime, speed) {
        const dt = deltaTime * speed;
        const dtHours = dt;

        let distanceTraveledThisTick = 0;

        this.simulationTime = (this.simulationTime || 6) + dtHours;

        const currentHour = this.simulationTime % 24;
        const currentDay = Math.floor(this.simulationTime / 24) + 1;

        this.newOrders = [];
        this.completedOrderIds = [];

        // --- INBOUND GENERATION (Bimodal) ---
        if (!this.accumulators) this.accumulators = {};

        ['A', 'B', 'C', 'D'].forEach(zoneKey => {
            const params = this.config.parameters.arrivalParams?.[zoneKey];
            if (!params || !params.enabled) return;

            let intensity = 0;
            if (currentHour >= 6 && currentHour < 20) {
                intensity = this.bimodalIntensity(currentHour, params);
            }
            if (typeof this.accumulators[zoneKey] === 'undefined') this.accumulators[zoneKey] = 0;
            this.accumulators[zoneKey] += intensity * dtHours;

            while (this.accumulators[zoneKey] >= 1) {
                this.accumulators[zoneKey] -= 1;
                const reception = this.config.zones.find(z => z.id === 'reception');
                if (reception) {
                    if (!reception.arrivalQueue) reception.arrivalQueue = [];
                    reception.arrivalQueue.push({ destination: `zone_${zoneKey}_res`, type: zoneKey });
                    reception.stock = (reception.stock || 0) + 1;
                    this.totalArrivals = (this.totalArrivals || 0) + 1;
                }
            }
        });

        // --- OUTBOUND GENERATION (Bimodal) ---
        const outboundParams = this.config.parameters.outboundParams;
        if (outboundParams && outboundParams.enabled) {
            let outboundRate = 0;
            if (currentHour >= 6 && currentHour < 20) {
                outboundRate = this.bimodalIntensity(currentHour, outboundParams);
            }

            if (typeof this.outboundAccumulator === 'undefined') this.outboundAccumulator = 0;
            this.outboundAccumulator += outboundRate * dtHours;

            while (this.outboundAccumulator >= 1) {
                this.outboundAccumulator -= 1;
                const pendingCount = this.tasks.filter(t => t.status === 'pending').length;
                if (pendingCount >= 5) break;

                const pickZones = this.config.zones.filter(z =>
                    z.type === 'picking' || z.id.endsWith('_pick') ||
                    ['Q', 'P', 'N', 'M', 'L', 'F1', 'F2', 'F3', 'F4', 'R1', 'R2'].includes(z.id)
                );
                if (pickZones.length > 0) {
                    const targetZone = pickZones[Math.floor(Math.random() * pickZones.length)];
                    const quantity = Math.floor(Math.random() * 71) + 30;
                    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                    const newOrder = {
                        id: orderId,
                        zoneId: targetZone.id,
                        quantity: quantity,
                        status: 'pending',
                        creationDay: currentDay,
                        creationTime: `${Math.floor(currentHour)}:${Math.floor((currentHour % 1) * 60).toString().padStart(2, '0')}`,
                        assigned: false
                    };
                    this.tasks.push(newOrder);
                    this.newOrders.push(newOrder);
                    // Track timestamps
                    this.orderTimestamps[orderId] = { created: this.simulationTime };
                }
            }
        }

        // --- CONVEYOR BELT ANIMATION ---
        const conveyor = this.config.zones.find(z => z.id === 'conveyor');
        if (conveyor) {
            const conveyorSpeed = 40;
            this.conveyorQueue.forEach(box => {
                box.progress += conveyorSpeed * dt;
                if (box.progress >= 1) box.progress = 1;
                // Track waiting time
                if (!box.startTime) box.startTime = this.simulationTime;
            });
        }

        // --- AGENT UPDATES ---
        this.agents.forEach(agent => {
            this.updateAgentBehavior(agent, dt);
            if (agent.path && agent.path.length > 0) {
                const moved = this.followPath(agent, dt);
                distanceTraveledThisTick += moved;
            }
        });

        // --- COMPUTE ADVANCED METRICS ---
        const advancedMetrics = this.computeAdvancedMetrics(currentHour);

        // --- DETECT ALERTS ---
        const alerts = this.detectAlerts();

        return {
            agents: this.agents,
            distance: distanceTraveledThisTick,
            zones: this.config.zones,
            timeInfo: { day: currentDay, hour: currentHour, totalHours: this.simulationTime },
            totalArrivals: this.totalArrivals || 0,
            totalReplenishments: this.totalReplenishments || 0,
            conveyorQueue: this.conveyorQueue,
            newOrders: this.newOrders,
            completedOrderIds: this.completedOrderIds,
            advancedMetrics,
            alerts
        };
    }

    // ---------- ADVANCED METRICS ----------
    computeAdvancedMetrics(currentHour) {
        // Avg prep time (last 20 completed)
        const recentPrep = this.completedPrepTimes.slice(-20);
        const avgPrepTime = recentPrep.length > 0
            ? recentPrep.reduce((a, b) => a + b, 0) / recentPrep.length
            : 0;

        // Avg control wait time (last 20)
        const recentControl = this.completedControlWaits.slice(-20);
        const avgControlWaitTime = recentControl.length > 0
            ? recentControl.reduce((a, b) => a + b, 0) / recentControl.length
            : 0;

        // Picker utilization
        const pickers = this.agents.filter(a => a.type === 'Picker');
        const busyPickers = pickers.filter(a => a.state !== 'idle');
        const pickerUtilization = pickers.length > 0
            ? (busyPickers.length / pickers.length) * 100
            : 0;

        // Conveyor utilization (queue as % of max capacity=10)
        const conveyorUtilization = Math.min((this.conveyorQueue.length / 10) * 100, 100);

        // Picking rupture rate
        const pickZones = this.config.zones.filter(z => z.type === 'picking');
        const rupturedZones = pickZones.filter(z => z.stock !== undefined && z.stock <= 0);
        const pickingRuptureRate = pickZones.length > 0
            ? (rupturedZones.length / pickZones.length) * 100
            : 0;

        // Pending orders
        const pendingOrders = this.tasks.filter(t => t.status === 'pending').length;

        // Throughput (completed per hour since sim start)
        const elapsedHours = Math.max(this.simulationTime - 6, 0.01);
        const throughput = this.completedCount / elapsedHours;

        return {
            avgPrepTime,
            avgControlWaitTime,
            pickerUtilization,
            conveyorUtilization,
            pickingRuptureRate,
            pendingOrders,
            throughput
        };
    }

    // ---------- ALERT DETECTION ----------
    detectAlerts() {
        const alerts = [];
        const pickZones = this.config.zones.filter(z => z.type === 'picking');

        // Stock rupture
        pickZones.forEach(z => {
            if (z.stock !== undefined && z.stock <= 0) {
                alerts.push({
                    id: `rupture_${z.id}`,
                    type: 'rupture',
                    severity: 'critical',
                    message: `Rupture de stock: ${z.name} — stock épuisé`,
                    zoneId: z.id
                });
            } else if (z.stock !== undefined && z.threshold && z.stock <= z.threshold * 0.5) {
                alerts.push({
                    id: `low_${z.id}`,
                    type: 'low_stock',
                    severity: 'warning',
                    message: `Stock critique: ${z.name} — ${z.stock}/${z.capacity}`,
                    zoneId: z.id
                });
            }
        });

        // Conveyor bottleneck
        if (this.conveyorQueue.length > 5) {
            alerts.push({
                id: 'conveyor_bottleneck',
                type: 'bottleneck',
                severity: 'warning',
                message: `Convoyeur saturé: ${this.conveyorQueue.length} colis en attente`
            });
        }

        // All pickers busy + pending orders
        const pickers = this.agents.filter(a => a.type === 'Picker');
        const busyPickers = pickers.filter(a => a.state !== 'idle');
        const pendingOrders = this.tasks.filter(t => t.status === 'pending').length;
        if (busyPickers.length === pickers.length && pendingOrders > 3) {
            alerts.push({
                id: 'picker_overload',
                type: 'overload',
                severity: 'critical',
                message: `Préparateurs surchargés: ${pendingOrders} commandes en attente, tous les préparateurs occupés`
            });
        }

        // Controller queue
        const readyBoxes = this.conveyorQueue.filter(b => b.progress >= 1 && !b.controlled);
        if (readyBoxes.length > 3) {
            alerts.push({
                id: 'control_saturated',
                type: 'control_overload',
                severity: 'warning',
                message: `Contrôle saturé: ${readyBoxes.length} colis en attente de contrôle`
            });
        }

        return alerts;
    }

    // ---------- PICKING-RESERVE PAIRING ----------
    getReserveForPicking(pickZoneId) {
        const m = pickZoneId.match(/^zone_([A-Z])_pick$/);
        if (m) return `zone_${m[1]}_res`;
        return null;
    }

    // ---------- AGENT BEHAVIOR FSM ----------
    updateAgentBehavior(agent, dt) {
        if (!this.config || !this.config.zones) return;

        // Get scenario-modified control timer
        const scenarioActive = this.config.parameters?.scenarioActive;
        const controlTimerBase = scenarioActive === 'slow_control' ? 6 : 3;

        if (agent.state === 'idle') {
            // --- Idle collision: if too close to another agent, move to a nearby free node ---
            const tooClose = this.agents.find(other =>
                other.id !== agent.id &&
                Math.sqrt((other.x - agent.x) ** 2 + (other.y - agent.y) ** 2) < 25
            );
            if (tooClose && this.config.nodes) {
                const currentNode = this.findNearestNode(agent.x, agent.y);
                const neighbors = this.getNeighbors(currentNode);
                // Find a neighbor node that no other agent is near
                const freeNode = neighbors.find(n => {
                    return !this.agents.some(a =>
                        a.id !== agent.id &&
                        Math.sqrt((a.x - n.x) ** 2 + (a.y - n.y) ** 2) < 30
                    );
                });
                if (freeNode) {
                    agent.path = [freeNode];
                    agent.state = 'relocating';
                    return;
                }
            }
            // ========== STOREKEEPER ==========
            if (agent.type === 'Storekeeper') {
                const reception = this.config.zones.find(z => z.id === 'reception');

                // Priority 1: Inbound
                if (reception && reception.arrivalQueue && reception.arrivalQueue.length > 0) {
                    const job = reception.arrivalQueue[0];
                    const targetReserve = this.config.zones.find(z => z.id === job.destination);
                    if (targetReserve) {
                        reception.arrivalQueue.shift();
                        reception.stock--;
                        this.setAgentTarget(agent, reception.id, 'moving_to_inbound');
                        agent.nextTask = {
                            targetId: targetReserve.id,
                            state: 'depositing_reserve',
                            amount: 1,
                            itemType: job.type
                        };
                        return;
                    }
                }

                // Priority 2: Patrol
                const reserves = this.config.zones.filter(z => z.id.endsWith('_res'));
                const randomZone = reserves[Math.floor(Math.random() * reserves.length)];
                if (randomZone && Math.random() < 0.01) {
                    this.setAgentTarget(agent, randomZone.id, 'moving_to_zone');
                    agent.nextTask = { targetId: reception?.id || randomZone.id, state: 'returning' };
                }

                // ========== PICKER ==========
            } else if (agent.type === 'Picker') {
                // Priority 1: Picking Orders
                const pendingOrder = this.tasks.find(t => !t.assigned && t.status === 'pending');
                if (pendingOrder) {
                    pendingOrder.assigned = true;
                    pendingOrder.status = 'assigned';
                    this.setAgentTarget(agent, pendingOrder.zoneId, 'picking_order');
                    agent.currentOrder = pendingOrder;
                    // Track assignment time
                    if (this.orderTimestamps[pendingOrder.id]) {
                        this.orderTimestamps[pendingOrder.id].assigned = this.simulationTime;
                    }
                    return;
                }

                // Priority 2: Replenishment
                const pickZones = this.config.zones.filter(z => z.type === 'picking');
                for (const pickZone of pickZones) {
                    const threshold = pickZone.threshold ?? 20;
                    if (pickZone.stock !== undefined && pickZone.stock <= threshold) {
                        let reserveZone = null;
                        const reserveId = this.getReserveForPicking(pickZone.id);
                        if (reserveId) {
                            reserveZone = this.config.zones.find(z => z.id === reserveId && (z.stock || 0) > 0);
                        }

                        if (!reserveZone) {
                            const storageZones = this.config.zones.filter(z => z.type === 'storage' && (z.stock || 0) > 0);
                            if (storageZones.length > 0) {
                                reserveZone = storageZones[Math.floor(Math.random() * storageZones.length)];
                            }
                        }

                        if (!reserveZone) continue;

                        const alreadyAssigned = this.agents.some(a =>
                            a.id !== agent.id && a.replenishTarget === pickZone.id && a.state !== 'idle'
                        );
                        if (alreadyAssigned) continue;

                        const amount = Math.min(reserveZone.stock, pickZone.capacity - pickZone.stock, 50);
                        if (amount <= 0) continue;

                        agent.replenishTarget = pickZone.id;
                        agent.replenishAmount = amount;
                        this.setAgentTarget(agent, reserveZone.id, 'moving_to_reserve');
                        agent.nextTask = {
                            targetId: pickZone.id,
                            state: 'delivering_replenishment',
                            amount: amount
                        };
                        return;
                    }
                }

                // Priority 3: Patrol
                const rz = this.config.zones.filter(z => z.type === 'picking');
                const randomPz = rz[Math.floor(Math.random() * rz.length)];
                if (randomPz && Math.random() < 0.01) {
                    this.setAgentTarget(agent, randomPz.id, 'patrolling');
                }

                // ========== CONTROLLER ==========
            } else if (agent.type === 'Controller') {
                const readyBox = this.conveyorQueue.find(b => b.progress >= 1 && !b.controlled);
                if (readyBox) {
                    agent.controlBox = readyBox;
                    this.setAgentTarget(agent, 'conveyor', 'moving_to_conveyor');
                } else {
                    const pilulier = this.config.zones.find(z => z.id === 'pilulier');
                    if (pilulier && Math.random() < 0.005) {
                        this.setAgentTarget(agent, 'pilulier', 'patrolling');
                    }
                }
            }
        }

        // ====== STATE TRANSITIONS ======
        if ((!agent.path || agent.path.length === 0) && agent.state !== 'idle') {

            // --- PICKING ORDER (Picker) ---
            if (agent.state === 'picking_order') {
                const order = agent.currentOrder;
                if (order) {
                    if (!agent.pickingTimer) {
                        agent.pickingTimer = order.quantity * 0.05;
                        agent.pickingTotal = agent.pickingTimer;
                    }
                    agent.pickingTimer -= dt;
                    // Gradually increase carrying during picking
                    if (agent.pickingTotal > 0) {
                        const progress = 1 - Math.max(0, agent.pickingTimer / agent.pickingTotal);
                        agent.carrying = Math.floor(progress * order.quantity);
                    }
                    if (agent.pickingTimer <= 0) {
                        const zone = this.config.zones.find(z => z.id === order.zoneId);
                        if (zone) zone.stock = Math.max(0, (zone.stock || 0) - order.quantity);
                        agent.pickingTimer = null;
                        agent.pickingTotal = null;
                        agent.carrying = order.quantity;

                        // Go to conveyor to drop off the box
                        this.setAgentTarget(agent, 'conveyor', 'delivering_to_conveyor');
                    }
                } else {
                    agent.state = 'idle';
                }

                // --- DELIVERING TO CONVEYOR (Picker drops box) ---
            } else if (agent.state === 'delivering_to_conveyor') {
                const order = agent.currentOrder;
                if (order) {
                    this.conveyorQueue.push({
                        orderId: order.id,
                        progress: 0,
                        controlled: false,
                        startTime: this.simulationTime,
                        color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
                    });
                    order.status = 'on_conveyor';
                    // Track conveyor time
                    if (this.orderTimestamps[order.id]) {
                        this.orderTimestamps[order.id].onConveyor = this.simulationTime;
                        // Calculate prep time
                        const assignedAt = this.orderTimestamps[order.id].assigned || this.orderTimestamps[order.id].created;
                        this.completedPrepTimes.push(this.simulationTime - assignedAt);
                    }
                    agent.currentOrder = null;
                }
                agent.carrying = 0;
                agent.state = 'idle';

                // --- CONTROLLER: MOVING TO CONVEYOR ---
            } else if (agent.state === 'moving_to_conveyor') {
                if (agent.controlBox) {
                    agent.controlBox.controlled = true;
                    agent.state = 'controlling';
                    agent.controlTimer = controlTimerBase;
                    // Track control wait time
                    if (agent.controlBox.startTime) {
                        this.completedControlWaits.push(this.simulationTime - agent.controlBox.startTime);
                    }
                } else {
                    agent.state = 'idle';
                }

                // --- CONTROLLER: CONTROLLING ---
            } else if (agent.state === 'controlling') {
                if (!agent.controlTimer) agent.controlTimer = controlTimerBase;
                agent.controlTimer -= dt;
                if (agent.controlTimer <= 0) {
                    agent.controlTimer = null;
                    this.conveyorQueue = this.conveyorQueue.filter(b => b !== agent.controlBox);
                    const order = this.tasks.find(t => t.id === agent.controlBox?.orderId);
                    if (order) {
                        order.status = 'controlled';
                        agent.currentOrder = order;
                    }
                    agent.controlBox = null;
                    this.setAgentTarget(agent, 'shipping', 'delivering_to_expedition');
                }

                // --- CONTROLLER: DELIVERING TO EXPEDITION ---
            } else if (agent.state === 'delivering_to_expedition') {
                if (agent.currentOrder) {
                    agent.currentOrder.status = 'completed';
                    this.completedOrderIds.push(agent.currentOrder.id);
                    this.completedCount++;
                    // Track completion
                    if (this.orderTimestamps[agent.currentOrder.id]) {
                        this.orderTimestamps[agent.currentOrder.id].completed = this.simulationTime;
                    }
                    agent.currentOrder = null;
                }
                agent.state = 'idle';

                // --- STOREKEEPER: DEPOSITING IN RESERVE ---
            } else if (agent.state === 'depositing_reserve') {
                let zone = this.config.zones.find(z => z.id === agent.targetId);
                if (!zone) {
                    zone = this.config.zones.find(z =>
                        Math.abs((z.x + z.width / 2) - agent.x) < 100 &&
                        Math.abs((z.y + z.height / 2) - agent.y) < 100
                    );
                }
                if (zone && agent.carrying) {
                    zone.stock = (zone.stock || 0) + agent.carrying;
                    agent.carrying = 0;
                }
                agent.state = 'idle';

                // --- STOREKEEPER: MOVING TO INBOUND ---
            } else if (agent.state === 'moving_to_inbound') {
                agent.carrying = 1;
                if (agent.nextTask) {
                    this.setAgentTarget(agent, agent.nextTask.targetId, agent.nextTask.state);
                    agent.targetId = agent.nextTask.targetId;
                    if (agent.nextTask.amount) agent.carrying = agent.nextTask.amount;
                    agent.nextTask = null;
                } else {
                    agent.state = 'idle';
                }

                // --- STOREKEEPER: MOVING TO RESERVE (replenishment) ---
            } else if (agent.state === 'moving_to_reserve') {
                const reserveZone = this.config.zones.find(z => z.id === agent.targetId);
                const amount = agent.replenishAmount || 20;
                if (reserveZone && reserveZone.stock > 0) {
                    const taken = Math.min(reserveZone.stock, amount);
                    reserveZone.stock -= taken;
                    agent.carrying = taken;
                }
                if (agent.nextTask) {
                    this.setAgentTarget(agent, agent.nextTask.targetId, agent.nextTask.state);
                    agent.targetId = agent.nextTask.targetId;
                    agent.nextTask = null;
                } else {
                    agent.state = 'idle';
                }

                // --- STOREKEEPER: DELIVERING REPLENISHMENT ---
            } else if (agent.state === 'delivering_replenishment') {
                const pickZone = this.config.zones.find(z => z.id === agent.targetId || z.id === agent.replenishTarget);
                if (pickZone && agent.carrying) {
                    pickZone.stock = Math.min((pickZone.stock || 0) + agent.carrying, pickZone.capacity || 999);
                    agent.carrying = 0;
                    this.totalReplenishments = (this.totalReplenishments || 0) + 1;
                }
                agent.replenishTarget = null;
                agent.replenishAmount = null;
                agent.state = 'idle';

            } else if (agent.state === 'relocating') {
                agent.state = 'idle';
            } else {
                agent.state = 'idle';
            }
        }
    }

    completeOrder(agent) {
        if (agent.currentOrder) {
            agent.currentOrder.status = 'completed';
            this.completedOrderIds.push(agent.currentOrder.id);
            agent.currentOrder = null;
        }
        agent.state = 'idle';
    }

    setAgentTarget(agent, targetZoneId, newState) {
        if (!this.config.nodes) return;
        const zone = this.config.zones.find(z => z.id === targetZoneId);
        if (!zone) return;
        agent.targetId = targetZoneId;
        const startNode = this.findNearestNode(agent.x, agent.y);
        const endNode = this.findNearestNode(zone.x + zone.width / 2, zone.y + zone.height / 2);
        if (startNode && endNode) {
            const path = this.findPath(startNode, endNode);
            if (path) {
                agent.path = path;
                agent.pathIndex = 0;
                agent.state = newState;
                agent.targetNode = path[0];
            }
        }
    }

    findNearestNode(x, y) {
        let nearest = null;
        let minDist = Infinity;
        this.config.nodes.forEach(node => {
            const d = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
            if (d < minDist) { minDist = d; nearest = node; }
        });
        return nearest;
    }

    findPath(startNode, endNode) {
        const openSet = [startNode];
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        this.config.nodes.forEach(n => { gScore.set(n.id, Infinity); fScore.set(n.id, Infinity); });
        gScore.set(startNode.id, 0);
        fScore.set(startNode.id, this.heuristic(startNode, endNode));

        while (openSet.length > 0) {
            let current = openSet.reduce((a, b) => fScore.get(a.id) < fScore.get(b.id) ? a : b);
            if (current.id === endNode.id) return this.reconstructPath(cameFrom, current);
            openSet.splice(openSet.indexOf(current), 1);
            const neighbors = this.getNeighbors(current);
            neighbors.forEach(neighbor => {
                const dist = Math.sqrt((neighbor.x - current.x) ** 2 + (neighbor.y - current.y) ** 2);
                const tentativeG = gScore.get(current.id) + dist;
                if (tentativeG < gScore.get(neighbor.id)) {
                    cameFrom.set(neighbor.id, current);
                    gScore.set(neighbor.id, tentativeG);
                    fScore.set(neighbor.id, tentativeG + this.heuristic(neighbor, endNode));
                    if (!openSet.includes(neighbor)) openSet.push(neighbor);
                }
            });
        }
        return null;
    }

    getNeighbors(node) {
        if (!this.config.edges) return [];
        const neighbors = [];
        this.config.edges.forEach(edge => {
            if (edge[0] === node.id) neighbors.push(this.config.nodes.find(n => n.id === edge[1]));
            if (edge[1] === node.id) neighbors.push(this.config.nodes.find(n => n.id === edge[0]));
        });
        return neighbors.filter(n => n !== undefined);
    }

    heuristic(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

    reconstructPath(cameFrom, current) {
        const totalPath = [current];
        while (cameFrom.has(current.id)) { current = cameFrom.get(current.id); totalPath.unshift(current); }
        return totalPath;
    }

    followPath(agent, dt) {
        if (!agent.path || agent.path.length === 0) return 0;
        const targetNode = agent.path[0];
        const dx = targetNode.x - agent.x;
        const dy = targetNode.y - agent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = 150;
        let movedDist = 0;

        // --- Collision avoidance (skip when arriving at final destination) ---
        const COLLISION_DIST = 75;
        let dodgeX = 0, dodgeY = 0;
        let speedMultiplier = 1;
        const nearDestination = agent.path.length <= 1 && dist < 25;

        if (!nearDestination) {
            const headLen = dist > 0.01 ? dist : 1;
            const hdx = dx / headLen, hdy = dy / headLen;

            for (const other of this.agents) {
                if (other.id === agent.id) continue;
                const sepX = other.x - agent.x;
                const sepY = other.y - agent.y;
                const sepDist = Math.sqrt(sepX * sepX + sepY * sepY);
                if (sepDist > COLLISION_DIST || sepDist < 0.01) continue;

                // Skip collision with idle/stationary agents at destination
                const otherIdle = !other.path || other.path.length === 0;

                // Other agent's heading
                let ohdx = 0, ohdy = 0;
                if (!otherIdle) {
                    const otx = other.path[0].x - other.x;
                    const oty = other.path[0].y - other.y;
                    const ol = Math.sqrt(otx * otx + oty * oty);
                    if (ol > 0.01) { ohdx = otx / ol; ohdy = oty / ol; }
                }

                const dot = hdx * ohdx + hdy * ohdy;
                const pushStrength = (COLLISION_DIST - sepDist) / COLLISION_DIST;

                if (dot < -0.3) {
                    // Head-on: BOTH agents dodge to their own right
                    dodgeX += (-hdy) * speed * pushStrength * 0.6;
                    dodgeY += (hdx) * speed * pushStrength * 0.6;
                    speedMultiplier = Math.min(speedMultiplier, 0.5 + sepDist / COLLISION_DIST * 0.5);
                } else {
                    // Same direction or crossing: if other is ahead, slow down
                    const aheadDot = sepX * hdx + sepY * hdy;
                    if (aheadDot > 0) {
                        speedMultiplier = Math.min(speedMultiplier, 0.15 + (sepDist / COLLISION_DIST) * 0.85);
                    }
                    // General repulsion to avoid overlap
                    if (sepDist < 20) {
                        const repel = (20 - sepDist) / 20;
                        dodgeX -= (sepX / sepDist) * speed * repel * 0.3;
                        dodgeY -= (sepY / sepDist) * speed * repel * 0.3;
                    }
                }
            }
        }

        if (dist < 5) {
            movedDist = dist;
            agent.x = targetNode.x;
            agent.y = targetNode.y;
            agent.path.shift();
        } else {
            const moveDist = speed * dt * speedMultiplier;
            const activeDist = Math.min(moveDist, dist);
            const ratio = activeDist / dist;
            agent.x += dx * ratio + dodgeX * dt;
            agent.y += dy * ratio + dodgeY * dt;
            movedDist = activeDist;
        }
        return movedDist;
    }
}

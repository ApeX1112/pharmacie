

export class Engine {
    constructor(config) {
        this.config = config;
        this.agents = [];
        this.tasks = [];
        this.conveyorQueue = []; // Boxes on the conveyor belt
    }

    loadAgents(agents) {
        this.agents = agents.map(a => ({ ...a }));
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

        // --- INBOUND GENERATION ---
        if (!this.accumulators) this.accumulators = {};

        ['A', 'B', 'C', 'D'].forEach(zoneKey => {
            const params = this.config.parameters.arrivalParams?.[zoneKey];
            if (!params || !params.enabled) return;
            const { mean, stdDev, maxRate = 50 } = params;
            let intensity = 0;
            if (currentHour >= 8 && currentHour < 18) {
                const offset = currentHour - mean;
                intensity = Math.exp(-0.5 * Math.pow(offset / stdDev, 2));
            }
            const currentRate = intensity * maxRate;
            if (typeof this.accumulators[zoneKey] === 'undefined') this.accumulators[zoneKey] = 0;
            this.accumulators[zoneKey] += currentRate * dtHours;

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

        // --- OUTBOUND GENERATION ---
        const outboundParams = this.config.parameters.outboundParams;
        if (outboundParams && outboundParams.enabled) {
            const { mean, stdDev, maxRate } = outboundParams;
            const offset = currentHour - mean;
            const intensity = Math.exp(-0.5 * Math.pow(offset / stdDev, 2));
            const currentRate = intensity * maxRate;

            if (typeof this.outboundAccumulator === 'undefined') this.outboundAccumulator = 0;
            this.outboundAccumulator += currentRate * dtHours;

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
                    const newOrder = {
                        id: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                        zoneId: targetZone.id,
                        quantity: quantity,
                        status: 'pending',
                        creationDay: currentDay,
                        creationTime: `${Math.floor(currentHour)}:${Math.floor((currentHour % 1) * 60).toString().padStart(2, '0')}`,
                        assigned: false
                    };
                    this.tasks.push(newOrder);
                    this.newOrders.push(newOrder);
                }
            }
        }

        // --- CONVEYOR BELT ANIMATION ---
        // Move boxes along the conveyor toward the end
        const conveyor = this.config.zones.find(z => z.id === 'conveyor');
        if (conveyor) {
            const conveyorSpeed = 40; // pixels per time unit
            this.conveyorQueue.forEach(box => {
                box.progress += conveyorSpeed * dt;
                if (box.progress >= 1) box.progress = 1; // clamp at end
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

        return {
            agents: this.agents,
            distance: distanceTraveledThisTick,
            zones: this.config.zones,
            timeInfo: { day: currentDay, hour: currentHour, totalHours: this.simulationTime },
            totalArrivals: this.totalArrivals || 0,
            totalReplenishments: this.totalReplenishments || 0,
            conveyorQueue: this.conveyorQueue,
            newOrders: this.newOrders,
            completedOrderIds: this.completedOrderIds
        };
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

        if (agent.state === 'idle') {
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

                // Priority 2: Patrol (since replenishment moved to Picker)
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

                        // Fallback: If no paired reserve or empty, find any storage with stock
                        if (!reserveZone) {
                            const storageZones = this.config.zones.filter(z => z.type === 'storage' && (z.stock || 0) > 0);
                            if (storageZones.length > 0) {
                                reserveZone = storageZones[Math.floor(Math.random() * storageZones.length)];
                            }
                        }

                        if (!reserveZone) continue; // No stock available anywhere

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
                const rz = pickZones[Math.floor(Math.random() * pickZones.length)];
                if (rz && Math.random() < 0.01) {
                    this.setAgentTarget(agent, rz.id, 'patrolling');
                }

                // ========== CONTROLLER ==========
            } else if (agent.type === 'Controller') {
                // Check if there are boxes on conveyor ready for control (progress >= 1)
                const readyBox = this.conveyorQueue.find(b => b.progress >= 1 && !b.controlled);
                if (readyBox) {
                    // Go to conveyor to pick up
                    agent.controlBox = readyBox;
                    this.setAgentTarget(agent, 'conveyor', 'moving_to_conveyor');
                } else {
                    // Stay near pilulier area
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
                    }
                    agent.pickingTimer -= dt;
                    if (agent.pickingTimer <= 0) {
                        const zone = this.config.zones.find(z => z.id === order.zoneId);
                        if (zone) zone.stock = Math.max(0, (zone.stock || 0) - order.quantity);
                        agent.pickingTimer = null;

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
                    // Drop box on conveyor belt
                    this.conveyorQueue.push({
                        orderId: order.id,
                        progress: 0, // 0 = start of belt, 1 = end
                        controlled: false,
                        color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
                    });
                    order.status = 'on_conveyor';
                    agent.currentOrder = null;
                }
                agent.state = 'idle'; // Picker is free to take next order

                // --- CONTROLLER: MOVING TO CONVEYOR ---
            } else if (agent.state === 'moving_to_conveyor') {
                if (agent.controlBox) {
                    // Start control timer
                    agent.controlBox.controlled = true;
                    agent.state = 'controlling';
                    agent.controlTimer = 3; // 3 time units for control
                } else {
                    agent.state = 'idle';
                }

                // --- CONTROLLER: CONTROLLING ---
            } else if (agent.state === 'controlling') {
                if (!agent.controlTimer) agent.controlTimer = 3;
                agent.controlTimer -= dt;
                if (agent.controlTimer <= 0) {
                    agent.controlTimer = null;
                    // Remove box from conveyor
                    this.conveyorQueue = this.conveyorQueue.filter(b => b !== agent.controlBox);
                    // Now carry to expedition
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
        if (dist < 5) {
            movedDist = dist;
            agent.x = targetNode.x;
            agent.y = targetNode.y;
            agent.path.shift();
        } else {
            const moveDist = speed * dt;
            const activeDist = Math.min(moveDist, dist);
            const ratio = activeDist / dist;
            agent.x += dx * ratio;
            agent.y += dy * ratio;
            movedDist = activeDist;
        }
        return movedDist;
    }
}

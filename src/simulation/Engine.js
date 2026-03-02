

export class Engine {
    constructor(config) {
        this.config = config;
        this.agents = [];
        this.tasks = [];
    }

    loadAgents(agents) {
        // Preserve current state if IDs match, otherwise replace
        // This allows state to persist across React re-renders if we are careful
        // But for simplicity, we'll just update targets if they exist?
        // Actually simpler to just deep copy for now
        this.agents = agents.map(a => ({ ...a }));
    }

    update(deltaTime, speed) {
        // 0. Global Logic (Inbound Generation) - Monthly Distribution
        // Time Scale: 1 real second = 1 simulation HOUR (at speed 1)
        const dt = deltaTime * speed;
        const dtHours = dt;

        let distanceTraveledThisTick = 0;

        this.simulationTime = (this.simulationTime || 6) + dtHours;

        const currentHour = this.simulationTime % 24;
        const currentDay = Math.floor(this.simulationTime / 24) + 1;

        this.newOrders = [];
        this.completedOrderIds = [];

        // --- INBOUND GENERATION (Arrivals) ---
        // Initialize accumulators if needed
        if (!this.accumulators) this.accumulators = {};

        ['A', 'B', 'C', 'D'].forEach(zoneKey => {
            const params = this.config.parameters.arrivalParams?.[zoneKey];
            if (!params || !params.enabled) return;

            const { mean, stdDev, maxRate = 50 } = params;

            // Hourly Distribution: Peak at specified hour (e.g., 12:00 noon)
            // Work Hours: 8am - 6pm (intensity curve within those hours)
            let intensity = 0;
            if (currentHour >= 8 && currentHour < 18) {
                const offset = currentHour - mean;
                intensity = Math.exp(-0.5 * Math.pow(offset / stdDev, 2));
            }

            // Total Rate (Items per Hour)
            const currentRate = intensity * maxRate;

            // Add to accumulator
            if (typeof this.accumulators[zoneKey] === 'undefined') this.accumulators[zoneKey] = 0;
            this.accumulators[zoneKey] += currentRate * dtHours;

            // Spawn integer amount
            while (this.accumulators[zoneKey] >= 1) {
                this.accumulators[zoneKey] -= 1;

                const reception = this.config.zones.find(z => z.id === 'reception');
                if (reception) {
                    if (!reception.arrivalQueue) reception.arrivalQueue = [];
                    // Queue the item
                    reception.arrivalQueue.push({ destination: `zone_${zoneKey}_res`, type: zoneKey });
                    reception.stock = (reception.stock || 0) + 1;
                    this.totalArrivals = (this.totalArrivals || 0) + 1;
                }
            }
        });

        // --- OUTBOUND GENERATION (Orders) ---
        // Generate orders for Picking Zones
        const outboundParams = this.config.parameters.outboundParams;
        if (outboundParams && outboundParams.enabled) {
            const { mean, stdDev, maxRate } = outboundParams;

            // Peak at 14:00 (Daily Cycle for orders to vary from arrivals?)
            // Let's use Daily cycle for Orders to make them visible every day
            const offset = currentHour - mean;
            const intensity = Math.exp(-0.5 * Math.pow(offset / stdDev, 2));
            const currentRate = intensity * maxRate;

            if (typeof this.outboundAccumulator === 'undefined') this.outboundAccumulator = 0;
            this.outboundAccumulator += currentRate * dtHours;

            while (this.outboundAccumulator >= 1) {
                this.outboundAccumulator -= 1;

                // Limit pending orders to 5 (realistic queue)
                const pendingCount = this.tasks.filter(t => t.status === 'pending').length;
                if (pendingCount >= 5) {
                    break; // Don't generate more orders if queue is full
                }

                // Select ANY Picking Zone (not just A_pick, B_pick, C_pick, D_pick)
                // This includes: Q, P, N, M, L, F1-F4, R1-R2, A_pick, B_pick, C_pick, D_pick
                const pickZones = this.config.zones.filter(z =>
                    z.type === 'picking' || z.id.endsWith('_pick') ||
                    ['Q', 'P', 'N', 'M', 'L', 'F1', 'F2', 'F3', 'F4', 'R1', 'R2'].includes(z.id)
                );

                if (pickZones.length > 0) {
                    const targetZone = pickZones[Math.floor(Math.random() * pickZones.length)];
                    const quantity = Math.floor(Math.random() * 71) + 30; // 30-100 items (realistic pharmacy quantities)

                    const newOrder = {
                        id: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                        zoneId: targetZone.id,
                        quantity: quantity,
                        status: 'pending',
                        creationDay: currentDay,
                        creationTime: `${Math.floor(currentHour)}:${Math.floor((currentHour % 1) * 60).toString().padStart(2, '0')}`,
                        assigned: false
                    };
                    this.tasks.push(newOrder); // Add to Engine's internal task list
                    this.newOrders.push(newOrder); // Queue for Store Sync
                }
            }
        }


        this.agents.forEach(agent => {
            // 1. Logic / FSM (High Level)
            this.updateAgentBehavior(agent, dt);

            // 2. Movement (Low Level)
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
            newOrders: this.newOrders,
            completedOrderIds: this.completedOrderIds
        };
    }

    updateAgentBehavior(agent, dt) {
        if (!this.config || !this.config.zones) return;

        if (agent.state === 'idle') {
            if (agent.type === 'Storekeeper') {
                const reception = this.config.zones.find(z => z.id === 'reception');

                // Priority 1: Inbound (Process Queue)
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

                // Priority 2: Replenishment (Random Patrol if no inbound)
                // ... (Keep existing simple logic or improve later)
                const reserves = this.config.zones.filter(z => z.id.endsWith('_res'));
                const randomZone = reserves[Math.floor(Math.random() * reserves.length)];
                if (randomZone && Math.random() < 0.01) { // Low chance to move if idle
                    this.setAgentTarget(agent, randomZone.id, 'moving_to_zone');
                    agent.nextTask = { targetId: reception.id, state: 'returning' };
                }

            } else if (agent.type === 'Picker') {
                // Picker Logic - Find Pending Order
                const pendingOrder = this.tasks.find(t => !t.assigned && t.status === 'pending');

                if (pendingOrder) {
                    pendingOrder.assigned = true;
                    pendingOrder.status = 'assigned';

                    // Trigger Update in Store (Optimistic or Event based)
                    // We can't easily update store from here for status change without return, 
                    // but we will sync completed orders. 
                    // For visualization, relying on "Completed" status is easiest, 
                    // or we could add 'assignedOrderIds' to return.

                    this.setAgentTarget(agent, pendingOrder.zoneId, 'picking_order');
                    agent.currentOrder = pendingOrder;

                    // Define next steps
                    // 1. Go to Zone (Handled by setAgentTarget)
                    // 2. Pick (Wait)
                    // 3. Go to Dispatch
                } else {
                    // Patrol / Idle
                    const pickZones = this.config.zones.filter(z => z.id.endsWith('_pick'));
                    const randomZone = pickZones[Math.floor(Math.random() * pickZones.length)];
                    if (randomZone && Math.random() < 0.01) {
                        this.setAgentTarget(agent, randomZone.id, 'patrolling');
                    }
                }
            }
        }

        // State Transitions & Completion
        if ((!agent.path || agent.path.length === 0) && agent.state !== 'idle') {

            // reached destination
            if (agent.state === 'picking_order') {
                // Arrived at Pick Zone - Start Picking
                const order = agent.currentOrder;
                if (order) {
                    // Add picking duration (simulate time to pick 30-100 items)
                    if (!agent.pickingTimer) {
                        agent.pickingTimer = order.quantity * 0.05; // 0.05 sec per item (1.5-5 seconds total)
                    }

                    agent.pickingTimer -= dt;

                    if (agent.pickingTimer <= 0) {
                        // Picking complete - Reduce Stock
                        const zone = this.config.zones.find(z => z.id === order.zoneId);
                        if (zone) {
                            zone.stock = Math.max(0, (zone.stock || 0) - order.quantity);
                        }

                        agent.pickingTimer = null;
                        agent.state = 'delivering_order';

                        // Go to Shipping (or Reception if Shipping not defined)
                        let shipping = this.config.zones.find(z => z.id === 'shipping');
                        if (!shipping) shipping = this.config.zones.find(z => z.id === 'reception');

                        if (shipping) {
                            this.setAgentTarget(agent, shipping.id, 'delivering_order');
                        } else {
                            // Immediate completion if no shipping zone
                            this.completeOrder(agent);
                        }
                    }
                } else {
                    agent.state = 'idle';
                }

            } else if (agent.state === 'delivering_order') {
                // Arrived at Dispatch
                this.completeOrder(agent);

            } else if (agent.state === 'depositing_reserve') {
                // ... (Existing Inbound Logic)
                let zone = this.config.zones.find(z => z.id === agent.targetId);
                if (!zone) {
                    zone = this.config.zones.find(z =>
                        Math.abs((z.x + z.width / 2) - agent.x) < 100 && Math.abs((z.y + z.height / 2) - agent.y) < 100
                    );
                }

                if (zone && agent.carrying) {
                    zone.stock = (zone.stock || 0) + agent.carrying;
                    agent.carrying = 0;
                }
                agent.state = 'idle';

            } else if (agent.state === 'moving_to_inbound') {
                const reception = this.config.zones.find(z => z.id === 'reception');
                if (reception) {
                    agent.carrying = 1;
                }
                // Continue to next task (set in idle logic)
                if (agent.nextTask) {
                    this.setAgentTarget(agent, agent.nextTask.targetId, agent.nextTask.state);
                    agent.targetId = agent.nextTask.targetId;
                    if (agent.nextTask.amount) agent.carrying = agent.nextTask.amount;
                    agent.nextTask = null;
                } else {
                    agent.state = 'idle';
                }
            } else {
                // General move completion
                agent.state = 'idle';
            }
        }
    }

    completeOrder(agent) {
        if (agent.currentOrder) {
            agent.currentOrder.status = 'completed';
            this.completedOrderIds.push(agent.currentOrder.id); // Sync to store
            agent.currentOrder = null;
        }
        agent.state = 'idle';
    }

    setAgentTarget(agent, targetZoneId, newState) {
        if (!this.config.nodes) return;

        const zone = this.config.zones.find(z => z.id === targetZoneId);
        if (!zone) return;

        // Find nearest node to agent (start) and zone (end)
        const startNode = this.findNearestNode(agent.x, agent.y);
        const endNode = this.findNearestNode(zone.x + zone.width / 2, zone.y + zone.height / 2);

        if (startNode && endNode) {
            const path = this.findPath(startNode, endNode);
            if (path) {
                agent.path = path; // Array of nodes to visit
                agent.pathIndex = 0;
                agent.state = newState;

                // Smooth start: if agent is far from startNode, move to it first? 
                // For now, assume agent snaps to nearest node or walks linearly to it
                agent.targetNode = path[0];
            }
        }
    }

    findNearestNode(x, y) {
        let nearest = null;
        let minDist = Infinity;
        this.config.nodes.forEach(node => {
            const d = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
            if (d < minDist) {
                minDist = d;
                nearest = node;
            }
        });
        return nearest;
    }

    findPath(startNode, endNode) {
        // A* Algorithm
        const openSet = [startNode];
        const cameFrom = new Map();
        const gScore = new Map(); // Cost from start
        const fScore = new Map(); // Est. total cost

        this.config.nodes.forEach(n => {
            gScore.set(n.id, Infinity);
            fScore.set(n.id, Infinity);
        });

        gScore.set(startNode.id, 0);
        fScore.set(startNode.id, this.heuristic(startNode, endNode));

        while (openSet.length > 0) {
            // Get node with lowest fScore
            let current = openSet.reduce((a, b) => fScore.get(a.id) < fScore.get(b.id) ? a : b);

            if (current.id === endNode.id) {
                return this.reconstructPath(cameFrom, current);
            }

            openSet.splice(openSet.indexOf(current), 1);

            const neighbors = this.getNeighbors(current);
            neighbors.forEach(neighbor => {
                const dist = Math.sqrt((neighbor.x - current.x) ** 2 + (neighbor.y - current.y) ** 2);
                const tentativeG = gScore.get(current.id) + dist;

                if (tentativeG < gScore.get(neighbor.id)) {
                    cameFrom.set(neighbor.id, current);
                    gScore.set(neighbor.id, tentativeG);
                    fScore.set(neighbor.id, tentativeG + this.heuristic(neighbor, endNode));

                    if (!openSet.includes(neighbor)) {
                        openSet.push(neighbor);
                    }
                }
            });
        }
        return null; // No path
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

    heuristic(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    reconstructPath(cameFrom, current) {
        const totalPath = [current];
        while (cameFrom.has(current.id)) {
            current = cameFrom.get(current.id);
            totalPath.unshift(current);
        }
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
            // Reached node
            movedDist = dist;
            agent.x = targetNode.x;
            agent.y = targetNode.y;
            agent.path.shift(); // Remove visited node
        } else {
            // Move towards node
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


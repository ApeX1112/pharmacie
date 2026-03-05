import fs from 'fs';

const configStr = fs.readFileSync('public/config.json', 'utf8');
const config = JSON.parse(configStr);

// 1. Remove the bad edges that cross through the G-Q racks directly
config.edges = config.edges.filter(edge => {
    const isBadHorizontal = ['G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'].some(
        row => (edge[0] === `n_${row}_row` && edge[1] === `n_${row}_row_end`) ||
            (edge[1] === `n_${row}_row` && edge[0] === `n_${row}_row_end`)
    );
    return !isBadHorizontal;
});

// 2. Remove old A-E nodes
const oldNodesToRemove = [
    'n_aisle_A_top', 'n_aisle_A_bot',
    'n_aisle_B_top', 'n_aisle_B_bot',
    'n_aisle_C_top', 'n_aisle_C_bot',
    'n_aisle_D_top', 'n_aisle_D_bot',
    'n_aisle_E_top', 'n_aisle_E_bot'
];

config.nodes = config.nodes.filter(n => !oldNodesToRemove.includes(n.id));
config.edges = config.edges.filter(e => !oldNodesToRemove.includes(e[0]) && !oldNodesToRemove.includes(e[1]));

// 3. Add new grid nodes
const newNodes = [
    { id: 'n_A_top', x: 80, y: 260 },
    { id: 'n_C_top', x: 170, y: 260 },
    { id: 'n_D_top', x: 270, y: 260 },
    { id: 'n_E_top', x: 465, y: 260 },

    { id: 'n_A_mid', x: 80, y: 520 },
    { id: 'n_C_mid', x: 170, y: 520 },
    { id: 'n_D_mid', x: 270, y: 520 },
    { id: 'n_E_mid', x: 465, y: 520 },

    { id: 'n_A_bot', x: 80, y: 620 },
    // No C_bot because of Rack B
    { id: 'n_D_bot', x: 270, y: 620 },
    { id: 'n_E_bot', x: 465, y: 620 },
];
config.nodes.push(...newNodes);

// 4. Add new grid edges
const newEdges = [
    // Verticals
    ['n_A_top', 'n_A_mid'], ['n_A_mid', 'n_A_bot'],
    ['n_C_top', 'n_C_mid'], // Dead ends at the cross path above Rack B
    ['n_D_top', 'n_D_mid'], ['n_D_mid', 'n_D_bot'],
    ['n_E_top', 'n_E_mid'], ['n_E_mid', 'n_E_bot'],

    // Horizontals Top (y=260)
    ['n_A_top', 'n_C_top'], ['n_C_top', 'n_D_top'], ['n_D_top', 'n_E_top'],

    // Horizontals Mid (y=520, between A/C/D and B/E)
    ['n_A_mid', 'n_C_mid'], ['n_C_mid', 'n_D_mid'], ['n_D_mid', 'n_E_mid'],

    // Horizontals Bot (y=620, below B/E)
    ['n_A_bot', 'n_D_bot'], ['n_D_bot', 'n_E_bot'],

    // Connect grid back to warehouse
    ['n_pilulier_left', 'n_A_top'],
    ['n_shipping', 'n_A_top'], // Shipping used to connect to B_top, connecting it to A_top
    ['n_pilulier_right', 'n_E_top'], // used to connect to E_top (380), now E_top (465)
    ['n_E_bot', 'n_F_aisle_bot'] // Exit path
];
config.edges.push(...newEdges);

fs.writeFileSync('public/config.json', JSON.stringify(config, null, 4));
console.log('Pathfinding network patched successfully!');

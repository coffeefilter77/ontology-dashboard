console.log('entity-relationship.js loaded');

let entityGraph;
const defaultLayout = 'force';
const defaultLinkDistance = 100;

async function initEntityRelationshipGraph(relationshipType = 'cto_uses_network') {
    console.log('initEntityRelationshipGraph called with relationshipType:', relationshipType);

    if (entityGraph) {
        console.log('Destroying existing graph');
        entityGraph.destroy();
    }

    const container = document.getElementById('entity-graph-container');
    if (!container) {
        console.error('entity-graph-container not found');
        return;
    }

    console.log('Container dimensions:', container.offsetWidth, container.offsetHeight);

    const width = container.offsetWidth;
    const height = container.offsetHeight;

    console.log('Creating new G6.Graph');
    entityGraph = new G6.Graph({
        container: 'entity-graph-container',
        width,
        height,
        modes: {
            default: ['drag-canvas', 'zoom-canvas', 'drag-node', 'click-select']
        },
        layout: getLayoutConfig(defaultLayout, defaultLinkDistance),
        defaultNode: {
            size: 30,
            style: {
                fill: '#C6E5FF',
                stroke: '#5B8FF9',
                lineWidth: 2
            },
            labelCfg: {
                style: {
                    fill: '#000',
                    fontSize: 12
                }
            }
        },
        defaultEdge: {
            style: {
                stroke: '#A3B1BF',
                lineWidth: 1,
                endArrow: true
            },
            labelCfg: {
                autoRotate: true,
                style: {
                    fill: '#666',
                    fontSize: 10
                }
            }
        }
    });

    try {
        console.log(`Fetching data from /table/${relationshipType}`);
        const response = await fetch(`/table/${relationshipType}`);
        const data = await response.json();
        console.log('Data received:', data);
        const graphData = convertToGraphData(data, relationshipType);
        console.log('Graph data:', graphData);
        entityGraph.data(graphData);
        entityGraph.render();
        console.log('Graph rendered');
        entityGraph.fitView();
        console.log('Graph fitted to view');

        addEventListeners();
        console.log('Event listeners added');
    } catch (error) {
        console.error('Error fetching or processing data:', error);
    }
}

function getLayoutConfig(layoutType, linkDistance) {
    switch(layoutType) {
        case 'circular':
            return { 
                type: 'circular', 
                radius: linkDistance * 2
            };
        case 'grid':
            return { 
                type: 'grid', 
                nodeSize: linkDistance,
                preventOverlap: true
            };
        case 'concentric':
            return { 
                type: 'concentric', 
                minNodeSpacing: linkDistance
            };
        case 'radial':
            return { 
                type: 'radial', 
                unitRadius: linkDistance
            };
        case 'dagre':
            return { 
                type: 'dagre', 
                rankdir: 'TB', 
                nodesep: linkDistance / 2,
                ranksep: linkDistance
            };
        default:
            return {
                type: 'force',
                preventOverlap: true,
                nodeStrength: -30,
                edgeStrength: 0.1,
                linkDistance: linkDistance
            };
    }
}

function convertToGraphData(data, relationshipType) {
    const nodes = new Set();
    const edges = [];

    data.rows.forEach(row => {
        let source, target, label;
        if (relationshipType === 'cto_uses_network') {
            source = row[1]; // 
            target = row[2]; // 
            label = 'uses';
        } else if (relationshipType === 'cto_owns_network') {
            source = row[1]; // 
            target = row[2]; // 
            label = 'owns';
        }

        nodes.add(source);
        nodes.add(target);

        edges.push({
            source,
            target,
            label
        });
    });

    return {
        nodes: Array.from(nodes).map(id => ({ id, label: id })),
        edges
    };
}

function addEventListeners() {
    if (!entityGraph) {
        console.error('entityGraph is not initialized');
        return;
    }

    entityGraph.on('node:click', (evt) => {
        const { item } = evt;
        const model = item.getModel();
        showNodeInfo(model);
    });

    entityGraph.on('node:mouseenter', (evt) => {
        const { item } = evt;
        entityGraph.setItemState(item, 'hover', true);
        highlightConnectedEdges(item);
    });

    entityGraph.on('node:mouseleave', (evt) => {
        const { item } = evt;
        entityGraph.setItemState(item, 'hover', false);
        resetEdgeStyles();
    });

    entityGraph.on('canvas:click', () => {
        hideNodeInfo();
    });

    document.getElementById('entity-zoom-in').addEventListener('click', () => {
        const zoom = entityGraph.getZoom();
        entityGraph.zoomTo(zoom * 1.1);
    });

    document.getElementById('entity-zoom-out').addEventListener('click', () => {
        const zoom = entityGraph.getZoom();
        entityGraph.zoomTo(zoom * 0.9);
    });

    document.getElementById('entity-fit-view').addEventListener('click', () => {
        entityGraph.fitView(20);
    });

    document.getElementById('entity-export').addEventListener('click', exportImage);

    document.getElementById('entity-layout-select').addEventListener('change', (event) => {
        changeLayout(event.target.value);
    });

    document.getElementById('entity-spacing').addEventListener('input', (event) => {
        const linkDistance = parseInt(event.target.value);
        entityGraph.updateLayout(getLayoutConfig(entityGraph.get('layout').type, linkDistance));
    });

    const searchInput = document.getElementById('entity-search-input');
    const searchButton = document.getElementById('entity-search-button');

    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            searchNodes();
        }
    });

    searchButton.addEventListener('click', searchNodes);

    document.getElementById('entity-fullscreen').addEventListener('click', toggleEntityFullscreen);
}

function highlightConnectedEdges(node) {
    const edges = node.getEdges();
    edges.forEach(edge => {
        entityGraph.updateItem(edge, {
            style: {
                stroke: '#ff0000',
                lineWidth: 2
            }
        });
    });
}

function resetEdgeStyles() {
    entityGraph.getEdges().forEach(edge => {
        entityGraph.updateItem(edge, {
            style: {
                stroke: '#A3B1BF',
                lineWidth: 1
            }
        });
    });
}

function showNodeInfo(node) {
    const nodeInfo = document.getElementById('entity-node-info');
    nodeInfo.innerHTML = `
        <h3>${node.label}</h3>
        <p>ID: ${node.id}</p>
    `;
    nodeInfo.style.display = 'block';
}

function hideNodeInfo() {
    const nodeInfo = document.getElementById('entity-node-info');
    nodeInfo.style.display = 'none';
}

function searchNodes() {
    const searchTerm = document.getElementById('entity-search-input').value.toLowerCase();
    entityGraph.getNodes().forEach(node => {
        const model = node.getModel();
        const matches = model.id.toLowerCase().includes(searchTerm) || model.label.toLowerCase().includes(searchTerm);
        entityGraph.updateItem(node, {
            style: {
                opacity: matches ? 1 : 0.2
            }
        });
    });
}

function exportImage() {
    html2canvas(document.getElementById('entity-graph-container')).then(canvas => {
        const link = document.createElement('a');
        link.download = 'entity-relationship.png';
        link.href = canvas.toDataURL();
        link.click();
    });
}

function changeLayout(layoutType) {
    entityGraph.updateLayout(getLayoutConfig(layoutType, defaultLinkDistance));
}

function toggleEntityFullscreen() {
    const container = document.getElementById('entity-relationship-container');
    container.classList.toggle('fullscreen');
    
    if (container.classList.contains('fullscreen')) {
        entityGraph.changeSize(window.innerWidth, window.innerHeight);
    } else {
        entityGraph.changeSize(container.offsetWidth, container.offsetHeight);
    }
    
    entityGraph.fitView(20);
}

// Add event listener for window resize
window.addEventListener('resize', () => {
    if (entityGraph) {
        const container = document.getElementById('entity-relationship-container');
        const width = container.classList.contains('fullscreen') ? window.innerWidth : container.offsetWidth;
        const height = container.classList.contains('fullscreen') ? window.innerHeight : container.offsetHeight;
        entityGraph.changeSize(width, height);
    }
});

console.log('entity-relationship.js finished loading');

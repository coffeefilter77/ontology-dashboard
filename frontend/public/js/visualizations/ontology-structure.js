/*
This is a sample visualization structure demonstrating organizational relationships.
All data is fictional and for demonstration purposes only.
*/

let ontologyGraph;
let ontologyCurrentLayout = 'force';
let ontologyCurrentLinkDistance = 100;

const data = {
    nodes: [
        { id: 'Entity', label: 'Entity', type: 'class', description: 'description' },
        { id: 'Entity2', label: 'Entity', type: 'class', description: 'description' },
        { id: 'Entity3', label: 'Entity', type: 'class', description: 'description' }
    ],
    edges: [
        { source: 'Entity', target: 'Entity2', label: 'type_of' },
        { source: 'Entity2', target: 'Entity3', label: 'type_of' },
        { source: 'Entity3', target: 'Entity', label: 'type_of' }
    ]
};

function initOntologyGraph() {
    if (ontologyGraph) {
        ontologyGraph.destroy();
    }

    const container = document.getElementById('graph-container');
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    ontologyGraph = new G6.Graph({
        container: 'graph-container',
        width,
        height,
        layout: getOntologyLayoutConfig(ontologyCurrentLayout, ontologyCurrentLinkDistance),
        modes: {
            default: ['drag-canvas', 'zoom-canvas', 'drag-node', 'click-select']
        },
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
        nodeStateStyles: {
            hover: {
                lineWidth: 3
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
                    fontSize: 8
                }
            }
        }
    });

    ontologyGraph.node(node => {
        if (node.type === 'data_property') {
            return {
                type: 'rect',
                size: [40, 20],
                style: {
                    fill: '#FFD6D6',
                    stroke: '#FF6B6B',
                    lineWidth: 2,
                    radius: 5
                },
                labelCfg: {
                    style: {
                        fill: '#333',
                        fontSize: 8
                    }
                }
            };
        }
        return {};
    });

    ontologyGraph.data(data);
    ontologyGraph.render();
    
    setTimeout(() => {
        ontologyGraph.fitView(20);
    }, 100);

    addOntologyEventListeners();
}

function getOntologyLayoutConfig(layoutType, linkDistance) {
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

function addOntologyEventListeners() {
    ontologyGraph.on('node:click', (evt) => {
        const { item } = evt;
        const model = item.getModel();
        showOntologyNodeInfo(model);
    });

    ontologyGraph.on('node:mouseenter', (evt) => {
        const { item } = evt;
        ontologyGraph.setItemState(item, 'hover', true);
        highlightOntologyConnectedEdges(item);
    });

    ontologyGraph.on('node:mouseleave', (evt) => {
        const { item } = evt;
        ontologyGraph.setItemState(item, 'hover', false);
        resetOntologyEdgeStyles();
    });

    ontologyGraph.on('canvas:click', () => {
        hideOntologyNodeInfo();
    });
}

function highlightOntologyConnectedEdges(node) {
    const edges = node.getEdges();
    edges.forEach(edge => {
        ontologyGraph.updateItem(edge, {
            style: {
                stroke: '#ff0000',
                lineWidth: 2
            }
        });
    });
}

function resetOntologyEdgeStyles() {
    ontologyGraph.getEdges().forEach(edge => {
        ontologyGraph.updateItem(edge, {
            style: {
                stroke: '#A3B1BF',
                lineWidth: 1
            }
        });
    });
}

function showOntologyNodeInfo(node) {
    const nodeInfo = document.getElementById('node-info');
    nodeInfo.innerHTML = `
        <h3>${node.label}</h3>
        <p>ID: ${node.id}</p>
        <p>Description: ${node.description}</p>
    `;
    nodeInfo.style.display = 'block';
}

function hideOntologyNodeInfo() {
    const nodeInfo = document.getElementById('node-info');
    nodeInfo.style.display = 'none';
}

function searchOntologyNodes() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    ontologyGraph.getNodes().forEach(node => {
        const model = node.getModel();
        const matches = model.id.toLowerCase().includes(searchTerm) || model.label.toLowerCase().includes(searchTerm);
        ontologyGraph.updateItem(node, {
            style: {
                opacity: matches ? 1 : 0.2
            }
        });
    });
}

function exportOntologyImage() {
    html2canvas(document.getElementById('graph-container')).then(canvas => {
        const link = document.createElement('a');
        link.download = 'ontology-structure.png';
        link.href = canvas.toDataURL();
        link.click();
    });
}

function changeOntologyLayout(layoutType) {
    ontologyCurrentLayout = layoutType;
    ontologyGraph.updateLayout(getOntologyLayoutConfig(layoutType, ontologyCurrentLinkDistance));
    ontologyGraph.fitView();
}

function toggleFullscreen() {
    const container = document.getElementById('graph-container');
    container.classList.toggle('fullscreen');
    
    if (container.classList.contains('fullscreen')) {
        ontologyGraph.changeSize(window.innerWidth, window.innerHeight);
    } else {
        ontologyGraph.changeSize(container.offsetWidth, container.offsetHeight);
    }
    
    ontologyGraph.fitView(20);
}

document.addEventListener('DOMContentLoaded', () => {
    const visualiseOntologyBtn = document.getElementById('visualise-ontology');
    const visualiseEntityBtn = document.getElementById('visualise-entity');
    const graphContainer = document.getElementById('graph-container');
    const entityRelationshipContainer = document.getElementById('entity-relationship-container');

    visualiseOntologyBtn.addEventListener('click', () => {
        graphContainer.style.display = 'block';
        entityRelationshipContainer.style.display = 'none';
        initOntologyGraph();
    });

    visualiseEntityBtn.addEventListener('click', () => {
        graphContainer.style.display = 'none';
        entityRelationshipContainer.style.display = 'block';
        if (ontologyGraph) {
            ontologyGraph.destroy();
        }
    });

    document.getElementById('zoom-in').addEventListener('click', () => {
        const zoom = ontologyGraph.getZoom();
        ontologyGraph.zoomTo(zoom * 1.1);
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
        const zoom = ontologyGraph.getZoom();
        ontologyGraph.zoomTo(zoom * 0.9);
    });

    document.getElementById('fit-view').addEventListener('click', () => {
        ontologyGraph.fitView(20);
    });

    document.getElementById('spacing').addEventListener('input', (event) => {
        ontologyCurrentLinkDistance = parseInt(event.target.value);
        ontologyGraph.updateLayout(getOntologyLayoutConfig(ontologyCurrentLayout, ontologyCurrentLinkDistance));
    });

    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');

    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            searchOntologyNodes();
        }
    });

    searchButton.addEventListener('click', searchOntologyNodes);

    document.getElementById('export').addEventListener('click', exportOntologyImage);

    document.getElementById('layout-select').addEventListener('change', (event) => {
        changeOntologyLayout(event.target.value);
    });

    document.getElementById('fullscreen').addEventListener('click', toggleFullscreen);

    // Initialize the ontology graph when the script loads
    initOntologyGraph();

    window.addEventListener('resize', () => {
        if (ontologyGraph) {
            const container = document.getElementById('graph-container');
            const width = container.classList.contains('fullscreen') ? window.innerWidth : container.offsetWidth;
            const height = container.classList.contains('fullscreen') ? window.innerHeight : container.offsetHeight;
            ontologyGraph.changeSize(width, height);
        }
    });
});

// DFT logic.

// Available types of DFT gates.
var DftTypes = Object.freeze({
    BE:     'be',
    AND:    'and',
    OR:     'or',
    PAND:   'pand',
    POR:    'por',
    PDEP:   'pdep',
    FDEP:   'fdep',
    SPARE:  'spare',
    SEQ:    'seq',
    COMPOUND: 'compound',
});

// Currently highest used id.
var currentId = -1;
// Id of toplevel element.
var topLevelId = -1;

// Import DFT from JSON.
function importDftFromJson(json) {
    cy.load(json.nodes);

    // Set currentId as maximal id of all loaded nodes
    currentId = -1;

    cy.nodes().forEach(function( node ) {
        currentId = Math.max(currentId, node.id());
        setLabel(node);
        node.addClass(node.data('type'));

        if (node.data('type') != DftTypes.BE) {
            // Add edges for gates
            var sourceId = node.data('id');
            var children = node.data('children');
            for (var i = 0; i < children.length; ++i) {
                var targetId = children[i];
                var target = cy.getElementById(targetId);
                var edgeId = sourceId + 'e' + targetId;
                if (cy.edges("[id='" + edgeId + "']").length > 0) {
                    alert("Edge '" + edgeId + "' already exists");
                }

                cy.add({
                    group: 'edges',
                    data: {
                        id: edgeId,
                        source: sourceId,
                        target: targetId,
                    },
                });
            }
        }
    });

    // Set toplevel
    setToplevel(cy.getElementById(json.toplevel));
}

// Export DFT to JSON.
function exportDftToJSON() {
    // Construct JSON
    var json = {};
    json.toplevel = topLevelId;
    json.nodes = cy.nodes().jsons();
    var jsonString = JSON.stringify(json, null, 4);
    return jsonString;
}

// Create the general information of a new element.
function createGeneralElement(dftType, name, posX, posY) {
    currentId += 1;
    var newElement = {
        group: 'nodes',
        data: {
            id: currentId,
            name: name,
            type: dftType
        },
        classes: dftType,
        position: {
            x: posX,
            y: posY
        }
    };
    return newElement;
}

// Create a new gate.
function createGate(dftType, name, posX, posY) {
    var newElement = createGeneralElement(dftType, name, posX, posY);
    newElement.data.children = [];
    return newElement;
}

// Create a new BE.
function createBe(name, rate, dorm, posX, posY) {
    var newElement = createGeneralElement(DftTypes.BE, name, posX, posY);
    newElement.data.rate = rate;
    newElement.data.dorm = dorm;
    return newElement;
}

// Add element to graph.
function createNode(element, parent) {
    if (parent != null) {
        element.data.parent = parent.data("id");
    }
    var node = cy.add(element);
    setLabel(node);
    return node;
}

// Create a new compound for a given gate.
function createCompoundNode(gate) {
    var element = createGeneralElement(DftTypes.COMPOUND, gate.data.name, gate.position.x, gate.position.y);
    element.classes = DftTypes.COMPOUND + "-" + gate.data.type;
    element.data.compound = gate.data.id;
    element.data["expanded-collapsed"] = 'expanded';
    return createNode(element, null);
}

// Remove a node and all connected edges.
function removeNode(node) {
    var edges = node.connectedEdges();
    edges.forEach(function( edge ){
        removeEdge(edge);
    });
    node.remove();
}

// Get a new edge. If there already exists an edge with the same source
// and target nodes the edge id is marked as 'idInvalid'.
function getNewEdge(sourceNode, targetNode) {
    var sourceId = sourceNode.data('id');
    var targetId = targetNode.data('id');
    var edgeId = sourceId + 'e' + targetId;
    if (cy.edges("[id='" + edgeId + "']").length > 0) {
        edgeId = 'idInvalid';
    }

    return {
        data: {
            id: edgeId,
            source: sourceId,
            target: targetId,
        }
    };
}

// Add the newly created edge and update the child relation.
function addEdge(edge, source, target) {
    var children = source.data('children');
    children.push(target.data('id'));
    source.data('children', children);
    edge.data('index', children.length-1);
}

function createEdge(source, target) {
    var edge = getNewEdge(source, target);
    var newEdge = cy.add(edge);
    addEdge(newEdge, source, target);
    return newEdge;
}

// Remove edge from graph and update indices.
function removeEdge(edge) {
    var sourceId = edge.data('source');
    var targetId = edge.data('target');
    var edgeIndex = edge.data('index');
    var sourceNode = cy.getElementById(sourceId);
    var children = sourceNode.data('children');
    if (children.length <= edgeIndex || children[edgeIndex] != targetId) {
        throw new Error('Indices do not match');
    }
    // Remove index entry in node
    children.splice(edgeIndex, 1);
    sourceNode.data('children', children);
    // Update indices of all other edges
    var edges = sourceNode.connectedEdges();
    edges.forEach(function( edgeUpdate ){
        var index = edgeUpdate.data('index');
        if (index > edgeIndex) {
            edgeUpdate.data('index', index-1);
        }
    });
    edge.remove();
}

// Set element as toplevel element.
function setToplevelId(node) {
    topLevelId = node.data('id');
}

// Create subtree for (partly) covered failures.
function createCoveredFailure(faultName, rate, coverage, safetyRate, posX, posY) {
    // Create nodes
    var orFaultElement = createGate(DftTypes.OR, faultName, posX, posY);
    var compoundNode = createCompoundNode(orFaultElement);
    var orFault = createNode(orFaultElement, compoundNode);
    var nodeFaultNotCovered = createNode(createBe(faultName + "NotCov", rate * (1-coverage), 1.0, posX-75, posY+100), compoundNode);
    var andNotDetected = createNode(createGate(DftTypes.AND, faultName + "NotDet", posX+75, posY+100), compoundNode);
    var seqCovered = createNode(createGate(DftTypes.SEQ, "seq" + faultName, posX+150, posY+100), compoundNode);
    var nodeSafety = createNode(createBe(faultName + "SafeMech", safetyRate, 1.0, posX+50, posY+200), compoundNode);
    var nodeFaultCovered = createNode(createBe(faultName + "Cov", rate * coverage, 1.0, posX+150, posY+200), compoundNode);

    // Create edges.
   createEdge(orFault, nodeFaultNotCovered);
   createEdge(orFault, andNotDetected);
   createEdge(andNotDetected, nodeSafety);
   createEdge(andNotDetected, nodeFaultCovered);
   createEdge(seqCovered, nodeSafety);
   createEdge(seqCovered, nodeFaultCovered);
}
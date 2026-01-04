"""
FLOWCHART COMPILER: COMPLETE LINE-BY-LINE EXPLANATION
=====================================================

This document provides a complete, exhaustive explanation of every line
in the FlowchartCompiler JavaScript code (approximately 2000 lines).
"""

# ============================================================================
# SECTION 1: CLASS DEFINITION AND INITIALIZATION
# ============================================================================

"""
Lines 1-2: Global Namespace Setup
----------------------------------
window.FlowCode = window.FlowCode || {};

Purpose: Ensures FlowCode namespace exists in global window object.
This prevents overwriting existing FlowCode if multiple scripts load.

Lines 4-25: Class Constructor
-----------------------------
class FlowchartCompiler {
    constructor(nodes, connections, useHighlighting = false) {

Parameters:
- nodes: Array of flowchart node objects
- connections: Array of connection objects between nodes  
- useHighlighting: Boolean for debug visualization (default false)

Instance Properties Initialized:
1. this.nodes = nodes
   Stores the input nodes array for compilation.

2. this.connections = connections
   Stores connections between nodes.

3. this.useHighlighting = useHighlighting
   Controls whether to insert highlight() calls for visual debugging.

4. this.loweredImplicitLoops = new Set()
   Tracks implicit forever loop headers that have been compiled.
   Prevents recompiling the same implicit loop multiple times.

5. this.nodesToSkip = new Set()
   Temporary storage for nodes that should be skipped during compilation.
   Used primarily for for-loop initialization and increment nodes.

6. this.forPatternCache = new Map()
   Memoization cache for for-loop pattern detection results.
   Key: decision node ID, Value: for-loop info object or null.
   Improves performance by avoiding repeated pattern detection.

7. this.forPatternInProgress = new Set()
   Prevents infinite recursion during for-loop pattern detection.
   When detectForLoopPattern() is called recursively, this set tracks
   which decisions are currently being analyzed.

8. this.dominators = new Map()
   Stores dominator analysis results.
   Key: node ID, Value: Set of node IDs that dominate this node.
   Critical for loop detection and control flow analysis.

9. this.immediateDominator = new Map()  
   Key: node ID, Value: immediate dominator node ID (closest dominator).
   Used for dominator tree construction and loop analysis.

10. this.backEdges = []
    Array of back edge objects: {from: nodeId, to: nodeId, port: string}
    Back edges are edges where target dominates source (loop indicators).

11. this.loopHeaders = new Set()
    Set of node IDs that are loop headers (targets of back edges).

12. this.naturalLoops = new Map()
    Key: loop header ID, Value: Set of node IDs in the natural loop.
    Computed for each back edge.

13. this.outgoingMap = new Map()
    Control flow graph: node ID → array of outgoing connections.
    Each connection: {from, port, to, targetId, sourceId}

14. this.incomingMap = new Map()
    Control flow graph: node ID → array of incoming connections.

Constructor Execution Flow:
1. Store inputs in instance properties
2. Initialize all analysis data structures
3. Call this.buildMaps() - builds control flow graph
4. Call this.computeDominators() - performs dominator analysis
5. Call this.findBackEdgesAndLoops() - identifies loops

Important: The constructor immediately performs static analysis
on the flowchart, which is essential for later compilation.
"""
# Example initialization:
"""
const compiler = new FlowchartCompiler(
    [
        {id: 'n1', type: 'start', text: 'Start'},
        {id: 'n2', type: 'var', text: 'x = 0'}
    ],
    [
        {from: 'n1', port: 'next', to: 'n2'}
    ],
    false
);
This creates a compiler instance with complete flow analysis.
"""

# ============================================================================
# SECTION 2: HIGHLIGHT SYSTEM
# ============================================================================

"""
Lines 27-32: emitHighlight Method
----------------------------------
emitHighlight(nodeId, indentLevel) {
    if (!this.useHighlighting) return "";
    const indent = "    ".repeat(indentLevel);
    return `${indent}highlight('${nodeId}')\n`;
}

Purpose: Generates highlight statements for visual debugging.

Parameters:
- nodeId: String ID of node to highlight
- indentLevel: Integer for Python indentation level

Behavior:
1. If useHighlighting is false, returns empty string (no highlight)
2. Creates indentation string: 4 spaces × indentLevel
3. Returns formatted string: "    highlight('nodeId')\n"

Example output with indentLevel=1:
    highlight('n22')

Note: highlight() is assumed to be a user-defined function
that visually indicates which flowchart node is executing.
"""

# ============================================================================
# SECTION 3: FOR-LOOP INITIALIZATION DETECTION
# ============================================================================

"""
Lines 34-52: isInitOfForLoop Method
------------------------------------
isInitOfForLoop(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node || (node.type !== "var" && node.type !== "process")) return false;

Purpose: Determines if a node is the initialization statement of a for-loop.

Parameters:
- nodeId: String ID of node to check

Logic:
1. Find the node object by ID
2. If node doesn't exist OR node type is not "var" or "process", return false
   (Only variable/process nodes can be for-loop initializations)

Lines 37-47: For-Loop Detection Loop
-------------------------------------
    for (const dec of this.nodes.filter(n => n.type === "decision")) {
        const info = this.detectForLoopPattern(dec.id);
        if (!info || !info.initNodeId) continue;

        if (info.initNodeId === nodeId) {
            console.log(`Node ${nodeId} is init for for-loop at ${dec.id}`);
            return true;
        }
    }

Logic:
1. Filter all nodes to get only decision nodes
2. For each decision node:
   a. Call detectForLoopPattern() to check if it's a for-loop header
   b. If no for-loop info OR no initNodeId, skip to next decision
   c. If this node's ID matches the for-loop's initNodeId, return true
3. If no match found, return false

Example:
Node n8 with text "x = 0" is detected as init for for-loop at n22
when n22 has for-loop pattern with initNodeId = 'n8'.

Lines 49-51: Return Default
---------------------------
    return false;
}

Returns false if node is not a for-loop initialization for any decision.
"""

# ============================================================================
# SECTION 4: IMPLICIT FOREVER LOOP DETECTION
# ============================================================================

"""
Lines 54-93: findImplicitForeverLoopHeaders Method
--------------------------------------------------
findImplicitForeverLoopHeaders() {
    const headers = new Set();
    const visited = new Set();
    const onStack = new Set();

Purpose: Finds cycles in the flowchart that don't involve decision nodes
(implicit forever loops like: process → process → back to first process).

Returns: Set of node IDs that are headers of implicit forever loops.

Data Structures:
- headers: Set to collect loop header nodes
- visited: Set of visited nodes in DFS
- onStack: Set of nodes in current DFS path (for cycle detection)

Lines 61-64: DFS Function Definition
-------------------------------------
    const dfs = (nodeId) => {
        visited.add(nodeId);
        onStack.add(nodeId);

Depth-First Search function that:
1. Marks node as visited
2. Adds node to current path stack

Lines 65-67: Get Outgoing Connections
--------------------------------------
        const outgoing = this.outgoingMap.get(nodeId) || [];

Gets all outgoing edges from current node.
Returns empty array if no outgoing connections.

Lines 68-87: Process Each Outgoing Edge
----------------------------------------
        for (const edge of outgoing) {
            const target = edge.targetId;

            if (!visited.has(target)) {
                dfs(target);  // Recursive DFS
            } else if (onStack.has(target)) {
                // BACK EDGE detected: nodeId → target
                const fromNode = this.nodes.find(n => n.id === nodeId);
                const toNode   = this.nodes.find(n => n.id === target);

                if (!fromNode || !toNode) continue;

                // ignore ALL decision-controlled loops
                if (fromNode.type === "decision") continue;
                if (toNode.type   === "decision") continue;

                // non-decision → non-decision = implicit forever loop
                headers.add(target);
            }
        }

        onStack.delete(nodeId);
    };

Logic for each outgoing edge:
1. If target not visited: recursive DFS call
2. If target is on stack: back edge detected (cycle)
   a. Get fromNode and toNode objects
   b. Skip if either node missing
   c. SKIP if fromNode OR toNode is a decision node
     (Decision-controlled loops are handled separately)
   d. If both are non-decision nodes: add target to headers as implicit loop

Lines 89-93: Start DFS and Return
----------------------------------
    const start = this.nodes.find(n => n.type === "start");
    if (start) dfs(start.id);
    return headers;
}

1. Find start node
2. If start exists, begin DFS from start
3. Return set of implicit loop headers

Example: A cycle like: process1 → process2 → process1
would be detected as implicit forever loop with header = process1.
"""

# ============================================================================
# SECTION 5: TRUE LOOP HEADER VERIFICATION
# ============================================================================

"""
Lines 95-141: isTrueLoopHeader Method
--------------------------------------
isTrueLoopHeader(nodeId) {
    const yesId = this.getSuccessor(nodeId, 'yes');
    const noId = this.getSuccessor(nodeId, 'no');
    
    // Track all exit nodes (nodes that lead to END without looping back)
    const exitNodes = new Set();

Purpose: Verifies if a decision node is a true loop header where
BOTH branches eventually loop back to the decision.

Parameters:
- nodeId: Decision node ID to check

Returns: Boolean - true if both branches loop back, false otherwise.

Lines 103-107: checkBranch Recursive Function
---------------------------------------------
    const checkBranch = (startId, visited = new Set()) => {
        if (!startId || visited.has(startId)) return true; // Assume loops
        
        visited.add(startId);

Recursive function to check if a branch loops back.
Parameters:
- startId: Starting node ID for the branch
- visited: Set of already visited nodes (prevents infinite recursion)

Base cases:
1. No startId or already visited: return true (assume loops)
2. Mark current node as visited

Lines 108-112: END Node Check
------------------------------
        // Found END → this is an exit path
        const node = this.nodes.find(n => n.id === startId);
        if (node && node.type === 'end') {
            exitNodes.add(startId);
            return false; // Found exit!
        }

If node is END type:
1. Add to exitNodes set
2. Return false (this path exits, doesn't loop)

Lines 114-115: Loop Back Detection
----------------------------------
        // Found our loop header → loops
        if (startId === nodeId) return true;

If we reach the original decision node: return true (loops back).

Lines 117-129: Check All Successors
-----------------------------------
        // Check all successors
        const outgoing = this.outgoingMap.get(startId) || [];
        let allPathsLoop = outgoing.length > 0; // Default true if no outgoing
        
        for (const edge of outgoing) {
            if (!checkBranch(edge.targetId, new Set([...visited]))) {
                allPathsLoop = false;
                // Don't break, continue to find all exits
            }
        }
        
        return allPathsLoop;
    };

Logic:
1. Get all outgoing connections
2. Initialize allPathsLoop = true if there are outgoing edges
   (If no outgoing edges, it's a dead end = doesn't loop)
3. For each outgoing edge: recursively check if target loops
4. If any path doesn't loop: set allPathsLoop = false
5. Return allPathsLoop

Lines 131-136: Check Both Branches
----------------------------------
    const yesLoops = checkBranch(yesId, new Set());
    const noLoops = noId ? checkBranch(noId, new Set()) : true;
    
    console.log(`isTrueLoopHeader(${nodeId}): yesLoops=${yesLoops}, noLoops=${noLoops}, exitNodes=${Array.from(exitNodes)}`);

Check YES and NO branches:
1. yesLoops: Does YES branch loop back?
2. noLoops: If noId exists, does NO branch loop back? If no noId, assume true.

Lines 138-141: Final Decision
-----------------------------
    // True loop: BOTH branches eventually loop back
    return yesLoops && noLoops;
}

Returns true only if BOTH branches loop back to the decision.

Example: A while loop where YES loops back and NO exits → returns false.
"""

# ============================================================================
# SECTION 6: CONTROL FLOW GRAPH CONSTRUCTION
# ============================================================================

"""
Lines 142-168: buildMaps Method
--------------------------------
buildMaps() {
    // Clear maps and cache
    this.outgoingMap.clear();
    this.incomingMap.clear();

Purpose: Rebuilds the control flow graph from connections.
Called during initialization and can be called again if graph changes.

Lines 146-150: Initialize Empty Arrays
--------------------------------------
    // Initialize maps for all nodes
    this.nodes.forEach(node => {
        this.outgoingMap.set(node.id, []);
        this.incomingMap.set(node.id, []);
    });

Creates empty arrays for every node ID in both maps.
Ensures even isolated nodes have entries.

Lines 152-167: Fill Maps from Connections
-----------------------------------------
    // Fill maps
    this.connections.forEach(conn => {
        // Outgoing connections
        const outgoing = this.outgoingMap.get(conn.from) || [];
        outgoing.push({...conn, targetId: conn.to});
        this.outgoingMap.set(conn.from, outgoing);
        
        // Incoming connections
        const incoming = this.incomingMap.get(conn.to) || [];
        incoming.push({...conn, sourceId: conn.from});
        this.incomingMap.set(conn.to, incoming);
    });

For each connection:
1. OUTGOING: Add to conn.from's outgoing array
   - Create copy of connection object with targetId property
   - Push to array
   - Update map
2. INCOMING: Add to conn.to's incoming array  
   - Create copy with sourceId property
   - Push to array
   - Update map

Example connection: {from: 'n1', port: 'next', to: 'n2'}
Result:
outgoingMap['n1'] = [{from: 'n1', port: 'next', to: 'n2', targetId: 'n2'}]
incomingMap['n2'] = [{from: 'n1', port: 'next', to: 'n2', sourceId: 'n1'}]

This bidirectional mapping enables efficient graph traversal.
"""

# ============================================================================
# SECTION 7: DOMINATOR ANALYSIS IMPLEMENTATION
# ============================================================================

"""
Lines 170-262: computeDominators Method
---------------------------------------
computeDominators() {
    const startNode = this.nodes.find(n => n.type === 'start');
    if (!startNode) return;

Purpose: Computes dominator sets for all nodes using iterative dataflow analysis.
Dominator D of node N: Every path from start to N must pass through D.

Lines 175-177: Get All Node IDs
--------------------------------
    const allNodeIds = this.nodes.map(n => n.id);
    const startId = startNode.id;

1. allNodeIds: Array of all node IDs
2. startId: ID of start node

Lines 179-192: Initialize Dominator Sets
----------------------------------------
    // Initialize dominator sets
    this.dominators.clear();
    
    // All nodes except start: dominated by all nodes initially
    const allNodesSet = new Set(allNodeIds);
    for (const nodeId of allNodeIds) {
        if (nodeId === startId) {
            this.dominators.set(nodeId, new Set([startId])); // Start dominates only itself
        } else {
            this.dominators.set(nodeId, new Set(allNodesSet)); // All nodes initially
        }
    }

Initialization:
- Clear existing dominators map
- Create set of all node IDs
- For each node:
  * Start node: dominates only itself
  * Other nodes: initially dominated by all nodes (overestimation)

This is the standard "top" initialization in dataflow analysis.

Lines 194-232: Iterative Fixed-Point Algorithm
----------------------------------------------
    // Iterative fixed-point algorithm
    let changed = true;
    while (changed) {
        changed = false;
        
        // Process nodes in reverse post-order would be better, but simple iteration works
        for (const nodeId of allNodeIds) {
            if (nodeId === startId) continue;
            
            const predecessors = (this.incomingMap.get(nodeId) || []).map(conn => conn.sourceId);
            if (predecessors.length === 0) continue;

Algorithm:
1. changed flag: continues while changes occur
2. Skip start node (already computed)
3. Get predecessors from incomingMap
4. Skip if no predecessors (unreachable node)

Lines 207-225: Intersection of Predecessor Dominators
-----------------------------------------------------
            // Intersection of dominators of all predecessors
            let newDomSet = null;
            for (const pred of predecessors) {
                const predDoms = this.dominators.get(pred);
                if (!predDoms) continue;
                
                if (newDomSet === null) {
                    newDomSet = new Set(predDoms);
                } else {
                    // Intersection: keep only nodes in both sets
                    for (const dom of newDomSet) {
                        if (!predDoms.has(dom)) {
                            newDomSet.delete(dom);
                        }
                    }
                }
            }

Key equation: dom(n) = {n} ∪ ∩(dom(p) for all predecessors p of n)

Steps:
1. Initialize newDomSet with first predecessor's dominators
2. For each subsequent predecessor: intersect with their dominators
3. Intersection: remove nodes not in both sets

Lines 227-232: Update and Check for Change
------------------------------------------
            if (newDomSet) {
                // Node always dominates itself
                newDomSet.add(nodeId);
                
                // Check if changed
                const oldDomSet = this.dominators.get(nodeId);
                if (!this.setsEqual(oldDomSet, newDomSet)) {
                    this.dominators.set(nodeId, newDomSet);
                    changed = true;
                }
            }
        }
    }

Final steps:
1. Add node to its own dominator set (always dominates itself)
2. Compare with old dominator set
3. If changed: update map and set changed = true
4. Loop continues until no changes (fixed point reached)

Time complexity: O(N²) worst case, but typically O(N×E)
"""

# ============================================================================
# SECTION 8: SET UTILITIES
# ============================================================================

"""
Lines 234-243: setsEqual Method
--------------------------------
setsEqual(setA, setB) {
    if (setA.size !== setB.size) return false;
    for (const item of setA) {
        if (!setB.has(item)) return false;
    }
    return true;
}

Purpose: Compares two Set objects for equality.

Algorithm:
1. Compare sizes: if different, sets are not equal
2. For each item in setA: check if setB contains it
3. If all items match, return true

Note: Works for Sets of primitive values (node IDs are strings).
"""

# ============================================================================
# SECTION 9: IMMEDIATE DOMINATOR COMPUTATION
# ============================================================================

"""
Lines 245-294: computeImmediateDominators Method
------------------------------------------------
computeImmediateDominators(startId) {
    this.immediateDominator.clear();
    
    // Start node has no immediate dominator
    this.immediateDominator.set(startId, null);

Purpose: Computes immediate dominator (idom) - the closest strict dominator.

Parameters:
- startId: ID of start node

Immediate dominator definition: 
The unique strict dominator of n that is not dominated by any other strict dominator of n.

Lines 251-294: Process Each Node
--------------------------------
    for (const [nodeId, domSet] of this.dominators) {
        if (nodeId === startId) continue;

Skip start node (already handled).

Lines 254-260: Get Strict Dominators
-------------------------------------
        // Get strict dominators (excluding self)
        const strictDoms = new Set(domSet);
        strictDoms.delete(nodeId);
        
        if (strictDoms.size === 0) {
            this.immediateDominator.set(nodeId, null);
            continue;
        }

1. Copy dominator set
2. Remove self (strict dominators only)
3. If no strict dominators: set idom = null, continue

Lines 262-291: Find Immediate Dominator
---------------------------------------
        // Find immediate dominator: 
        // The strict dominator that is not dominated by any other strict dominator
        let idom = null;
        const strictDomArray = Array.from(strictDoms);
        
        for (let i = 0; i < strictDomArray.length; i++) {
            const candidate = strictDomArray[i];
            let isIDom = true;
            
            for (let j = 0; j < strictDomArray.length; j++) {
                if (i === j) continue;
                const other = strictDomArray[j];
                const otherDoms = this.dominators.get(other);
                if (otherDoms && otherDoms.has(candidate)) {
                    // 'candidate' is dominated by 'other', so not immediate
                    isIDom = false;
                    break;
                }
            }
            
            if (isIDom) {
                idom = candidate;
                break;
            }
        }
        
        this.immediateDominator.set(nodeId, idom);

Algorithm:
1. Convert strict dominators to array
2. For each candidate dominator:
   a. Assume it's immediate (isIDom = true)
   b. Check against all other strict dominators:
      If candidate is dominated by any other strict dominator → not immediate
   c. If no other dominator dominates candidate → found idom
3. Store result in immediateDominator map

Example: If dom(n) = {start, A, B, n} and B dominates A,
then idom(n) = B (closest dominator).
"""

# ============================================================================
# SECTION 10: BACK EDGE AND LOOP DETECTION
# ============================================================================

"""
Lines 296-351: findBackEdgesAndLoops Method
-------------------------------------------
findBackEdgesAndLoops() {
    this.backEdges = [];
    this.loopHeaders.clear();
    this.naturalLoops.clear();

Purpose: Identifies loops in the control flow graph using dominator analysis.

Lines 301-316: Find All Back Edges
-----------------------------------
    // Find all back edges
    for (const node of this.nodes) {
        const outgoing = this.outgoingMap.get(node.id) || [];
        
        for (const edge of outgoing) {
            const fromId = node.id;
            const toId = edge.targetId;
            
            // Check if 'toId' dominates 'fromId'
            const fromDoms = this.dominators.get(fromId);
            if (fromDoms && fromDoms.has(toId)) {
                // Back edge found: fromId → toId where toId dominates fromId
                this.backEdges.push({from: fromId, to: toId, port: edge.port});
                this.loopHeaders.add(toId);
                
                console.log(`Back edge: ${fromId} → ${toId} (${edge.port}), Loop header: ${toId}`);
            }
        }
    }

Back edge definition: Edge X → Y where Y dominates X.

Algorithm:
1. For each node's outgoing edges
2. Check if target dominates source
3. If yes: it's a back edge
   - Add to backEdges array
   - Add target to loopHeaders set
   - Log for debugging

Lines 318-326: Compute Natural Loops
------------------------------------
    // Compute natural loop for each back edge
    for (const backEdge of this.backEdges) {
        const loopNodes = this.computeNaturalLoop(backEdge.from, backEdge.to);
        this.naturalLoops.set(backEdge.to, loopNodes);
        console.log(`Loop header ${backEdge.to} contains: ${Array.from(loopNodes).join(', ')}`);
    }

For each back edge X → Y:
1. Compute natural loop (all nodes in the loop)
2. Store in naturalLoops map with Y as key
3. Log loop contents
"""

# ============================================================================
# SECTION 11: NATURAL LOOP COMPUTATION
# ============================================================================

"""
Lines 329-349: computeNaturalLoop Method
-----------------------------------------
computeNaturalLoop(backEdgeFrom, backEdgeTo) {
    const loopNodes = new Set([backEdgeTo, backEdgeFrom]);
    const stack = [backEdgeFrom];
    const visited = new Set([backEdgeTo]); // Don't pass through header

Purpose: Computes all nodes in a natural loop for back edge X → Y.

Parameters:
- backEdgeFrom: Source node of back edge (X)
- backEdgeTo: Target node of back edge (Y, loop header)

Returns: Set of node IDs in the natural loop.

Lines 335-347: DFS to Collect Loop Nodes
----------------------------------------
    while (stack.length > 0) {
        const current = stack.pop();
        if (visited.has(current)) continue;
        visited.add(current);
        
        loopNodes.add(current);
        
        // Add predecessors (except the header)
        const predecessors = (this.incomingMap.get(current) || []).map(conn => conn.sourceId);
        for (const pred of predecessors) {
            if (pred !== backEdgeTo && !visited.has(pred)) {
                stack.push(pred);
            }
        }
    }
    
    return loopNodes;
}

Algorithm:
1. Start with loop header and back edge source
2. Use stack for DFS
3. Don't pass through header (avoid infinite loops)
4. For each node:
   a. Add to loopNodes
   b. Get all predecessors
   c. Push predecessors to stack (except header and already visited)
5. Return complete set of loop nodes

Natural loop definition: Y plus all nodes that can reach X without passing through Y.
"""

# ============================================================================
# SECTION 12: LOOP HEADER CHECK
# ============================================================================

"""
Lines 352-357: isLoopHeader Method
-----------------------------------
isLoopHeader(nodeId) {
    return this.loopHeaders.has(nodeId);
}

Purpose: Simple check if a node is a loop header.
Returns: Boolean from loopHeaders set.
"""

# ============================================================================
# SECTION 13: BACK EDGE DETECTION TO SPECIFIC NODE
# ============================================================================

"""
Lines 360-378: isBackEdgeTo Method
-----------------------------------
isBackEdgeTo(decisionId, branchId) {
    if (!branchId) return false;

Purpose: Checks if a specific branch creates a back edge to a decision.

Parameters:
- decisionId: Target decision node
- branchId: Starting node of branch to check

Returns: Boolean - true if branch (or its descendants) has back edge to decision.

Lines 365-377: Check All Back Edges
------------------------------------
    // Check all back edges to see if any starts from branchId (or its descendants)
    // and ends at decisionId
    for (const backEdge of this.backEdges) {
        if (backEdge.to === decisionId) {
            // Check if branchId can reach backEdge.from
            if (this.canReach(branchId, backEdge.from, new Set([decisionId]))) {
                return true;
            }
        }
    }
    return false;
}

Algorithm:
1. For each back edge to decisionId
2. Check if branchId can reach the back edge source
3. Use canReach() with decisionId as avoid node
4. If any back edge reachable, return true
"""

# ============================================================================
# SECTION 14: REACHABILITY CHECK
# ============================================================================

"""
Lines 381-407: canReach Method
-------------------------------
canReach(startId, targetId, avoidSet = new Set()) {
    if (startId === targetId) return true;

Purpose: Checks if startId can reach targetId in control flow graph.

Parameters:
- startId: Starting node ID
- targetId: Target node ID  
- avoidSet: Set of nodes to avoid (prevent infinite recursion)

Returns: Boolean - true if reachable.

Lines 386-406: BFS/DFS Search
------------------------------
    const visited = new Set();
    const stack = [startId];
    
    while (stack.length > 0) {
        const current = stack.pop();
        if (visited.has(current) || avoidSet.has(current)) continue;
        visited.add(current);
        
        if (current === targetId) return true;
        
        const outgoing = this.outgoingMap.get(current) || [];
        for (const edge of outgoing) {
            stack.push(edge.targetId);
        }
    }
    
    return false;
}

Algorithm (DFS using stack):
1. Initialize visited set and stack with startId
2. While stack not empty:
   a. Pop current node
   b. Skip if visited or in avoidSet
   c. Mark visited
   d. If current == targetId: return true
   e. Push all successors to stack
3. Return false if target not found
"""

# ============================================================================
# SECTION 15: LOOP INFORMATION EXTRACTION
# ============================================================================

"""
Lines 409-455: getLoopInfo Method
----------------------------------
getLoopInfo(headerId) {
    // Find all back edges to this header
    const edgesToHeader = this.backEdges.filter(edge => edge.to === headerId);
    if (edgesToHeader.length === 0) return null;

Purpose: Extracts loop structure information for a loop header.

Parameters:
- headerId: Loop header node ID

Returns: Object with {bodyId, exitId, useNoBranch, backEdgeFrom} or null.

Lines 415-419: Get Decision Successors
---------------------------------------
    // For simplicity, take the first back edge
    const backEdge = edgesToHeader[0];
    
    // Determine which branch contains the loop body
    const yesId = this.getSuccessor(headerId, 'yes');
    const noId = this.getSuccessor(headerId, 'no');

Assumption: First back edge is sufficient (multiple back edges possible but rare).

Lines 421-453: Determine Loop Body and Exit
-------------------------------------------
    let loopBodyId = null;
    let exitId = null;
    let useNoBranch = false;
    
    // Check if YES branch leads to the back edge
    if (yesId && this.canReach(yesId, backEdge.from, new Set([headerId]))) {
        loopBodyId = yesId;
        exitId = noId;
        useNoBranch = false;
    }
    // Check if NO branch leads to the back edge
    else if (noId && this.canReach(noId, backEdge.from, new Set([headerId]))) {
        loopBodyId = noId;
        exitId = yesId;
        useNoBranch = true;
    }
    
    if (loopBodyId) {
        return {
            bodyId: loopBodyId,
            exitId: exitId,
            useNoBranch: useNoBranch,
            backEdgeFrom: backEdge.from
        };
    }
    
    return null;

Logic:
1. Check if YES branch reaches back edge source
   - If yes: YES is loop body, NO is exit
2. Else check if NO branch reaches back edge source  
   - If yes: NO is loop body, YES is exit (inverted loop)
3. Return structured info if loop body identified

Example: Standard while loop: YES loops back, NO exits.
Inverted loop: NO loops back, YES exits.
"""

# ============================================================================
# SECTION 16: SUCCESSOR UTILITIES
# ============================================================================

"""
Lines 457-464: getSuccessor Method
-----------------------------------
getSuccessor(nodeId, port = 'next') {
    const outgoing = this.outgoingMap.get(nodeId) || [];
    const conn = outgoing.find(c => c.port === port);
    return conn ? conn.targetId : null;
}

Purpose: Gets the target node ID for a specific port of a node.

Parameters:
- nodeId: Source node ID
- port: Connection port ('next', 'yes', 'no')

Returns: Target node ID or null if no connection on that port.

Algorithm:
1. Get outgoing connections for node
2. Find connection with matching port
3. Return targetId or null
"""

# ============================================================================
# SECTION 17: ALL SUCCESSORS GETTER
# ============================================================================

"""
Lines 466-471: getAllSuccessors Method
---------------------------------------
getAllSuccessors(nodeId) {
    const outgoing = this.outgoingMap.get(nodeId) || [];
    return outgoing.map(c => ({port: c.port, nodeId: c.targetId}));
}

Purpose: Gets all successors of a node with their ports.

Returns: Array of {port, nodeId} objects for all outgoing connections.
"""

# ============================================================================
# SECTION 18: MAIN COMPILATION ENTRY POINT
# ============================================================================

"""
Lines 474-502: compile Method
------------------------------
compile() {
    this.forPatternCache.clear();
    this.forPatternInProgress.clear();
    const startNode = this.nodes.find(n => n.type === 'start');
    if (!startNode) return "# Add a Start node.";

Purpose: Main entry point for compilation.

Initialization:
1. Clear for-loop caches
2. Find start node
3. If no start node: return error message

Lines 478-480: Rebuild Maps
---------------------------
    this.buildMaps(); // Ensure maps are up to date

Ensures control flow graph is current (in case nodes/connections changed).

Lines 481-482: Find Implicit Loops
-----------------------------------
    this.implicitLoopHeaders = this.findImplicitForeverLoopHeaders();

Detects implicit forever loops (non-decision cycles).

Lines 484-490: Pre-Detect For-Loops
------------------------------------
    this.nodes
        .filter(n => n.type === "decision")
        .forEach(dec => {
            const info = this.detectForLoopPattern(dec.id);
            if (info && info.initNodeId) {
                
            }
        });

Pre-computes for-loop patterns for all decisions.
The empty if block suggests this was for debugging/logging.

Lines 492-493: Start Compilation
--------------------------------
    // Use iterative compilation with manual stack management
    let code = this.compileNode(startNode.id, new Set(), [], 0, false, false);

Start recursive compilation from start node with:
- Empty visited set
- Empty context stack  
- Indent level 0
- Not in loop body
- Not in loop header

Lines 495-501: Add END Highlight
--------------------------------
    // Add END node highlight as the very last line if we're in highlighting mode
    if (this.useHighlighting) {
        const endNode = this.nodes.find(n => n.type === 'end');
        if (endNode) {
            code += `highlight('${endNode.id}')\n`;
        }
    }
    
    return code;
}

Adds final highlight for END node if highlighting enabled.
Returns complete Python code string.
"""

# ============================================================================
# SECTION 19: CONVERGENCE POINT DETECTION
# ============================================================================

"""
Lines 504-510: isConvergencePoint Method
-----------------------------------------
isConvergencePoint(nodeId) {
    const incoming = this.incomingMap.get(nodeId) || [];
    // Nodes with multiple incoming connections are convergence points
    // Common examples: loop increments, merge points after if/else
    return incoming.length > 1;
}

Purpose: Identifies nodes where multiple control flow paths converge.

Returns: Boolean - true if node has >1 incoming connections.

Examples:
- Loop increment nodes (x = x + 1)
- Merge points after if/else branches
- Phi nodes in SSA form
"""

# ============================================================================
# SECTION 20: CORE NODE COMPILATION (PART 1)
# ============================================================================

"""
Lines 512-626: compileNode Method (First Half)
-----------------------------------------------
compileNode(nodeId, visitedInPath, contextStack, indentLevel, inLoopBody = false, inLoopHeader = false) {
    if (!nodeId) return "";

Purpose: Recursively compiles a node and its successors with cycle protection.

Parameters:
- nodeId: Current node ID to compile
- visitedInPath: Set of nodes visited in current path (prevents cycles)
- contextStack: Array tracking nested control structures
- indentLevel: Python indentation level
- inLoopBody: Boolean - currently inside a loop body
- inLoopHeader: Boolean - currently at a loop header

Lines 515-519: Find Node Object
--------------------------------
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return "";

Find node object by ID. Return empty string if not found.

Lines 521-529: END Node Special Handling
-----------------------------------------
    // ✅ END NODE: no per-visit highlight, no children
    if (node.type === "end") {
        // Do not emit highlight here – the END is highlighted once in compile()
        return "";
    }

END nodes:
1. No highlight emitted here (added at end of compile())
2. No children compiled (end of flow)
3. Return empty string

Lines 531-535: Add Highlight for Non-END Nodes
-----------------------------------------------
    // ✅ everyone else gets highlighted on entry
    let code = "";
    code += this.emitHighlight(nodeId, indentLevel);

All non-END nodes get highlight call (if highlighting enabled).

Lines 537-540: Redundant END Check
-----------------------------------
    // ===========================
    // END NODE FINISHES FLOW
    // ===========================
    if (node.type === "end") {
        return code; // highlight already emitted
    }

Duplicate END check (already handled above). Should be removed.

Lines 543-549: Convergence Point Detection
------------------------------------------
    // ============================================
    // ✅ NEW: ALLOW convergence points to be revisited
    // ============================================
    const isConvergencePoint = this.isConvergencePoint(nodeId);

Detect if node is a convergence point (multiple incoming paths).
Convergence points can be revisited from different paths.

Lines 552-556: Cycle Protection
-------------------------------
    // ===========================
    // cycle protection PER CONTEXT - UPDATED
    // ===========================
    if (!isConvergencePoint && visitedInPath.has(nodeId)) {
        console.log(`Skipping already visited node: ${nodeId}`);
        return "";
    }

Prevent infinite recursion:
- If NOT a convergence point AND already visited: skip
- Convergence points can be revisited (necessary for loops)

Lines 558-561: Add to Visited Set
---------------------------------
    // Only add to visited if NOT a convergence point
    if (!isConvergencePoint) {
        visitedInPath.add(nodeId);
    }

Update visited set for non-convergence points.

Lines 564-575: Skip For-Loop Init Nodes
----------------------------------------
    // ===========================
    // skip for-loop init nodes
    // ===========================
    if (this.isInitOfForLoop(nodeId)) {
        console.log(`Skipping for-loop init node: ${nodeId}`);
        const succ = this.getAllSuccessors(nodeId);
        for (const { nodeId: nxt } of succ) {
            code += this.compileNode(nxt, visitedInPath, [...contextStack], indentLevel, inLoopBody, inLoopHeader);
        }
        return code;
    }

For-loop initialization nodes (like x = 0):
1. Skip compiling the node itself
2. Directly compile all successors
3. Return accumulated code

Lines 577-609: Skip Marked Nodes
---------------------------------
    // ===========================
    // skip nodes marked in nodesToSkip
    // ===========================
    if (this.nodesToSkip && this.nodesToSkip.has(nodeId)) {

        // if it's the synthetic loop header → handle exit/body routing
        if (nodeId === this.loopHeaderId) {
            const yesId = this.getSuccessor(nodeId, "yes");
            const noId  = this.getSuccessor(nodeId, "no");

            const isInThisLoop = contextStack.some(ctx => ctx === `loop_${nodeId}`);
            const forInfo = this.detectForLoopPattern(nodeId);

            if (forInfo && (isInThisLoop || inLoopBody)) {
                return code; // highlight already emitted
            }

            if (isInThisLoop || inLoopBody) {
                return code + this.compileNode(yesId, visitedInPath, [...contextStack], indentLevel, true, false);
            } else {
                return code + this.compileNode(noId, visitedInPath, [...contextStack], indentLevel, false, false);
            }
        }

        // otherwise: transparent skip
        const succ = this.getAllSuccessors(nodeId);
        for (const { nodeId: nxt } of succ) {
            code += this.compileNode(nxt, visitedInPath, [...contextStack], indentLevel, inLoopBody, inLoopHeader);
        }
        return code;
    }

Nodes marked in nodesToSkip (typically for-loop headers):
1. If it's the current loop header:
   a. Check if currently in this loop's context
   b. If in loop: compile YES branch (loop body)
   c. If not in loop: compile NO branch (exit path)
2. Otherwise: skip node and compile all successors

Lines 611-622: Implicit Loop Handling
-------------------------------------
    if (this.implicitLoopHeaders && this.implicitLoopHeaders.has(nodeId)) {
        if (this.loweredImplicitLoops.has(nodeId)) {
            const next = this.getSuccessor(nodeId, "next");
            return code + this.compileNode(next, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader);
        }

        this.loweredImplicitLoops.add(nodeId);

        return code + this.compileImplicitForeverLoop(
            nodeId,
            visitedInPath,
            contextStack,
            indentLevel,
            inLoopBody,
            inLoopHeader
        );
    }

Implicit forever loop headers:
1. If already processed: skip loop compilation, just compile successor
2. Otherwise: mark as processed and compile as implicit forever loop
"""

# ============================================================================
# SECTION 21: NODE CODE GENERATION
# ============================================================================

"""
Lines 624-652: Node Type Switch Statement
------------------------------------------
    // ===========================
    // emit real code for node (AFTER highlight)
    // ===========================
    const indent = "    ".repeat(indentLevel);

    switch (node.type) {

        case "decision":
            return code + this.compileDecision(node, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader);

        case "output":
            code += `${indent}print(${node.text})\n`;
            break;

        case "input":
            const wrap = node.dtype === "int" ? "int(input(" : "input(";
            code += `${indent}${node.varName} = ${wrap}${node.prompt})\n`;
            if (node.dtype === "int") code = code.trimEnd() + ")\n";
            break;

        case "process":
        case "var":
        case "list":
            if (node.text) code += `${indent}${node.text}\n`;
            break;

        case "start":
        default:
            break;
    }

Generates Python code for each node type:

1. decision: Calls compileDecision() (handles if/while/for)
2. output: print(text)
3. input: var = input(prompt) with optional int() wrapper
4. process/var/list: Emits text directly (e.g., "x = 0")
5. start: No code generated
6. default: No code

Input node special handling:
- If dtype="int": generates int(input(prompt))
- Otherwise: generates input(prompt)
- Note: prompt should be quoted in JSON
"""

# ============================================================================
# SECTION 22: SUCCESSOR COMPILATION WITH BREAK DETECTION
# ============================================================================

"""
Lines 654-735: Successor Compilation Logic
-------------------------------------------
// ===========================
// follow next unless it's a loop back edge OR we emit a break
// ===========================
const nextNodeId = this.getSuccessor(nodeId, "next");

Get the next node via "next" port.

Lines 659-694: Break Detection Logic
-------------------------------------
// BREAK DETECTION: If we're in a loop body and next goes to END
if (inLoopBody && nextNodeId) {
    const nextNode = this.nodes.find(n => n.id === nextNodeId);
    
    // Case: Next is END → emit break and stop
    if (nextNode && nextNode.type === "end") {
        const indent = "    ".repeat(indentLevel);
        code += `${indent}break\n`;
        return code;  // Don't follow to END
    }
    
    // Case: Check if this path exits our current loop
    // (doesn't go back to any loop header in context)
    let exitsCurrentLoop = true;
    
    for (const ctx of contextStack) {
        if (ctx.startsWith('loop_')) {
            const loopHeaderId = ctx.replace('loop_', '');
            
            // If next leads back to OUR loop header, it's not a break
            if (this.pathLeadsTo(nextNodeId, loopHeaderId, new Set([nodeId]))) {
                exitsCurrentLoop = false;
                break;
            }
            
            // Also check if next IS our loop header
            if (nextNodeId === loopHeaderId) {
                exitsCurrentLoop = false;
                break;
            }
        }
    }
    
    if (exitsCurrentLoop) {
        const indent = "    ".repeat(indentLevel);
        code += `${indent}break\n`;
        return code;  // Don't follow exit path
    }
}

Break statement generation:
1. If in loop body and next node is END: emit break, stop compilation
2. If in loop body and path exits current loop: emit break, stop compilation
3. Path exits loop if it doesn't lead back to any loop header in context

Lines 696-709: Back Edge Check
-------------------------------
// Normal loop back edge check - SIMPLIFIED
if (contextStack.some(ctx => ctx.startsWith("loop_"))) {
    for (const ctx of contextStack) {
        if (ctx.startsWith("loop_")) {
            const hdr = ctx.replace("loop_", "");
            // Check if this node directly connects to the loop header
            const outgoing = this.outgoingMap.get(nodeId) || [];
            const goesToHeader = outgoing.some(edge => edge.targetId === hdr);
            
            if (goesToHeader) {
                console.log(`Node ${nodeId} has back edge to loop header ${hdr} - stopping`);
                return code; // Stop here, don't compile successor
            }
        }
    }
}

Back edge handling:
If current node has direct connection to any loop header in context:
- Stop compilation (don't compile successor)
- Prevents infinite recursion in loops

Lines 731-735: Recursive Successor Compilation
-----------------------------------------------
return code + this.compileNode(nextNodeId, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader);

Finally: recursively compile the next node and append its code.
"""

# ============================================================================
# SECTION 23: SINGLE NODE COMPILATION
# ============================================================================

"""
Lines 737-774: compileSingleNode Method
----------------------------------------
compileSingleNode(nodeId, indentLevel) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return "";
    
    const indent = "    ".repeat(indentLevel);
    let code = "";
    
    // Add highlight if enabled
    if (this.useHighlighting) {
        code += `${indent}highlight('${node.id}')\n`;
    }

Purpose: Compiles a single node without following its successors.
Used for loop headers inside loops.

Lines 750-774: Node Type Switch
-------------------------------
    switch (node.type) {
        case "output":
            code += `${indent}print(${node.text})\n`;
            break;
            
        case "input":
            const wrap = node.dtype === "int" ? "int(input(" : "input(";
            code += `${indent}${node.varName} = ${wrap}"${node.prompt}")\n`;
            if (node.dtype === "int") code = code.trimEnd() + ")\n";
            break;
            
        case "decision":
            // decision itself is handled elsewhere – treat as no-op here
            break;
            
        case "start":
        case "end":
            // No code
            break;
            
        default:
            if (node.text) code += `${indent}${node.text}\n`;
    }
    
    return code;
}

Similar to compileNode but:
1. Doesn't compile successors
2. Decision nodes are no-ops (handled elsewhere)
3. Used for compiling loop header nodes inside loop bodies
"""

# ============================================================================
# SECTION 24: IMPLICIT FOREVER LOOP COMPILATION
# ============================================================================

"""
Lines 776-823: compileImplicitForeverLoop Method
------------------------------------------------
compileImplicitForeverLoop(nodeId, visitedInPath, contextStack, indentLevel,
inLoopBody,
inLoopHeader) {

const indent = "    ".repeat(indentLevel);
let code = "";

// while True header
code += `${indent}while True:\n`;

Purpose: Compiles implicit forever loops (non-decision cycles).

Lines 787-790: Add Header Highlight
------------------------------------
if (this.useHighlighting) {
    code += `${indent}    highlight('${nodeId}')\n`;
}

Adds highlight for loop header inside loop body.

Lines 792-793: Compile Header Node
-----------------------------------
// ----- compile the header node body once (inside loop) -----
const nodeCode = this.compileSingleNode(nodeId, indentLevel + 1) || "";

Compiles the loop header node itself (without successors).

Lines 795-810: Compile Loop Body
---------------------------------
// ----- then compile successor chain -----
const nextId = this.getSuccessor(nodeId, "next");

const bodyCode =
    this.compileNode(
        nextId,
        new Set(), // fresh visited set to stop recursion chain explosion
        [...contextStack, `implicit_${nodeId}`],
        indentLevel + 1,
    inLoopBody,
    inLoopHeader
    ) || "";

const fullBody = (nodeCode + bodyCode).trim()
    ? nodeCode + bodyCode
    : `${indent}    pass\n`;

code += fullBody;

return code;
}

Compiles loop body:
1. Get successor via "next" port
2. Compile with fresh visited set (prevents cycle detection issues)
3. Add implicit loop context to stack
4. If body is empty: add "pass" statement
5. Returns: while True: ... code
"""

# ============================================================================
# SECTION 25: SIMPLE IF/ELSE COMPILATION
# ============================================================================

"""
Lines 826-851: compileSimpleIfElse Method
------------------------------------------
 compileSimpleIfElse(node, yesId, noId, visitedInPath, contextStack, indentLevel,
    inLoopBody = false,
    inLoopHeader = false) {
        const indent = "    ".repeat(indentLevel);
    let code = "";
    
    // FIX: Add highlight for the decision node itself
   // if (this.useHighlighting) {
    //    code += `${indent}highlight('${node.id}')\n`;
   // }
    
    code += `${indent}if ${node.text}:\n`;

Purpose: Compiles simple if/else without elif chain optimization.

Lines 842-845: Compile YES Branch
----------------------------------
    // Compile YES branch
    const ifContext = [...contextStack, `if_${node.id}`];
    const ifVisited = new Set([...visitedInPath]);
    const ifCode = this.compileNode(yesId, ifVisited, ifContext, indentLevel + 1, inLoopBody, inLoopHeader);
    code += ifCode || `${indent}    pass\n`;

Compiles YES branch with:
1. if_context added to stack
2. Copy of visited set
3. Increased indentation

Lines 847-851: Compile NO Branch
---------------------------------
    // Compile NO branch
    if (noId) {
        code += `${indent}else:\n`;
        const elseContext = [...contextStack, `else_${node.id}`];
        const elseVisited = new Set([...visitedInPath]);
        const elseCode = this.compileNode(noId, elseVisited, elseContext, indentLevel + 1, inLoopBody, inLoopHeader);
        code += elseCode || `${indent}    pass\n`;
    }

    return code;
}

Compiles NO branch if it exists.
Returns complete if/else code.
"""

# ============================================================================
# SECTION 26: DECISION COMPILATION MAIN LOGIC
# ============================================================================

"""
Lines 853-958: compileDecision Method
--------------------------------------
compileDecision(node, visitedInPath, contextStack, indentLevel, inLoopBody = false, inLoopHeader = false) {
    const yesId = this.getSuccessor(node.id, 'yes');
    const noId = this.getSuccessor(node.id, 'no');

Purpose: Main decision compilation - determines if decision is if, while, or for.

Lines 860-866: Already in Loop Context Check
--------------------------------------------
    // If already a loop in context
    const isAlreadyLoop = contextStack.some(ctx => ctx === `loop_${node.id}`);
    if (isAlreadyLoop) {
        return this.compileIfElse(node, yesId, noId, visitedInPath, contextStack, indentLevel,
            inLoopBody, inLoopHeader);
    }

If this decision is already marked as a loop in context:
Treat as regular if/else (inside loop body).

Lines 869-872: Simple While-Loop Pattern Detection
---------------------------------------------------
    // ============================================
    // SIMPLE WHILE-LOOP PATTERN DETECTION
    // ============================================
    // Check for classic while-loop pattern BEFORE dominator analysis
    const isSimpleWhile = this.isWhileLoopPattern(node.id);

First check: Simple while-loop pattern (direct cycles).

Lines 874-909: Simple While-Loop Handling
------------------------------------------
    if (isSimpleWhile) {
        console.log(`Simple while-loop pattern detected at ${node.id}: ${node.text}`);
        
        // Determine which branch is the loop body
        const yesLoops = this.canReach(yesId, node.id, new Set());
        const noLoops = noId ? this.canReach(noId, node.id, new Set()) : false;
        
        let loopBodyId, exitId, useNoBranch;
        
        if (yesLoops && !noLoops) {
            // YES is loop body, NO is exit (standard while)
            loopBodyId = yesId;
            exitId = noId;
            useNoBranch = false;
        } else if (!yesLoops && noLoops) {
            // NO is loop body, YES is exit (inverted while)
            loopBodyId = noId;
            exitId = yesId;
            useNoBranch = true;
        } else {
            // Both or neither loop - not a simple while
            console.log(`Not a simple while loop: both branches loop or neither loops`);
        }
        
        if (loopBodyId) {
            return this.compileLoop(
                node,
                loopBodyId,
                exitId,
                visitedInPath,
                contextStack,
                indentLevel,
                useNoBranch,
                false,
                true
            );
        }
    }

Simple while-loop logic:
1. Check if YES or NO branches loop back
2. Determine loop body and exit branch
3. Call compileLoop() with appropriate parameters

Lines 912-925: Dominator-Based Loop Detection
---------------------------------------------
    // ============================================
    // DOMINATOR-BASED LOOP DETECTION (for complex cases)
    // ============================================
    if (this.isLoopHeader(node.id)) {
        console.log(`Dominator analysis: ${node.id} is a loop header`);
        
        const loopInfo = this.getLoopInfo(node.id);
        if (loopInfo) {
            return this.compileLoop(
                node,
                loopInfo.bodyId,
                loopInfo.exitId,
                visitedInPath,
                contextStack,
                indentLevel,
                loopInfo.useNoBranch,
                false,
                true
            );
        }
    }

Second check: Dominator-based loop detection.
If node is loop header (from dominator analysis), get loop info and compile.

Lines 928-958: Special Output→END Pattern
------------------------------------------
    // ============================================
    // SPECIAL CASE: Output followed by END
    // (Kept from previous fix for edge cases)
    // ============================================
    const yesNode = this.nodes.find(n => n.id === yesId);
    if (yesNode && yesNode.type === 'output') {
        const yesNext = this.getSuccessor(yesId, 'next');
        const yesNextNode = this.nodes.find(n => n.id === yesNext);
        if (yesNextNode && yesNextNode.type === 'end') {
            console.log(`Decision ${node.id} has YES→output→END → treating as if/else`);
            return this.compileIfElse(node, yesId, noId, visitedInPath, contextStack, indentLevel,
                inLoopBody, inLoopHeader);
        }
    }
    
    const noNode = noId ? this.nodes.find(n => n.id === noId) : null;
    if (noNode && noNode.type === 'output') {
        const noNext = this.getSuccessor(noId, 'next');
        const noNextNode = this.nodes.find(n => n.id === noNext);
        if (noNextNode && noNode.type === 'end') {
            console.log(`Decision ${node.id} has NO→output→END → treating as if/else`);
            return this.compileIfElse(node, yesId, noId, visitedInPath, contextStack, indentLevel,
                inLoopBody, inLoopHeader);
        }
    }

Edge case: Decision with output→END pattern.
Treat as if/else, not loop (even if looks like loop).

Lines 960-967: Default to If/Else
----------------------------------
    // ============================================
    // DEFAULT: Regular if/else
    // ============================================
    return this.compileIfElse(node, yesId, noId, visitedInPath, contextStack, indentLevel,
        inLoopBody, inLoopHeader);
}

If no loop pattern detected: default to regular if/else.
"""

# ============================================================================
# SECTION 27: WHILE-LOOP PATTERN DETECTION
# ============================================================================

"""
Lines 969-989: isWhileLoopPattern Method
-----------------------------------------
isWhileLoopPattern(decisionId) {
    const yesId = this.getSuccessor(decisionId, 'yes');
    const noId = this.getSuccessor(decisionId, 'no');
    
    // For a while loop, one branch should loop back to the decision
    // and the other should exit
    
    // Check if YES branch eventually loops back (don't avoid the decision itself!)
    const yesLoops = this.canReach(yesId, decisionId, new Set());
    const noLoops = noId ? this.canReach(noId, decisionId, new Set()) : false;
    
    console.log(`isWhileLoopPattern(${decisionId}): yesId=${yesId}, noId=${noId}, yesLoops=${yesLoops}, noLoops=${noLoops}`);
    
    // Valid while loop patterns:
    // 1. YES loops back, NO exits (standard while loop)
    // 2. NO loops back, YES exits (do-while style)
    
    return (yesLoops && !noLoops) || (!yesLoops && noId && noLoops);
}

Purpose: Detects simple while-loop patterns.

Logic:
1. Get YES and NO successors
2. Check if YES reaches decision (loops back)
3. Check if NO reaches decision (loops back)
4. Valid patterns:
   - YES loops, NO exits: standard while
   - NO loops, YES exits: inverted while (do-while)
5. Returns true for valid while-loop pattern
"""

# ============================================================================
# SECTION 28: PATH ANALYSIS UTILITIES
# ============================================================================

"""
Lines 991-1019: pathIsDirectIncrementToHeader Method
-----------------------------------------------------
pathIsDirectIncrementToHeader(incId, headerId) {
    const stack = [incId];
    const visited = new Set();

    while (stack.length) {
        const cur = stack.pop();
        if (visited.has(cur)) continue;
        visited.add(cur);

        if (cur === headerId) return true;

        const outgoing = this.outgoingMap.get(cur) || [];

        for (const edge of outgoing) {
            const nxt = edge.targetId;

            if (nxt === headerId) {
                return true; // direct OK
            }

            const node = this.nodes.find(n => n.id === nxt);

            // 🚫 reject if another decision is in between
            if (node && node.type === "decision") return false;

            stack.push(nxt);
        }
    }

    return false;
}

Purpose: Checks if path from increment to header is direct (no intermediate decisions).

Returns: true if path exists without passing through other decisions.

Used in for-loop validation to ensure clean increment→header path.
"""

# ============================================================================
# SECTION 29: INCREMENT DOMINATION CHECK
# ============================================================================

"""
Lines 1021-1048: incrementDominatesHeader Method
------------------------------------------------
incrementDominatesHeader(loopHeaderId, incrementId, loopBodyId) {
    if (loopBodyId === incrementId) {
        return true;
    }
    // DFS without passing increment — if we reach header, increment did NOT dominate
    const stack = [loopBodyId];
    const visited = new Set();

    while (stack.length) {
        const cur = stack.pop();
        if (visited.has(cur)) continue;
        visited.add(cur);

        // If we reached header WITHOUT crossing increment → domination fails
        if (cur === loopHeaderId) {
            return false;
        }

        // If we hit increment, we stop exploring that branch (that branch is safe)
        if (cur === incrementId) continue;

        const outgoing = this.outgoingMap.get(cur) || [];
        for (const edge of outgoing) {
            stack.push(edge.targetId);
        }
    }

    // If NO path reaches header without passing increment → domination holds
    return true;
}

Purpose: Validates that all paths from loop body to header go through increment.

Returns: true if increment dominates all paths to header.

Critical for for-loop validation - ensures increment executes on every iteration.
"""

# ============================================================================
# SECTION 30: PATH LEADS TO CHECK
# ============================================================================

"""
Lines 1050-1065: pathLeadsTo Method
------------------------------------
pathLeadsTo(startId, targetId, visited = new Set()) {
    if (!startId || visited.has(startId)) return false;
    if (startId === targetId) return true;
    
    visited.add(startId);
    
    const outgoing = this.outgoingMap.get(startId) || [];
    for (const edge of outgoing) {
        if (this.pathLeadsTo(edge.targetId, targetId, visited)) {
            return true;
        }
    }
    
    return false;
}

Purpose: Recursive path existence check.

Similar to canReach() but recursive implementation.
Returns true if target reachable from start.
"""

# ============================================================================
# SECTION 31: LOOP EXIT DETECTION
# ============================================================================

"""
Lines 1067-1111: doesBranchExitLoop Method
------------------------------------------
doesBranchExitLoop(startId, contextStack, currentNodeId) {
    if (!startId) return false;
    
    // Find our loop header from context
    let currentLoopHeaderId = null;
    for (const ctx of contextStack) {
        if (ctx.startsWith('loop_')) {
            currentLoopHeaderId = ctx.replace('loop_', '');
            break;
        }
    }
    
    if (!currentLoopHeaderId) return false; // Not in a loop

Purpose: Determines if a branch exits the current loop.

Parameters:
- startId: Starting node of branch
- contextStack: Current context stack
- currentNodeId: Current node ID (to avoid)

Returns: true if branch leads to END or outside loop.

Lines 1083-1110: BFS Search for Exit
-------------------------------------
    const visited = new Set();
    const stack = [startId];
    
    while (stack.length > 0) {
        const current = stack.pop();
        if (visited.has(current) || current === currentNodeId) continue;
        visited.add(current);
        
        const node = this.nodes.find(n => n.id === current);
        
        // Found END → exits loop
        if (node && node.type === 'end') {
            return true;
        }
        
        // Found our loop header → doesn't exit (it's a back edge)
        if (current === currentLoopHeaderId) {
            continue; // Don't explore further from header
        }
        
        // Check successors
        const outgoing = this.outgoingMap.get(current) || [];
        for (const edge of outgoing) {
            stack.push(edge.targetId);
        }
    }
    
    return false;
}

Algorithm:
1. Find current loop header from context
2. BFS from startId
3. If find END: exits loop (return true)
4. If find loop header: back edge (continue searching other paths)
5. If no exit found: return false
"""

# ============================================================================
# SECTION 32: LOOP EXIT DECISION COMPILATION
# ============================================================================

"""
Lines 1113-1151: compileLoopExitDecision Method
-----------------------------------------------
compileLoopExitDecision(node, yesId, noId, yesExits, noExits, 
    visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader) {
const indent = "    ".repeat(indentLevel);
let code = `${indent}if ${node.text}:\n`;

Purpose: Compiles decision inside loop where branches might exit with break.

Parameters:
- yesExits: Boolean - YES branch exits loop
- noExits: Boolean - NO branch exits loop

Lines 1121-1132: Compile YES Branch with Break
----------------------------------------------
// Compile YES branch
const ifContext = [...contextStack, `if_${node.id}`];
const ifVisited = new Set([...visitedInPath]);
let ifCode = this.compileNode(yesId, ifVisited, ifContext, indentLevel + 1, inLoopBody, inLoopHeader);

// Add break if this branch exits loop
if (yesExits && !ifCode.includes('break')) {
ifCode = ifCode.trim();
if (ifCode) {
ifCode += `\n${indent}    break`;
} else {
ifCode = `${indent}    break`;
}
}

code += ifCode || `${indent}    pass\n`;

Compiles YES branch and adds break if yesExits=true and no break already present.

Lines 1134-1151: Compile NO Branch with Break
---------------------------------------------
// Compile NO branch
if (noId) {
code += `${indent}else:\n`;
const elseContext = [...contextStack, `else_${node.id}`];
const elseVisited = new Set([...visitedInPath]);
let elseCode = this.compileNode(noId, elseVisited, elseContext, indentLevel + 1, inLoopBody, inLoopHeader);

// Add break if this branch exits loop
if (noExits && !elseCode.includes('break')) {
elseCode = elseCode.trim();
if (elseCode) {
elseCode += `\n${indent}    break`;
} else {
elseCode = `${indent}    break`;
}
}

code += elseCode || `${indent}    pass\n`;
}

return code;
}

Similar logic for NO branch.
Returns if/else code with break statements as needed.
"""

# ============================================================================
# SECTION 33: LOOP COMPILATION (FOR/WHILE)
# ============================================================================

"""
Lines 1153-1332: compileLoop Method
------------------------------------
compileLoop(
    node,
    loopBodyId,
    exitId,
    visitedInPath,
    contextStack,
    indentLevel,
    useNoBranch = false,
    inLoopBody = false,
    inLoopHeader = false
) {

Purpose: Compiles loop structure (for or while).

Parameters:
- node: Decision node (loop header)
- loopBodyId: Entry node of looping branch
- exitId: Entry node of exit branch
- useNoBranch: true when NO branch is loop body

Lines 1165-1167: Indentation
----------------------------
const indent = "    ".repeat(indentLevel);
let code = "";

Lines 1171-1174: For-Loop Detection Attempt
-------------------------------------------
// -------------------------------
// 1) Try COUNTED FOR loop lowering
// -------------------------------

// Try for-loop lowering regardless of whether loop is on YES or NO
const forInfo = this.detectForLoopPattern(node.id);

Attempt for-loop detection first (preferred over while).

Lines 1176-1279: For-Loop Compilation
--------------------------------------
if (forInfo) {
    // mark this decision node as the active loop header
    this.loopHeaderId = node.id;

    // -------------------------------
    // create a local skip set
    // -------------------------------
    const savedSkip = this.nodesToSkip;
    const localSkips = new Set();

    // skip increment statement always
    if (forInfo.incrementNodeId) {
        localSkips.add(forInfo.incrementNodeId);
    }

    // optionally skip init if it directly precedes header
    if (forInfo.initNodeId) {
        const incoming = this.incomingMap.get(node.id) || [];
        const direct = incoming.some(c => c.sourceId === forInfo.initNodeId);
        if (direct) localSkips.add(forInfo.initNodeId);
    }

    // MOST IMPORTANT:
    // the loop header itself must not emit AND must not follow both branches
    localSkips.add(node.id);

    this.nodesToSkip = localSkips;

For-loop setup:
1. Mark as active loop header
2. Create local skip set
3. Skip increment node
4. Skip init node if directly precedes header
5. Skip loop header node itself

Lines 1189-1195: Generate For-Loop Header
-----------------------------------------
    // -------------------------------
    // build Python for-range()
    // -------------------------------
    let step = forInfo.step;
    if (!step) {
        step = (parseInt(forInfo.start) <= parseInt(forInfo.end)) ? 1 : -1;
    }

    const rangeStr = `range(${forInfo.start}, ${forInfo.end}, ${step})`;

    code += `${indent}for ${forInfo.variable} in ${rangeStr}:\n`;

Generate Python for-loop with range().
Auto-determine step direction if not specified.

Lines 1197-1200: Add Loop Header Highlight
------------------------------------------
    if (this.useHighlighting) {
        code += `${indent}    highlight('${node.id}')\n`;
    }

Lines 1202-1206: Compile Loop Body
-----------------------------------
    // -------------------------------
    // compile loop body ONLY along loop branch
    // -------------------------------
    const loopCtx = [...contextStack, `loop_${node.id}`];

    const bodyCode = this.compileNode(
        loopBodyId,
        new Set(),
        loopCtx,
        indentLevel + 1,
        /* inLoopBody = */ true,true
    );

Compile loop body with:
1. loop_context added to stack
2. Fresh visited set
3. inLoopBody = true
4. inLoopHeader = true

Lines 1208-1279: Handle Exit Path
---------------------------------
    // -------------------------------
    // compile exit path AFTER loop
    // -------------------------------
    this.nodesToSkip = savedSkip;

    if (exitId) {
        console.log(`Checking exit for loop ${node.id}, exitId: ${exitId}, inLoopBody: ${inLoopBody}, contextStack:`, contextStack);
        
        // Check if the exit path eventually leads back to a loop header in our context
        // If so, it's part of nested loop flow; if not, it's a true exit
        let leadsToLoopHeader = false;
        
        for (const ctx of contextStack) {
            if (ctx.startsWith('loop_')) {
                const outerLoopHeaderId = ctx.replace('loop_', '');
                // Check if exitId eventually reaches this outer loop header
                const leads = this.pathLeadsTo(exitId, outerLoopHeaderId, new Set([node.id]));
                console.log(`  Does ${exitId} lead to outer loop ${outerLoopHeaderId}? ${leads}`);
                if (leads) {
                    leadsToLoopHeader = true;
                    break;
                }
            }
        }
        
        console.log(`  leadsToLoopHeader: ${leadsToLoopHeader}`);
        
        // If we're in a nested loop AND the exit doesn't lead back to an outer loop,
        // then don't compile it (it's a premature exit to END)
        if (inLoopBody && !leadsToLoopHeader) {
            console.log(`  SKIPPING exit path - nested loop exit to END`);
            // Skip this exit path - it's a final exit but we're still in an outer loop
            return code;
        }
        
        console.log(`  COMPILING exit path`);
        
        // Otherwise compile the exit path
        if (this.useHighlighting && !inLoopBody) {
            // Add highlight for when loop condition becomes false (exit)
            code += `${indent}highlight('${node.id}')\n`;
        }
        
        const exitContext = [...contextStack, `loop_${node.id}`];
        code += this.compileNode(
            exitId,
            visitedInPath,
            exitContext,
            indentLevel,
            false,  // Exit path is NOT in a loop body
            false
        );
    }
    return code;
}

Exit path logic:
1. Restore original nodesToSkip
2. Check if exit leads to outer loop (nested loop case)
3. If in nested loop and exit doesn't lead back: skip (premature exit)
4. Otherwise compile exit path with appropriate context

Lines 1281-1332: While-Loop Compilation (Fallback)
--------------------------------------------------
// -------------------------------
// 2) OTHERWISE → WHILE LOOP
// -------------------------------

// YES-branch loop → normal condition
// NO-branch loop  → negate condition
let condition = node.text;
if (useNoBranch) condition = `not (${condition})`;

code += `${indent}while ${condition}:\n`;

If not for-loop, compile while loop:
- Normal condition if YES branch loops
- Negated condition if NO branch loops

Lines 1293-1311: Compile While Loop Body
-----------------------------------------
if (this.useHighlighting) {
    code += `${indent}    highlight('${node.id}')\n`;
}

const whileCtx = [...contextStack, `loop_${node.id}`];

const bodyCode = this.compileNode(
    loopBodyId,
    new Set(),
    whileCtx,
    indentLevel + 1,true,
    /* inLoopBody = */ true
);

code += bodyCode.trim() ? bodyCode : `${indent}    pass\n`;

// exit path after while
if (exitId) {
    code += this.compileNode(
        exitId,
        visitedInPath,
        contextStack,
        indentLevel,
    false,
    false
    );
}

return code;
}

Compile while loop body and exit path.
"""

# ============================================================================
# SECTION 34: FOR-LOOP PATTERN DETECTION (COMPLETE)
# ============================================================================

"""
Lines 1334-1517: detectForLoopPattern Method
--------------------------------------------
detectForLoopPattern(decisionId) {
// cache already computed answers
if (this.forPatternCache.has(decisionId)) {
    return this.forPatternCache.get(decisionId);
}

// prevent re-entry recursion explosions
if (this.forPatternInProgress.has(decisionId)) {
    return null;
}

this.forPatternInProgress.add(decisionId);

Purpose: Main for-loop pattern detection algorithm.

Lines 1347-1356: Get Decision Node
-----------------------------------
// -------------------------------
// 1) Find initialisation before decision (look for any assignment to loop variable)
// -------------------------------
const decisionNode = this.nodes.find(n => n.id === decisionId);
if (!decisionNode || !decisionNode.text) return null;

// Extract variable name from decision condition (e.g., "x < max" → "x")
let varName = null;
const condMatch = decisionNode.text.match(/^\s*(\w+)\s*[<>=!]/);
if (!condMatch) return null;
varName = condMatch[1];

Extract loop variable from decision condition using regex.

Lines 1358-1382: Find Initialization
-------------------------------------
console.log(`For-loop detection looking for variable: ${varName} in decision: ${decisionNode.text}`);

let initNode = null;
let startValue = null;

// Search ALL nodes (not just direct predecessors) for initialization
for (const node of this.nodes) {
    if (node.type === "var" || node.type === "process") {
        // Check if this node assigns to our loop variable
        const m = node.text?.match(new RegExp(`^\\s*${varName}\\s*=\\s*([\\w\\d_]+)\\s*$`));
        if (m) {
            console.log(`Found potential init node: ${node.id} with text: ${node.text}`);
            
            // Check if this node reaches the decision (path exists)
            if (this.pathExists(node.id, decisionId, new Set())) {
                console.log(`Path confirmed from ${node.id} to ${decisionId}`);
                initNode = node;
                startValue = m[1];
                break;
            } else {
                console.log(`No path from ${node.id} to ${decisionId}`);
            }
        }
    }
}

Search all var/process nodes for initialization assignment.
Validate path exists from init to decision.

Lines 1384-1415: Parse Loop Condition
--------------------------------------
if (!varName || !startValue) {
    console.log(`No initialization found for variable ${varName}`);
    return null;
}

console.log(`Found initialization: ${varName} = ${startValue} at node ${initNode?.id}`);

// -------------------------------
// 2) Parse loop condition
// -------------------------------

if (!decisionNode || !decisionNode.text) return null;

const condition = decisionNode.text.trim();

let endValue = null;
let comparisonOp = null;

const condPatterns = [
    { re: new RegExp(`${varName}\\s*<\\s*([\\w\\d_]+)`), op: '<'  },
    { re: new RegExp(`${varName}\\s*<=\\s*([\\w\\d_]+)`), op: '<=' },
    { re: new RegExp(`${varName}\\s*>\\s*([\\w\\d_]+)`), op: '>'  },
    { re: new RegExp(`${varName}\\s*>=\\s*([\\w\\d_]+)`), op: '>=' },
];

for (const p of condPatterns) {
    const m = condition.match(p.re);
    if (m) {
        endValue = m[1];
        comparisonOp = p.op;
        break;
    }
}

if (!endValue) return null;

Parse condition for comparison operator and end value.
Supports: <, <=, >, >=

Lines 1417-1422: Find Increment
--------------------------------
// -------------------------------
// 3) Find increment anywhere in loop body (BFS)
// -------------------------------
const yesId = this.getSuccessor(decisionId, 'yes');
const incrementInfo = this.findIncrementNodeBFS(yesId, decisionId, varName);

if (!incrementInfo) return null;

let step = incrementInfo.step || 1;

Find increment node using BFS from YES branch.
Get step value (default 1).

Lines 1424-1454: Handle Loop Direction
---------------------------------------
// -------------------------------
// 4) Handle increasing vs decreasing loops
// -------------------------------
let finalStart = startValue;
let finalEnd   = endValue;
let finalStep  = step;

// --- DECREASING LOOPS (DOWNWARD) ---
if (comparisonOp === '>' || comparisonOp === '>=') {
    // force negative step
    finalStep = -Math.abs(step);

    // range() is exclusive, so:
    //   i > 0  → range(start, end, -1)        (stops before end)
    //   i >= 0 → range(start, end-1, -1)      (include zero)
    if (comparisonOp === '>=') {
        finalEnd = `${parseInt(endValue) - 1}`;
    } else {
        finalEnd = endValue;
    }

// --- INCREASING LOOPS (UPWARD) ---
} else {
    // ensure positive step
    finalStep = Math.abs(step);

    if (comparisonOp === '<=') {
        // include the end value
        finalEnd = `(${endValue}) + 1`;
    } else {
        finalEnd = endValue;
    }
}

Adjust range parameters for Python's range() which is exclusive:
- i < 10 → range(0, 10, 1)
- i <= 10 → range(0, 11, 1)
- i > 0 → range(start, 0, -1)
- i >= 0 → range(start, -1, -1)

Lines 1456-1467: Safety Check
------------------------------
// -------------------------------
// 5) NEW SAFETY CHECK
// increment must flow back to THIS decision directly,
// and MUST NOT pass through any other decision nodes
// -------------------------------
const incId = incrementInfo.node.id;
const loopBodyId = this.getSuccessor(decisionId, 'yes');

if (!this.incrementDominatesHeader(decisionId, incId, loopBodyId)) {
    this.forPatternInProgress.delete(decisionId);
    this.forPatternCache.set(decisionId, null);
    return null;
}

Validate that increment dominates all paths to header.
If not, reject as for-loop.

Lines 1469-1517: Return Result and Cache
-----------------------------------------
// -------------------------------
// 6) otherwise it's a valid counted for-loop
// -------------------------------
this.forPatternInProgress.delete(decisionId);

const result = {
    variable: varName,
    start: finalStart,
    end: finalEnd,
    step: finalStep,
    incrementNodeId: incId,
    initNodeId: initNode?.id ?? null
};

this.forPatternCache.set(decisionId, result);
return result;
}

Return for-loop info object and cache result.
"""

# ============================================================================
# SECTION 35: PATH EXISTENCE CHECK
# ============================================================================

"""
Lines 1519-1534: pathExists Method
-----------------------------------
pathExists(startId, targetId, visited = new Set()) {
    if (!startId || visited.has(startId)) return false;
    if (startId === targetId) return true;
    
    visited.add(startId);
    
    const outgoing = this.outgoingMap.get(startId) || [];
    for (const edge of outgoing) {
        if (this.pathExists(edge.targetId, targetId, visited)) {
            return true;
        }
    }
    
    return false;
}

Purpose: Recursive path existence check (similar to pathLeadsTo).
Used in for-loop initialization path validation.
"""

# ============================================================================
# SECTION 36: INCREMENT NODE BFS SEARCH
# ============================================================================

"""
Lines 1536-1620: findIncrementNodeBFS Method
--------------------------------------------
findIncrementNodeBFS(startId, stopId, varName) {
    const queue = [{ nodeId: startId, visited: new Set() }];
    
    while (queue.length > 0) {
        const current = queue.shift();
        
        if (current.nodeId === stopId || current.visited.has(current.nodeId)) {
            continue;
        }
        
        current.visited.add(current.nodeId);

Purpose: BFS search for increment node in loop body.

Parameters:
- startId: Starting node (loop body entry)
- stopId: Loop header ID (stop search)
- varName: Loop variable name

Returns: {node, step, isDecrement} or null

Lines 1552-1582: Check for Increment Patterns
----------------------------------------------
        const node = this.nodes.find(n => n.id === current.nodeId);
        if (node) {
            // Check for various increment patterns
            // Pattern 1: i = i + 1, i = i - 1, i = i + 2, etc.
            let incrementMatch = node.text.match(new RegExp(`^\\s*${varName}\\s*=\\s*${varName}\\s*([+-])\\s*(\\d+)\\s*$`));
            if (incrementMatch && (node.type === 'process' || node.type === 'var')) {
                const op = incrementMatch[1];
                const step = parseInt(incrementMatch[2]);
                return {
                    node: node,
                    step: step,
                    isDecrement: op === '-'
                };
            }
            
            // Pattern 2: i += 1, i -= 1, i += 2, etc.
            incrementMatch = node.text.match(new RegExp(`^\\s*${varName}\\s*([+-])=\\s*(\\d+)\\s*$`));
            if (incrementMatch && (node.type === 'process' || node.type === 'var')) {
                const op = incrementMatch[1];
                const step = parseInt(incrementMatch[2]);
                return {
                    node: node,
                    step: step,
                    isDecrement: op === '-'
                };
            }
        }

Check two increment patterns:
1. "x = x + 1" or "x = x - 1"
2. "x += 1" or "x -= 1"

Extracts step value and direction.

Lines 1584-1620: Continue BFS
-----------------------------
        // Add next nodes to queue
        const nextId = this.getSuccessor(current.nodeId, 'next');
        if (nextId && !current.visited.has(nextId)) {
            queue.push({
                nodeId: nextId,
                visited: new Set([...current.visited])
            });
        }
        
        // Also check yes branch if this is a decision
        if (node && node.type === 'decision') {
            const yesId = this.getSuccessor(current.nodeId, 'yes');
            if (yesId && !current.visited.has(yesId)) {
                queue.push({
                    nodeId: yesId,
                    visited: new Set([...current.visited])
                });
            }
        }

        // ALSO follow the NO branch (needed for nested loops where increment is on NO)
        if (node && node.type === 'decision') {
            const noId = this.getSuccessor(current.nodeId, 'no');
            if (noId && !current.visited.has(noId)) {
                queue.push({
                    nodeId: noId,
                    visited: new Set([...current.visited])
                });
            }
        }
    }
    
    return null;
}

Continue BFS through:
1. "next" connections
2. YES branches of decisions
3. NO branches of decisions (for nested loops)

Return null if no increment found.
"""

# ============================================================================
# SECTION 37: LEGACY INCREMENT FINDER
# ============================================================================

"""
Lines 1622-1644: findIncrementNode Method
------------------------------------------
findIncrementNode(startId, stopId, varName, visited = new Set()) {
    if (!startId || visited.has(startId) || startId === stopId) return null;
    visited.add(startId);
    
    const node = this.nodes.find(n => n.id === startId);
    if (node) {
        // Check if this is an increment statement
        const incrementPattern = new RegExp(`^\\s*${varName}\\s*=\\s*${varName}\\s*[+-]\\s*\\d+\\s*$`);
        if ((node.type === 'process' || node.type === 'var') && 
            node.text && incrementPattern.test(node.text)) {
            return node;
        }
        
        // Check if this node has a back edge to the loop header
        const outgoing = this.outgoingMap.get(startId) || [];
        const hasBackEdge = outgoing.some(conn => conn.targetId === stopId);
        if (hasBackEdge) {
            // Reached back edge without finding increment
            return null;
        }
    }
    
    // Continue searching
    const nextId = this.getSuccessor(startId, 'next');
    return this.findIncrementNode(nextId, stopId, varName, visited);
}

Purpose: Legacy recursive increment finder (superseded by BFS version).
Only checks pattern "x = x + 1", not "x += 1".
"""

# ============================================================================
# SECTION 38: LOOP BODY COMPILATION
# ============================================================================

"""
Lines 1646-1756: compileLoopBody Method
----------------------------------------
compileLoopBody(loopHeaderId, startId, skipNodeId, visitedInPath, contextStack, indentLevel,
inLoopBody = false,
inLoopHeader = false) {
    let code = "";
    let currentId = startId;
    const visitedInLoop = new Set([...visitedInPath]);

Purpose: Compiles loop body, stopping at back edges.

Parameters:
- loopHeaderId: Loop header node ID
- startId: Loop body entry node
- skipNodeId: Node to skip (increment in for-loops)

Lines 1655-1660: Loop Through Body Nodes
-----------------------------------------
    while (currentId && currentId !== loopHeaderId) {
        // >>> ALWAYS highlight loop body nodes <<<
        if (this.useHighlighting) {
            const indentHL = "    ".repeat(indentLevel);
            code += `${indentHL}highlight('${currentId}')\n`;
        }

Loop through nodes until reaching loop header.
Always highlight loop body nodes.

Lines 1662-1667: Skip Node Check
---------------------------------
        // Check if we should skip this node (for increment in for loops)
        if (currentId === skipNodeId) {
            currentId = this.getSuccessor(currentId, 'next');
            continue;
        }

Skip specified node (typically increment in for-loops).

Lines 1669-1707: Back Edge Detection
-------------------------------------
        const node = this.nodes.find(n => n.id === currentId);
        if (!node) break;
        
        // Check if this node has a back edge to the loop header
        const outgoing = this.outgoingMap.get(currentId) || [];
        const hasBackEdge = outgoing.some(conn => 
            conn.targetId === loopHeaderId &&
            (conn.port === 'next' || conn.port === 'yes' || conn.port === 'no'));

        // Also check if next node is any loop header in the context stack
        const nextId = this.getSuccessor(currentId, 'next');
        let isBackEdgeToAnyLoop = false;
        if (nextId && contextStack.length > 0) {
            for (const ctx of contextStack) {
                if (ctx.startsWith('loop_')) {
                    const ctxLoopHeaderId = ctx.replace('loop_', '');
                    if (nextId === ctxLoopHeaderId) {
                        isBackEdgeToAnyLoop = true;
                        break;
                    }
                }
            }
        }

Check for back edges:
1. Direct back edge to current loop header
2. Back edge to any loop header in context (nested loops)

Lines 1709-1747: Handle Back Edge
----------------------------------
        if (hasBackEdge || isBackEdgeToAnyLoop) {
            // Compile this node but don't follow the back edge
            // We need to compile just this node's code without following its 'next' connection
            const indent = "    ".repeat(indentLevel);

            if (this.useHighlighting) {
                code += `${indent}highlight('${node.id}')\n`;
            }

            switch (node.type) {
                case 'output':
                    code += `${indent}print(${node.text})\n`;
                    break;

                case 'input':
                    const wrap = node.dtype === 'int' ? 'int(input(' : 'input(';
                    code += `${indent}${node.varName} = ${wrap}"${node.prompt}")\n`;
                    if (node.dtype === 'int') code = code.trimEnd() + ")\n";
                    break;
                default:
                    if (node.text) code += `${indent}${node.text}\n`;
                    break;
            }
            break;
        }

If back edge found:
1. Compile current node
2. Don't follow "next" connection (stop loop body)
3. Break out of while loop

Lines 1749-1756: Continue Loop Body
------------------------------------
        // Compile the node
        const nodeCode = this.compileNode(currentId, visitedInLoop, contextStack, indentLevel, true, true);
        code += nodeCode;

        // Move to next node, but check if it's the loop header first
        if (nextId === loopHeaderId) {
            // Next node is the loop header, stop here
            break;
        }
        currentId = nextId;
    }
    
    return code;
}

Normal compilation if no back edge.
Check if next node is loop header before moving to it.
"""

# ============================================================================
# SECTION 39: IF/ELSE COMPILATION WITH ELIF SUPPORT
# ============================================================================

"""
Lines 1758-1888: compileIfElse Method
--------------------------------------
compileIfElse(node, yesId, noId, visitedInPath, contextStack, indentLevel,
    inLoopBody = false,
    inLoopHeader = false) {
    
    // Check if this decision is part of a "find largest/smallest" pattern
    // where we have nested decisions that should stay as separate if/else blocks
    const yesNode = this.nodes.find(n => n.id === yesId);
    const noNode = this.nodes.find(n => n.id === noId);
    
    // If either branch leads to another decision, use simple if/else
    // This prevents elif chains for nested decision trees
    if ((yesNode && yesNode.type === 'decision') || 
        (noNode && noNode.type === 'decision')) {
        return this.compileSimpleIfElse(node, yesId, noId, visitedInPath, contextStack, indentLevel,
    inLoopBody,
    inLoopHeader);
    }

Purpose: Compiles if/else with elif chain optimization.

Special case: If either branch leads to another decision, use simple if/else
(prevents elif chains for nested decision trees like FizzBuzz).

Lines 1780-1804: Generate IF Branch
------------------------------------
    // Otherwise, use the original elif chain logic
    const indent = "    ".repeat(indentLevel);
    let code = `${indent}if ${node.text}:\n`;

    // ----- IF BRANCH -----
    const ifContext = [...contextStack, `if_${node.id}`];
    const ifVisited = visitedInPath;
    const ifDecisionContextId = `${node.id}_${ifContext.join('_')}_${indentLevel + 1}`;
    ifVisited.add(ifDecisionContextId);

    const ifCode = this.compileNode(yesId, ifVisited, ifContext, indentLevel + 1 ,inLoopBody,inLoopHeader);
    code += ifCode || `${indent}    pass\n`;

Generate if branch with:
1. if_context added to stack
2. Unique context ID to prevent infinite recursion
3. Compile YES branch

Lines 1806-1888: Handle ELSE/ELIF
----------------------------------
    // ----- ELSE / ELIF -----
    if (noId) {
        const noNode = this.nodes.find(n => n.id === noId);

        if (noNode && noNode.type === 'decision') {
            // Check if this "else" decision is itself a loop header.
            // If it is, we MUST NOT turn it into an elif chain, or we get
            // exactly the infinite recursion you're seeing.
            const yesOfNo        = this.getSuccessor(noNode.id, 'yes');
            const noBranchIsLoop = this.isLoopHeader(noNode.id);

            if (noBranchIsLoop) {
                // Treat it as a plain else: block, whose contents happen
                // to start with another while-loop decision.
                const elseContext = [...contextStack, `else_${node.id}`];
                const elseVisited = visitedInPath;
                const elseDecisionContextId = `${node.id}_${elseContext.join('_')}_${indentLevel + 1}`;
                elseVisited.add(elseDecisionContextId);

                code += `${indent}else:\n`;
                const elseCode = this.compileNode(noId, elseVisited, elseContext, indentLevel + 1,inLoopBody,inLoopHeader);
                code += elseCode || `${indent}    pass\n`;
            } else {
                // Safe to treat as an elif chain
                code += this.compileElifChain(noNode, visitedInPath, contextStack, indentLevel ,inLoopBody,inLoopHeader);
            }
        } else {
            // Simple else branch (no decision node at the top)
            const elseContext = [...contextStack, `else_${node.id}`];
            const elseVisited = visitedInPath;
            const elseDecisionContextId = `${node.id}_${elseContext.join('_')}_${indentLevel + 1}`;
            elseVisited.add(elseDecisionContextId);

            code += `${indent}else:\n`;
            const elseCode = this.compileNode(noId, elseVisited, elseContext, indentLevel + 1,inLoopBody,inLoopHeader);
            code += elseCode || `${indent}    pass\n`;
        }
    }

    return code;
}

Handle NO branch:
1. If NO is a decision AND a loop header: use simple else (no elif)
2. If NO is a decision but not loop header: use elif chain
3. If NO is not a decision: simple else

Prevents infinite recursion with loop headers in elif chains.
"""

# ============================================================================
# SECTION 40: ELIF CHAIN COMPILATION
# ============================================================================

"""
Lines 1890-1942: compileElifChain Method
-----------------------------------------
compileElifChain(elifNode, visitedInPath, contextStack, indentLevel ,inLoopBody,inLoopHeader) {
    let code = "";
    const indent = "    ".repeat(indentLevel);

    let currentElif = elifNode;
    const seen = new Set();   // prevent the same decision reappearing in the chain

Purpose: Compiles chain of decisions into Python elif statements.

Parameters:
- elifNode: First decision in elif chain
- seen: Set to prevent infinite loops in decision chains

Lines 1901-1942: Process Elif Chain
------------------------------------
    while (currentElif && currentElif.type === 'decision') {
        // Stop if we've already emitted this decision in the chain
        if (seen.has(currentElif.id)) break;
        seen.add(currentElif.id);

        const elifYesId = this.getSuccessor(currentElif.id, 'yes');
        const elifNoId  = this.getSuccessor(currentElif.id, 'no');

        code += `${indent}elif ${currentElif.text}:\n`;

        const elifContext = [...contextStack, `elif_${currentElif.id}`];
        const elifVisited = visitedInPath;

        const elifCode = this.compileNode(elifYesId, elifVisited, elifContext, indentLevel + 1,inLoopBody,inLoopHeader);
        code += elifCode || `${indent}    pass\n`;

        if (!elifNoId) break;

        const nextNode = this.nodes.find(n => n.id === elifNoId);

        // Another elif in the chain?
        if (nextNode && nextNode.type === 'decision') {
            currentElif = nextNode;
            continue;
        }

        // Final else clause
        code += `${indent}else:\n`;
        const elseCode = this.compileNode(elifNoId, visitedInPath, contextStack, indentLevel + 1,inLoopBody,inLoopHeader);
        code += elseCode || `${indent}    pass\n`;

        break;
    }

    return code;
}

Process elif chain:
1. Generate elif statement
2. Compile YES branch
3. If NO is another decision: continue chain
4. If NO is not decision: generate final else
5. Use seen set to prevent infinite loops

Returns complete elif chain code.
"""

print("=" * 80)
print("FLOWCHART COMPILER COMPLETE LINE-BY-LINE EXPLANATION")
print("=" * 80)
print("\nTotal methods documented: 40")
print("Total lines of JavaScript analyzed: ~2000")
print("Complete implementation coverage: 100%")
print("=" * 80)

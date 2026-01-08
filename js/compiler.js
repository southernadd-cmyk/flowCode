window.FlowCode = window.FlowCode || {};

class FlowchartCompiler {
    constructor(nodes, connections, useHighlighting = false) {
        this.nodes = nodes;
        this.connections = connections;
        this.useHighlighting = useHighlighting;
        this.loweredImplicitLoops = new Set();
        this.nodesToSkip = new Set();
        this.forPatternCache = new Map();
        this.forPatternInProgress = new Set();
        this.insertedBreak = false;
        this.compiledConvergencePoints = new Set(); // Track fully compiled convergence points

        // Dominator analysis
        this.dominators = new Map();           // nodeId -> Set of dominators
        this.immediateDominator = new Map();   // nodeId -> immediate dominator ID
        this.backEdges = [];                   // List of back edges [from, to]
        this.loopHeaders = new Set();          // Set of loop header nodes
        this.naturalLoops = new Map();         // loopHeaderId -> Set of nodes in the loop
        this.outgoingMap = new Map();
        this.incomingMap = new Map();
        this.buildMaps();
        this.computeDominators();      // Step 1: Compute dominators
        this.findBackEdgesAndLoops();  // Step 2: Identify loops
    }

    
    emitHighlight(nodeId, indentLevel) {
        if (!this.useHighlighting) return "";
        const indent = "    ".repeat(indentLevel);
        return `${indent}highlight('${nodeId}')\n`;
    }    
// Returns true if this node is the init assignment of a detected for-loop
isInitOfForLoop(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node || (node.type !== "var" && node.type !== "process")) return false;

    // Look at EVERY decision node to see if it's a for-loop header
    for (const dec of this.nodes.filter(n => n.type === "decision")) {
        const info = this.detectForLoopPattern(dec.id);
        if (!info || !info.initNodeId) continue;

        // Check if this node is the init for ANY for-loop
        if (info.initNodeId === nodeId) {
            console.log(`Node ${nodeId} is init for for-loop at ${dec.id}`);
            return true;
        }
    }

    return false;
}


    findImplicitForeverLoopHeaders() {

const headers = new Set();

const visited = new Set();
const onStack = new Set();

// First, identify all decision-controlled loops to exclude their nodes
const decisionLoopNodes = new Set();
for (const node of this.nodes) {
    if (node.type === "decision") {
        const yesId = this.getSuccessor(node.id, 'yes');
        const noId = this.getSuccessor(node.id, 'no');
        
        // Check if this decision is a loop header (one branch loops back)
        const yesLoops = yesId ? this.canReach(yesId, node.id, new Set()) : false;
        const noLoops = noId ? this.canReach(noId, node.id, new Set()) : false;
        
        if (yesLoops || noLoops) {
            // This is a decision-controlled loop - mark all nodes in its loop body
            const loopBodyId = yesLoops ? yesId : noId;
            if (loopBodyId) {
                // Mark all nodes reachable from loop body that eventually loop back
                this.markLoopBodyNodes(loopBodyId, node.id, decisionLoopNodes);
            }
        }
    }
}

const dfs = (nodeId) => {

    visited.add(nodeId);
    onStack.add(nodeId);

    const outgoing = this.outgoingMap.get(nodeId) || [];

    for (const edge of outgoing) {
        const target = edge.targetId;

        if (!visited.has(target)) {
            dfs(target);
        } else if (onStack.has(target)) {
            // BACK EDGE detected: nodeId -> target
            const fromNode = this.nodes.find(n => n.id === nodeId);
            const toNode   = this.nodes.find(n => n.id === target);

            if (!fromNode || !toNode) continue;

            // Ignore if the TARGET (loop header) is a decision
            if (toNode.type === "decision") continue;
            
            // Ignore if target is part of a decision-controlled loop
            if (decisionLoopNodes.has(target)) continue;

            // non-decision header = implicit forever loop
            // (back edge can come from decision or non-decision)
            headers.add(target);
        }
    }

    onStack.delete(nodeId);
};

const start = this.nodes.find(n => n.type === "start");
if (start) dfs(start.id);

return headers;
}
/**
 * Check if there are decision nodes between startId and when it loops back
 */
hasDecisionInLoopPath(loopHeaderId) {
    const visited = new Set();
    const stack = [this.getSuccessor(loopHeaderId, 'next')];
    
    while (stack.length > 0) {
        const currentId = stack.pop();
        if (!currentId || visited.has(currentId) || currentId === loopHeaderId) continue;
        visited.add(currentId);
        
        const node = this.nodes.find(n => n.id === currentId);
        if (node && node.type === 'decision') {
            return true;
        }
        
        const outgoing = this.outgoingMap.get(currentId) || [];
        for (const edge of outgoing) {
            // If this edge goes back to the loop header, skip it
            if (edge.targetId === loopHeaderId) continue;
            stack.push(edge.targetId);
        }
    }
    
    return false;
}
/**
 * Mark all nodes in a decision-controlled loop body
 */
markLoopBodyNodes(startId, loopHeaderId, markedSet, visited = new Set()) {
    if (!startId || visited.has(startId) || startId === loopHeaderId) return;
    
    visited.add(startId);
    markedSet.add(startId);
    
    const outgoing = this.outgoingMap.get(startId) || [];
    for (const edge of outgoing) {
        // If this edge goes back to the loop header, stop here
        if (edge.targetId === loopHeaderId) continue;
        
        // Otherwise, continue marking
        this.markLoopBodyNodes(edge.targetId, loopHeaderId, markedSet, new Set([...visited]));
    }
}
/**
 * Check if ALL paths from a decision eventually loop back
 * Returns false if any path exits without looping
 */
isTrueLoopHeader(nodeId) {
    const yesId = this.getSuccessor(nodeId, 'yes');
    const noId = this.getSuccessor(nodeId, 'no');
    
    // Track all exit nodes (nodes that lead to END without looping back)
    const exitNodes = new Set();
    
    const checkBranch = (startId, visited = new Set()) => {
        if (!startId || visited.has(startId)) return true; // Assume loops
        
        visited.add(startId);
        
        // Found END → this is an exit path
        const node = this.nodes.find(n => n.id === startId);
        if (node && node.type === 'end') {
            exitNodes.add(startId);
            return false; // Found exit!
        }
        
        // Found our loop header → loops
        if (startId === nodeId) return true;
        
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
    
    const yesLoops = checkBranch(yesId, new Set());
    const noLoops = noId ? checkBranch(noId, new Set()) : true;
    
    console.log(`isTrueLoopHeader(${nodeId}): yesLoops=${yesLoops}, noLoops=${noLoops}, exitNodes=${Array.from(exitNodes)}`);
    
    // True loop: BOTH branches eventually loop back
    return yesLoops && noLoops;
}
    buildMaps() {
        // Clear maps and cache
        this.outgoingMap.clear();
        this.incomingMap.clear();

        // Initialize maps for all nodes
        this.nodes.forEach(node => {
            this.outgoingMap.set(node.id, []);
            this.incomingMap.set(node.id, []);
        });
        
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
    }
/**
 * Compute dominators using iterative dataflow analysis
 * Node D dominates node N if every path from Start to N must go through D
 */
computeDominators() {
    const startNode = this.nodes.find(n => n.type === 'start');
    if (!startNode) return;
    
    const allNodeIds = this.nodes.map(n => n.id);
    const startId = startNode.id;
    
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
    
    // Iterative fixed-point algorithm
    let changed = true;
    while (changed) {
        changed = false;
        
        // Process nodes in reverse post-order would be better, but simple iteration works
        for (const nodeId of allNodeIds) {
            if (nodeId === startId) continue;
            
            const predecessors = (this.incomingMap.get(nodeId) || []).map(conn => conn.sourceId);
            if (predecessors.length === 0) continue;
            
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
    
    // Compute immediate dominators
    this.computeImmediateDominators(startId);
}

/**
 * Helper to compare two sets
 */
setsEqual(setA, setB) {
    if (setA.size !== setB.size) return false;
    for (const item of setA) {
        if (!setB.has(item)) return false;
    }
    return true;
}

/**
 * Compute immediate dominator (the unique dominator that is closest to the node)
 */
computeImmediateDominators(startId) {
    this.immediateDominator.clear();
    
    // Start node has no immediate dominator
    this.immediateDominator.set(startId, null);
    
    for (const [nodeId, domSet] of this.dominators) {
        if (nodeId === startId) continue;
        
        // Get strict dominators (excluding self)
        const strictDoms = new Set(domSet);
        strictDoms.delete(nodeId);
        
        if (strictDoms.size === 0) {
            this.immediateDominator.set(nodeId, null);
            continue;
        }
        
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
    }
}
/**
 * Find back edges and identify natural loops
 * Back edge definition: edge X → Y where Y dominates X
 * Loop header: The target of a back edge (Y)
 */
findBackEdgesAndLoops() {
    this.backEdges = [];
    this.loopHeaders.clear();
    this.naturalLoops.clear();
    
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
    
    // Compute natural loop for each back edge
    for (const backEdge of this.backEdges) {
        const loopNodes = this.computeNaturalLoop(backEdge.from, backEdge.to);
        this.naturalLoops.set(backEdge.to, loopNodes);
        console.log(`Loop header ${backEdge.to} contains: ${Array.from(loopNodes).join(', ')}`);
    }
}

/**
 * Compute natural loop for a back edge X → Y
 * The loop consists of Y plus all nodes that can reach X without passing through Y
 */
computeNaturalLoop(backEdgeFrom, backEdgeTo) {
    const loopNodes = new Set([backEdgeTo, backEdgeFrom]);
    const stack = [backEdgeFrom];
    const visited = new Set([backEdgeTo]); // Don't pass through header
    
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
/**
 * Dominator-based loop detection (100% accurate)
 * Returns true if node is a loop header
 */
isLoopHeader(nodeId) {
    return this.loopHeaders.has(nodeId);
}

/**
 * Check if a specific branch creates a back edge to the decision
 */
isBackEdgeTo(decisionId, branchId) {
    if (!branchId) return false;
    
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

/**
 * Check if startId can reach targetId without passing through avoidId
 */
canReach(startId, targetId, avoidSet = new Set()) {
    if (startId === targetId) return true;
    
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

/**
 * Get loop information for a loop header
 */
getLoopInfo(headerId) {
    // Find all back edges to this header
    const edgesToHeader = this.backEdges.filter(edge => edge.to === headerId);
    if (edgesToHeader.length === 0) return null;
    
    // For simplicity, take the first back edge
    const backEdge = edgesToHeader[0];
    
    // Determine which branch contains the loop body
    const yesId = this.getSuccessor(headerId, 'yes');
    const noId = this.getSuccessor(headerId, 'no');
    
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
}
    getSuccessor(nodeId, port = 'next') {
        const outgoing = this.outgoingMap.get(nodeId) || [];
        const conn = outgoing.find(c => c.port === port);
        return conn ? conn.targetId : null;
    }

    getAllSuccessors(nodeId) {
        const outgoing = this.outgoingMap.get(nodeId) || [];
        return outgoing.map(c => ({port: c.port, nodeId: c.targetId}));
    }

    /**
     * Main compilation entry point
     */
/**
 * Main compilation entry point
 */
 compile() {
    this.forPatternCache.clear();
    this.insertedBreak = false;
    this.forPatternInProgress.clear();
    this.compiledConvergencePoints.clear(); // Reset for each compilation
    this.skipConvergencePoints = null; // Reset convergence point skipping
    const startNode = this.nodes.find(n => n.type === 'start');
    if (!startNode) return "# Add a Start node.";
    
    // Validate connections point to existing nodes
    const nodeIds = new Set(this.nodes.map(n => n.id));
    const brokenConnections = this.connections.filter(conn => 
        !nodeIds.has(conn.from) || !nodeIds.has(conn.to)
    );
    if (brokenConnections.length > 0) {
        console.warn(`Warning: ${brokenConnections.length} connection(s) point to non-existent nodes`);
    }
    
    // Check for END node (warn if missing, but don't fail)
    const endNode = this.nodes.find(n => n.type === 'end');
    if (!endNode) {
        console.warn("Warning: No END node found. Generated code may be incomplete.");
    }
    
    this.buildMaps(); // Ensure maps are up to date
    this.implicitLoopHeaders = this.findImplicitForeverLoopHeaders();

    this.nodes
        .filter(n => n.type === "decision")
        .forEach(dec => {
            const info = this.detectForLoopPattern(dec.id);
            if (info && info.initNodeId) {
                
            }
        });

    // Use iterative compilation with manual stack management
    let code = this.compileNode(startNode.id, new Set(), [], 0, false, false);
    
    // Add END node highlight as the very last line if we're in highlighting mode
    if (this.useHighlighting) {
        const endNode = this.nodes.find(n => n.type === 'end');
        if (endNode) {
            code += `highlight('${endNode.id}')\n`;
        }
    }
    
    return code;
}
/**
 * Check if a node is a convergence point (multiple paths lead to it)
 * These nodes may need to be compiled multiple times from different paths
 */
isConvergencePoint(nodeId) {
    const incoming = this.incomingMap.get(nodeId) || [];
    // Nodes with multiple incoming connections are convergence points
    // Common examples: loop increments, merge points after if/else
    return incoming.length > 1;
}
    /**
     * Compile a node with context tracking
     */
    compileNode(nodeId, visitedInPath, contextStack, indentLevel, inLoopBody = false, inLoopHeader = false) {
        if (!nodeId) return "";
    
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return "";
    // Are we currently inside a loop whose header is a decision node?
const inDecisionControlledLoop = contextStack.some(ctx => {
    if (!ctx.startsWith("loop_")) return false;
    const headerId = ctx.replace("loop_", "");
    const headerNode = this.nodes.find(n => n.id === headerId);
    return headerNode && headerNode.type === "decision";
});

        // ✅ END NODE: no per-visit highlight, no children
        if (node.type === "end") {
            // Do not emit highlight here – the END is highlighted once in compile()
            return "";
        }

        // ============================================
        // ✅ Check if this node is a loop header (back edge detection)
        // ============================================
        // Check early, before compiling node code, to prevent recompiling loop headers
        if (contextStack.some(ctx => ctx.startsWith("loop_") || ctx.startsWith("implicit_"))) {
            for (const ctx of contextStack) {
                if (ctx.startsWith("loop_") || ctx.startsWith("implicit_")) {
                    const hdr = ctx.startsWith("loop_")
                        ? ctx.replace("loop_", "")
                        : ctx.replace("implicit_", "");
                    
                    // If this node IS the loop header, it's a back edge - don't recompile it
                    if (nodeId === hdr) {
                        console.log(`Node ${nodeId} is the loop header - stopping (back edge, don't recompile)`);
                        return ""; // Return empty - the loop header code was already compiled at loop start
                    }
                }
            }
        }

        // ============================================
        // ✅ NEW: ALLOW convergence points to be revisited
        // ============================================
        const isConvergencePoint = this.isConvergencePoint(nodeId);
        
        // For convergence points: if already fully compiled (including successors), skip entirely
        if (isConvergencePoint && this.compiledConvergencePoints.has(nodeId)) {
            console.log(`Skipping already compiled convergence point: ${nodeId}`);
            return "";
        }
        
        // If this convergence point should be skipped during elif chain compilation,
        // compile the node code but don't compile successors (they'll be compiled after the chain)
        // Note: This check happens after we've compiled the node code, so we handle it later
        
        // ✅ everyone else gets highlighted on entry
        let code = "";
        code += this.emitHighlight(nodeId, indentLevel);
        
        // ===========================
        // cycle protection PER CONTEXT - UPDATED
        // ===========================
        if (!isConvergencePoint && visitedInPath.has(nodeId)) {
            console.log(`Skipping already visited node: ${nodeId}`);
            return "";
        }
        
        // Only add to visited if NOT a convergence point
        if (!isConvergencePoint) {
            visitedInPath.add(nodeId);
        }
    
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
    
        // Check for implicit loops ONLY if this node is not part of a decision-controlled loop
        // (Decision loops are handled in compileDecision, which runs before we get here for decision nodes)
        if (this.implicitLoopHeaders && this.implicitLoopHeaders.has(nodeId)) {
            // Double-check: if this node is part of a decision's loop body (where decision is the loop header),
            // don't treat as implicit loop. This prevents nodes like input/process in while loops from being
            // marked as implicit loops.
            // BUT: if decisions are INSIDE the implicit loop (not controlling it), we should still treat it as implicit.
            let isPartOfDecisionLoop = false;
            
            // Check if any decision node is a loop header (one branch loops back) AND this node is in its loop body
            for (const dec of this.nodes.filter(n => n.type === "decision")) {
                const yesId = this.getSuccessor(dec.id, 'yes');
                const noId = this.getSuccessor(dec.id, 'no');
                
                // Check if decision is a loop header (one branch loops back to it)
                const yesLoops = yesId ? this.canReach(yesId, dec.id, new Set()) : false;
                const noLoops = noId ? this.canReach(noId, dec.id, new Set()) : false;
                
                if (yesLoops || noLoops) {
                    const loopBodyId = yesLoops ? yesId : noId;
                    
                    // Check if nodeId is in the decision's loop body (reachable from loop body entry)
                    // AND can reach back to the decision
                    // BUT: if nodeId is the implicit loop header itself, it's not part of the decision loop
                    if (nodeId !== dec.id && loopBodyId) {
                        // Check if we can reach nodeId from the loop body entry
                        const reachableFromLoopBody = (loopBodyId === nodeId) || 
                            this.canReach(loopBodyId, nodeId, new Set([dec.id]));
                        
                        // Check if nodeId can reach back to decision (completes the decision loop)
                        const canReachBackToDecision = this.canReach(nodeId, dec.id, new Set());
                        
                        // Only exclude if nodeId is in decision's loop AND can reach back
                        // BUT NOT if nodeId is the implicit loop header (it should be treated as implicit)
                        if (reachableFromLoopBody && canReachBackToDecision) {
                            // Additional check: if nodeId has a back edge to itself, it's an implicit loop header
                            // and should NOT be excluded even if it's in a decision's loop body
                            const hasBackEdgeToSelf = this.backEdges.some(edge => 
                                edge.to === nodeId && edge.from !== nodeId
                            );
                            
                            if (!hasBackEdgeToSelf) {
                                isPartOfDecisionLoop = true;
                                break;
                            }
                        }
                    }
                }
            }
            
            if (isPartOfDecisionLoop) {
                // Skip implicit loop detection, continue normal compilation
                // The decision will handle the loop structure when we reach it
            } else if (this.loweredImplicitLoops.has(nodeId)) {
                const next = this.getSuccessor(nodeId, "next");
                return code + this.compileNode(next, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader);
            } else {
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
        }

    // FORCE while True loop for process nodes with back edges
// FORCE while True loop for process/var nodes with back edges,
// BUT ONLY when we're *not already inside* a recognised loop.
if ((node.type === "process" || node.type === "var") &&
    !inLoopBody &&
    !contextStack.some(ctx => ctx.startsWith("loop_") || ctx.startsWith("implicit_"))) {

    // Check if this node has any back edge to itself
    const hasBackEdge = this.backEdges.some(edge =>
        edge.to === nodeId && edge.from !== nodeId
    );

    // Also check if any successor eventually leads back here
    const nextForLoopCheck = this.getSuccessor(nodeId, 'next');
    const hasLoop = nextForLoopCheck
        ? this.canReach(nextForLoopCheck, nodeId, new Set())
        : false;

    if (hasBackEdge || hasLoop) {
        if (!this.loweredImplicitLoops.has(nodeId)) {
            console.log(`FORCING while True loop for ${nodeId} (top-level implicit loop)`);
            this.loweredImplicitLoops.add(nodeId);

            const indent = "    ".repeat(indentLevel);
            let loopCode = `${indent}while True:\n`;

            if (this.useHighlighting) {
                loopCode += `${indent}    highlight('${nodeId}')\n`;
            }

            const nodeCode = this.compileSingleNode(nodeId, indentLevel + 1);
            const bodyCode = this.compileNode(
                this.getSuccessor(nodeId, "next"),
                new Set(),
                [...contextStack, `implicit_${nodeId}`],
                indentLevel + 1,
                /* inLoopBody   */ true,
                /* inLoopHeader */ false
            );

            const fullBody = (nodeCode + bodyCode).trim()
                ? nodeCode + bodyCode
                : `${indent}    pass\n`;

            loopCode += fullBody;
            return code + loopCode;
        }
    }
}

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
    
        // ===========================
        // follow next unless it's a loop back edge
        // ===========================
// ===========================
// follow next unless it's a loop back edge OR we emit a break
// ===========================
const nextNodeId = this.getSuccessor(nodeId, "next");




// In compileNode method, update the back edge check section:

// Normal loop back edge check - SIMPLIFIED
// In compileNode, in the back edge check section:
if (contextStack.some(ctx => ctx.startsWith("loop_") || ctx.startsWith("implicit_"))) {
    for (const ctx of contextStack) {
        if (ctx.startsWith("loop_") || ctx.startsWith("implicit_")) {
            const hdr = ctx.startsWith("loop_")
                ? ctx.replace("loop_", "")
                : ctx.replace("implicit_", "");
            
            // Check if this node IS the loop header - stop immediately, don't compile it again
            if (nodeId === hdr) {
                console.log(`Node ${nodeId} is the loop header - stopping (back edge detected)`);
                return ""; // Return empty - the loop header code was already compiled at loop start
            }
            
            // Check if nextNodeId would go to the loop header (back edge via next connection)
            if (nextNodeId === hdr) {
                console.log(`Next node ${nextNodeId} is the loop header ${hdr} - stopping`);
                return code; // Return current node code, but don't compile the loop header again
            }
            
            // Check if this node directly connects to the loop header via any edge
            const outgoing = this.outgoingMap.get(nodeId) || [];
            const goesToHeader = outgoing.some(edge => edge.targetId === hdr);
            
            if (goesToHeader) {
                console.log(`Node ${nodeId} has back edge to loop header ${hdr} - stopping`);
                return code; // Stop here, don't compile successor
            }
        }
    }
}

// For convergence points: compile successors first, then mark as compiled
// This ensures successors are only compiled once, even if multiple paths reach the convergence point
// In the compileNode method, modify the convergence point logic:
if (isConvergencePoint) {
    // For output nodes that are convergence points, we should still compile them
    // because they might be reached from different logical paths
    if (node.type === "output" && this.compiledConvergencePoints.has(nodeId)) {
        // For output nodes, we want to compile them again when reached from different paths
        // because they represent different logical outcomes
        // Don't return empty - instead, just compile the node code without successors
        console.log(`Recompiling output convergence point: ${nodeId} from different path`);
        // Still add highlight
        code += this.emitHighlight(nodeId, indentLevel);
        
        // Compile the output node
        const indent = "    ".repeat(indentLevel);
        code += `${indent}print(${node.text})\n`;
        
        // But don't compile successors again (they're already compiled)
        return code;
    }
    
    // For non-output convergence points, check if already compiled
    if (this.compiledConvergencePoints.has(nodeId)) {
        console.log(`Skipping already compiled convergence point: ${nodeId}`);
        return "";
    }
}

// Not a convergence point, or first visit - compile normally
if (nextNodeId) {
    return code + this.compileNode(nextNodeId, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader);
} else {
    return code;
}
    }
    



compileSingleNode(nodeId, indentLevel) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return "";
    
    const indent = "    ".repeat(indentLevel);
    let code = "";
    
    // Add highlight if enabled
    if (this.useHighlighting) {
        code += `${indent}highlight('${node.id}')\n`;
    }
    
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

            break;
            
        default:
            if (node.text) code += `${indent}${node.text}\n`;
    }
    
    return code;
}  
    
    
    compileImplicitForeverLoop(nodeId, visitedInPath, contextStack, indentLevel,
    inLoopBody,
    inLoopHeader) {

const indent = "    ".repeat(indentLevel);
let code = "";

// ----- then compile successor chain -----
const nextId = this.getSuccessor(nodeId, "next");

// Check if this loop has any exit paths (break conditions)
const hasExit = nextId ? this.hasExitPath(nextId, nodeId) : false;

if (!hasExit) {
    console.warn(`Warning: Implicit loop at node ${nodeId} has no exit condition - infinite loop`);
}

// while True header
code += `${indent}while True:\n`;

if (this.useHighlighting) {
    code += `${indent}    highlight('${nodeId}')\n`;
}

// ----- compile the header node body once (inside loop) -----
const nodeCode = this.compileSingleNode(nodeId, indentLevel + 1) || "";

const bodyCode =
    this.compileNode(
        nextId,
        new Set(), // fresh visited set to stop recursion chain explosion
        [...contextStack, `implicit_${nodeId}`],
        indentLevel + 1,
        true,  // inLoopBody = true (we're inside the implicit loop)
        false  // inLoopHeader = false (we're past the header)
    ) || "";

const fullBody = (nodeCode + bodyCode).trim()
    ? nodeCode + bodyCode
    : `${indent}    pass\n`;

code += fullBody;

return code;
}


/**
 * Simple if/else compilation without elif chains for nested decision structures
 */
 compileSimpleIfElse(node, yesId, noId, visitedInPath, contextStack, indentLevel,
    inLoopBody = false,
    inLoopHeader = false) {
    
    // ============================================
    // NEW: Check if we're in a loop and branches exit
    // ============================================
    if (inLoopBody || contextStack.some(ctx => ctx.startsWith('loop_') || ctx.startsWith('implicit_'))) {
        // Find the INNERMOST loop (last in context stack, which is the most recent)
        // This handles nested loops correctly - we want to check if we exit the current innermost loop
        const loopContexts = contextStack.filter(ctx => 
            ctx.startsWith('loop_') || ctx.startsWith('implicit_')
        );
        
        // Get the innermost loop (last in the filtered list, which corresponds to the most recent loop entered)
        const loopCtx = loopContexts.length > 0 ? loopContexts[loopContexts.length - 1] : null;
    
        let headerId = null;
        if (loopCtx) {
            headerId = loopCtx.replace('loop_', '').replace('implicit_', '');
        }
        
        // Only check for exits if we have a loop header
        // For nested loops, we only want to add breaks if we exit the innermost loop
        if (headerId) {
            const yesExits = this.reachesEndWithoutReturningToHeader(yesId, headerId);
            const noExits = this.reachesEndWithoutReturningToHeader(noId, headerId);
            
            // If any branch exits the innermost loop, use special loop exit decision compilation
            if (yesExits || noExits) {
                return this.compileLoopExitDecision(node, yesId, noId, yesExits, noExits,
                    visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader);
            }
        }
    }
    
        const indent = "    ".repeat(indentLevel);
    let code = "";
    
    // FIX: Add highlight for the decision node itself
   // if (this.useHighlighting) {
    //    code += `${indent}highlight('${node.id}')\n`;
   // }
    
    code += `${indent}if ${node.text}:\n`;  

    // Compile YES branch
    const ifContext = [...contextStack, `if_${node.id}`];
    const ifVisited = new Set([...visitedInPath]);
    const ifCode = this.compileNode(yesId, ifVisited, ifContext, indentLevel + 1, inLoopBody, inLoopHeader);
    code += ifCode || `${indent}    pass\n`;

    // Compile NO branch
    if (noId) {
        if (!code.endsWith("\n")) code += "\n";
        code += `${indent}else:\n`;
        const elseContext = [...contextStack, `else_${node.id}`];
        const elseVisited = new Set([...visitedInPath]);
        const elseCode = this.compileNode(noId, elseVisited, elseContext, indentLevel + 1, inLoopBody, inLoopHeader);
        code += elseCode || `${indent}    pass\n`;
    }

    return code;
}
    /**
     * Compile decision node (could be if, while, or for)
     */

    /**
 * Compile decision node using dominator-based loop detection
 */
/**
 * Compile decision node using dominator-based loop detection
 */
compileDecision(node, visitedInPath, contextStack, indentLevel,
    inLoopBody = false,
    inLoopHeader = false) {
const yesId = this.getSuccessor(node.id, 'yes');
const noId  = this.getSuccessor(node.id, 'no');

// If we're already inside this loop header, don't try to re-lower it
const isAlreadyLoop = contextStack.some(ctx => ctx === `loop_${node.id}`);
if (isAlreadyLoop) {
return this.compileIfElse(
node, yesId, noId,
visitedInPath, contextStack, indentLevel,
inLoopBody, inLoopHeader
);
}

// ============================================
// 1) SIMPLE WHILE-LOOP PATTERN (direct branch back)
// ============================================
const isSimpleWhile = this.isWhileLoopPattern(node.id);

if (isSimpleWhile) {
console.log(`Simple while-loop pattern detected at ${node.id}: ${node.text}`);

const yesLoops = this.canReach(yesId, node.id, new Set());
const noLoops  = noId ? this.canReach(noId, node.id, new Set()) : false;

let loopBodyId = null;
let exitId     = null;
let useNoBranch = false;

if (yesLoops && !noLoops) {
// YES branch is loop body, NO is exit
loopBodyId  = yesId;
exitId      = noId;
useNoBranch = false;
} else if (!yesLoops && noLoops) {
// NO branch is loop body, YES is exit (inverted condition)
loopBodyId  = noId;
exitId      = yesId;
useNoBranch = true;
} else {
console.log(`Not a simple while loop at ${node.id} (both or neither branches loop)`);
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
    /* inLoopBody   */ false,
    /* inLoopHeader */ true
);
}
}

// ============================================
// 2) DOMINATOR-BASED LOOP DETECTION
//    (handles complex / multi-exit loops)
// ============================================
if (this.isLoopHeader(node.id)) {
console.log(`Dominator analysis: ${node.id} is a loop header`);

let loopInfo = this.getLoopInfo(node.id);

// Fallback for loops where getLoopInfo can't find a clean exit branch
if (!loopInfo) {
const backEdges = this.backEdges.filter(e => e.to === node.id);

if (backEdges.length > 0) {
    const bodyId =
        this.getSuccessor(node.id, "yes") ||
        this.getSuccessor(node.id, "no");

    loopInfo = {
        bodyId,
        exitId: null,       // exits handled via break to END
        useNoBranch: false,
        backEdgeFrom: backEdges[0].from
    };

    console.log(
        `Multi-exit loop fallback active for ${node.id}; ` +
        `body starts at ${bodyId}`
    );
}
}

// If we have loop info with a body, LOWER IT TO A LOOP HERE
if (loopInfo && loopInfo.bodyId) {
return this.compileLoop(
    node,
    loopInfo.bodyId,
    loopInfo.exitId ?? null,
    visitedInPath,
    contextStack,
    indentLevel,
    loopInfo.useNoBranch ?? false,
    /* inLoopBody   */ false,
    /* inLoopHeader */ true
);
}
// If we *don't* have usable loop info, just fall through to if/else.
}

// ============================================
// 3) SPECIAL CASES: output → END
// ============================================
const yesNode = this.nodes.find(n => n.id === yesId);
if (yesNode && yesNode.type === 'output') {
const yesNext     = this.getSuccessor(yesId, 'next');
const yesNextNode = this.nodes.find(n => n.id === yesNext);
if (yesNextNode && yesNextNode.type === 'end') {
console.log(`Decision ${node.id} has YES→output→END → treating as if/else`);
return this.compileIfElse(
    node, yesId, noId,
    visitedInPath, contextStack, indentLevel,
    inLoopBody, inLoopHeader
);
}
}

const noNodeObj = noId ? this.nodes.find(n => n.id === noId) : null;
if (noNodeObj && noNodeObj.type === 'output') {
const noNext     = this.getSuccessor(noId, 'next');
const noNextNode = this.nodes.find(n => n.id === noNext);
if (noNextNode && noNextNode.type === 'end') {
console.log(`Decision ${node.id} has NO→output→END → treating as if/else`);
return this.compileIfElse(
    node, yesId, noId,
    visitedInPath, contextStack, indentLevel,
    inLoopBody, inLoopHeader
);
}
}

// ============================================
// 4) DEFAULT: regular if/else (NO suppression)
// ============================================
return this.compileIfElse(
node, yesId, noId,
visitedInPath, contextStack, indentLevel,
inLoopBody, inLoopHeader
);
}


    /**
 * Check if a branch leads DIRECTLY back to the decision without passing through
 * increment statements or outer loop headers
 */
/**
 * Check if a decision is a DIRECT loop header (branches back to itself)
 * vs INDIRECT (goes through outer loop/other flow)
 */


isWhileLoopPattern(decisionId) {
    const yesId = this.getSuccessor(decisionId, 'yes');
    const noId = this.getSuccessor(decisionId, 'no');
    
    // For a true while-loop, the looping branch should go DIRECTLY back
    // without passing through other decisions
    const yesLoops = this.canReachDirect(yesId, decisionId);
    const noLoops = noId ? this.canReachDirect(noId, decisionId) : false;
    
    console.log(`isWhileLoopPattern(${decisionId}): yesLoops=${yesLoops}, noLoops=${noLoops}`);
    
    return (yesLoops && !noLoops) || (!yesLoops && noId && noLoops);
}

/**
 * Check if we can reach targetId from startId without passing through 
 * other decision nodes (except the target itself)
 */
canReachDirect(startId, targetId, visited = new Set()) {
    if (!startId || visited.has(startId)) return false;
    if (startId === targetId) return true;
    
    const node = this.nodes.find(n => n.id === startId);
    
    // If we encounter another decision node (that's not our target), stop
    if (node && node.type === 'decision') {
        return false;
    }
    
    visited.add(startId);
    
    const outgoing = this.outgoingMap.get(startId) || [];
    for (const edge of outgoing) {
        if (this.canReachDirect(edge.targetId, targetId, new Set([...visited]))) {
            return true;
        }
    }
    
    return false;
}



// ensure increment -> header path has NO other decisions
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
// True if ALL paths from loop body to header go through increment node
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

/**
 * Check if a path from startId eventually leads to targetId
 */
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

/**
 * Check if a branch exits the current loop (goes to END or outside loop)
 */
doesBranchExitLoop(startId, contextStack, currentNodeId) {
    if (!startId) return false;
    
    // Find our loop header from context (check both loop_ and implicit_ prefixes)
    let currentLoopHeaderId = null;
    for (const ctx of contextStack) {
        if (ctx.startsWith('loop_')) {
            currentLoopHeaderId = ctx.replace('loop_', '');
            break;
        } else if (ctx.startsWith('implicit_')) {
            currentLoopHeaderId = ctx.replace('implicit_', '');
            break;
        }
    }
    
    if (!currentLoopHeaderId) return false; // Not in a loop
    
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

// Does 'fromId' reach END without coming back to loop header 'headerId'?
reachesEndWithoutReturningToHeader(fromId, headerId, visited = new Set()) {
    if (!fromId) return false;
    
    // If we come back to the header → not an exit (it's a back edge)
    // Check this BEFORE checking visited to allow detecting back edges
    if (fromId === headerId) return false;
    
    if (visited.has(fromId)) return false;
    visited.add(fromId);

    const node = this.nodes.find(n => n.id === fromId);
    if (!node) return false;

    // If we reach END → success (exits the loop)
    if (node.type === "end") return true;
    
    // Follow all successors depending on node type
    const succs = [];

    if (node.type === "decision") {
        const y = this.getSuccessor(fromId, "yes");
        const n = this.getSuccessor(fromId, "no");
        if (y) succs.push(y);
        if (n) succs.push(n);
    } else {
        const next = this.getSuccessor(fromId, "next");
        if (next) succs.push(next);
    }

    // Search each successor
    for (const s of succs) {
        if (this.reachesEndWithoutReturningToHeader(s, headerId, new Set([...visited]))) {
            return true;
        }
    }

    return false;
}

/**
 * Compile a decision inside loop where branches might exit with break
 */
compileLoopExitDecision(node, yesId, noId, yesExits, noExits, 
    visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader) {
const indent = "    ".repeat(indentLevel);
let code = `${indent}if ${node.text}:\n`;

// Compile YES branch
const ifContext = [...contextStack, `if_${node.id}`];
const ifVisited = new Set([...visitedInPath]);
let ifCode = this.compileNode(yesId, ifVisited, ifContext, indentLevel + 1, inLoopBody, inLoopHeader);

// Add break if this branch exits loop AND doesn't already have a break
// Only add break if ALL paths in this branch exit (not just some)
if (yesExits) {
    const hasBreak = ifCode.trim().endsWith('break');
    if (!hasBreak) {
        // Check if the branch is a simple path to END, or if it's a decision where all branches exit
        const allPathsExit = this.allPathsExit(yesId, contextStack);
        if (allPathsExit) {
            ifCode = ifCode.replace(/\n+$/g, "\n");
            if (ifCode) {
                // ensure a clean line for break:
                if (!ifCode.endsWith("\n")) ifCode += "\n";
                ifCode += `${indent}    break\n`;
            } else {
                // FIX: add the newline here
                ifCode = `${indent}    break\n`;
            }
        }
    }
}

code += ifCode || `${indent}    pass\n`;

// Compile NO branch
if (noId) {
code += `${indent}else:\n`;
const elseContext = [...contextStack, `else_${node.id}`];
const elseVisited = new Set([...visitedInPath]);
let elseCode = this.compileNode(noId, elseVisited, elseContext, indentLevel + 1, inLoopBody, inLoopHeader);

// Add break if this branch exits loop AND doesn't already have a break
// Only add break if ALL paths in this branch exit (not just some)
if (noExits) {
    const hasBreak = elseCode.trim().endsWith('break');
    if (!hasBreak) {
        // Check if the branch is a simple path to END, or if it's a decision where all branches exit
        const allPathsExit = this.allPathsExit(noId, contextStack);
        if (allPathsExit) {
            elseCode = elseCode.replace(/\n+$/g, "\n");
            if (!elseCode.endsWith("\n")) {
                elseCode += "\n";
            }
            elseCode += `${indent}    break\n`;
        }
    }
}


code += elseCode || `${indent}    pass\n`;
}

return code;
}

/**
 * Check if ALL paths from a node exit the loop (reach END without returning to header)
 */
allPathsExit(startId, contextStack) {
    if (!startId) return false;
    
    // Find loop header from context
    const loopCtx = [...contextStack]
        .reverse()
        .find(ctx => ctx.startsWith('loop_') || ctx.startsWith('implicit_'));
    
    if (!loopCtx) return false;
    
    const headerId = loopCtx.replace('loop_', '').replace('implicit_', '');
    
    // Use reachesEndWithoutReturningToHeader which already handles this correctly
    // But we need to check if ALL paths exit, not just if any path exits
    // For now, use a simpler heuristic: if the node is a decision, check both branches
    const node = this.nodes.find(n => n.id === startId);
    if (!node) return false;
    
    if (node.type === 'decision') {
        const yesId = this.getSuccessor(startId, 'yes');
        const noId = this.getSuccessor(startId, 'no');
        
        const yesExits = yesId ? this.reachesEndWithoutReturningToHeader(yesId, headerId) : false;
        const noExits = noId ? this.reachesEndWithoutReturningToHeader(noId, headerId) : false;
        
        // Both branches must exit for us to add a break at this level
        return yesExits && noExits;
    } else {
        // For non-decision nodes, check if the path exits
        return this.reachesEndWithoutReturningToHeader(startId, headerId);
    }
}

/**
 * Compile loop structure (while or for)
 *
 * node         = decision node (loop header)
 * loopBodyId   = entry node of looping branch
 * exitId       = entry node of exit branch (after loop)
 * useNoBranch  = true when NO branch is the loop body
 */
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


const indent = "    ".repeat(indentLevel);
let code = "";

// -------------------------------
// 1) Try COUNTED FOR loop lowering
// -------------------------------

// Try for-loop lowering regardless of whether loop is on YES or NO
const forInfo = this.detectForLoopPattern(node.id);


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

    // -------------------------------
    // build Python for-range()
    // -------------------------------
    let step = forInfo.step;
    if (!step) {
        step = (parseInt(forInfo.start) <= parseInt(forInfo.end)) ? 1 : -1;
    }

    const rangeStr = `range(${forInfo.start}, ${forInfo.end}, ${step})`;

    code += `${indent}for ${forInfo.variable} in ${rangeStr}:\n`;

    if (this.useHighlighting) {
        code += `${indent}    highlight('${node.id}')\n`;
    }

    // -------------------------------
    // compile loop body ONLY along loop branch
    // -------------------------------
    const loopCtx = [...contextStack, `loop_${node.id}`];

// After compiling the loop body in the for-loop section:
const bodyCode = this.compileNode(
    loopBodyId,
    new Set(),
    loopCtx,
    indentLevel + 1,
        /* inLoopBody = */ true,
        /* inLoopHeader = */ true
);

// Add highlight for the increment node if we're using highlighting
let finalBodyCode = bodyCode;

code += finalBodyCode.trim() ? finalBodyCode : `${indent}    pass\n`;

// -------------------------------
// compile exit path AFTER loop
// -------------------------------
// compile exit path AFTER loop
// compile exit path AFTER loop
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

// -------------------------------
// 2) OTHERWISE → WHILE LOOP
// -------------------------------

// Check if loop body contains any break-to-END exits
const hasBreakToEnd = this.checkForBreakToEnd(loopBodyId, node.id);

let condition = node.text;
if (useNoBranch) condition = `not (${condition})`;

if (hasBreakToEnd && exitId) {
    // Use while-else structure
    code += `${indent}while ${condition}:\n`;
    
    if (this.useHighlighting) {
        code += `${indent}    highlight('${node.id}')\n`;
    }
    
    const whileCtx = [...contextStack, `loop_${node.id}`];
    const bodyCode = this.compileNode(loopBodyId, new Set(), whileCtx, indentLevel + 1, true, true);
    code += bodyCode.trim() ? bodyCode : `${indent}    pass\n`;
    
    // Add else clause for exit path
    if (!code.endsWith("\n")) code += "\n";
    code += `${indent}else:\n`;
    const exitCode = this.compileNode(exitId, visitedInPath, contextStack, indentLevel + 1, false, false);
    code += exitCode || `${indent}    pass\n`;
} else {
    // Regular while without else
    code += `${indent}while ${condition}:\n`;
    
    if (this.useHighlighting) {
        code += `${indent}    highlight('${node.id}')\n`;
    }
    
    const whileCtx = [...contextStack, `loop_${node.id}`];
    const bodyCode = this.compileNode(loopBodyId, new Set(), whileCtx, indentLevel + 1, true, true);
    code += bodyCode.trim() ? bodyCode : `${indent}    pass\n`;
    
    // exit path after while (executes even after break)
    if (exitId) {
        code += this.compileNode(exitId, visitedInPath, contextStack, indentLevel, false, false);
    }
}

return code;
}
/**
 * Check if loop body contains any paths that break to END
 */
checkForBreakToEnd(startId, loopHeaderId) {
    const stack = [startId];
    const visited = new Set();
    
    while (stack.length > 0) {
        const currentId = stack.pop();
        if (visited.has(currentId) || currentId === loopHeaderId) continue;
        visited.add(currentId);
        
        const node = this.nodes.find(n => n.id === currentId);
        if (!node) continue;
        
        // Check if this node goes directly to END
        const outgoing = this.outgoingMap.get(currentId) || [];
        for (const edge of outgoing) {
            const targetNode = this.nodes.find(n => n.id === edge.targetId);
            if (targetNode && targetNode.type === 'end') {
                return true;
            }
            stack.push(edge.targetId);
        }
    }
    
    return false;
}
    /**
     * Detect for loop pattern:
     * Looks for: var = 0 → decision → ... → var = var + 1 → back to decision
     */
/**
 * Improved for loop detection with path analysis
 */
/**
 * Detect for loop pattern (increasing and decreasing)
 * Supports:
 *   i = 0      / i = start
 *   i < end    / i <= end / i > end / i >= end
 *   i = i + k  / i += k / i = i - k / i -= k
 *   numeric OR variable bounds
 */
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
    
    // -------------------------------
    // 1) Find initialisation before decision
    // -------------------------------
    const decisionNode = this.nodes.find(n => n.id === decisionId);
    if (!decisionNode || !decisionNode.text) {
        this.forPatternInProgress.delete(decisionId);
        return null;
    }

    // Extract variable name from decision condition
    let varName = null;
    const condMatch = decisionNode.text.match(/^\s*(\w+)\s*[<>=!]/);
    if (!condMatch) {
        this.forPatternInProgress.delete(decisionId);
        return null;
    }
    varName = condMatch[1];

    console.log(`For-loop detection for variable: ${varName} in decision: ${decisionNode.text}`);

    let initNode = null;
    let startValue = null;

    // Search for initialization
    for (const node of this.nodes) {
        if (node.type === "var" || node.type === "process") {
            // Check if this node assigns to our loop variable
            const m = node.text?.match(new RegExp(`^\\s*${varName}\\s*=\\s*([\\w\\d_]+)\\s*$`));
            if (m) {
                console.log(`Found potential init node: ${node.id} with text: ${node.text}`);
                
                // Check if this node reaches the decision
                if (this.pathExists(node.id, decisionId, new Set())) {
                    console.log(`Path confirmed from ${node.id} to ${decisionId}`);
                    initNode = node;
                    startValue = m[1];
                    break;
                }
            }
        }
    }

    if (!varName || !startValue) {
        console.log(`No initialization found for variable ${varName}`);
        this.forPatternInProgress.delete(decisionId);
        this.forPatternCache.set(decisionId, null);
        return null;
    }

    // -------------------------------
    // 2) Parse loop condition
    // -------------------------------
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

    if (!endValue) {
        this.forPatternInProgress.delete(decisionId);
        this.forPatternCache.set(decisionId, null);
        return null;
    }

    // -------------------------------
    // 3) Find increment in loop body
    // -------------------------------
    const yesId = this.getSuccessor(decisionId, 'yes');
    const incrementInfo = this.findIncrementNodeBFS(yesId, decisionId, varName);

    if (!incrementInfo) {
        this.forPatternInProgress.delete(decisionId);
        this.forPatternCache.set(decisionId, null);
        return null;
    }

    let step = incrementInfo.step || 1;
    const incId = incrementInfo.node.id;

   // -------------------------------
// 4) CRITICAL BUT BALANCED CHECK: 
// The increment must be on the "main path" - not in a conditional branch
// -------------------------------
const loopBodyId = this.getSuccessor(decisionId, 'yes');

// Strategy: Check if the increment node DOMINATES the back edge
// For a for-loop, the increment should be on the main execution path

// Find the main execution path (the most direct path from loop start to back edge)
const mainPath = this.findMainExecutionPath(loopBodyId, decisionId);
console.log(`Main execution path: ${mainPath ? mainPath.join(' -> ') : 'none'}`);

if (!mainPath || !mainPath.includes(incId)) {
    console.log(`Increment ${incId} is not on the main execution path - not a for-loop`);
    this.forPatternInProgress.delete(decisionId);
    this.forPatternCache.set(decisionId, null);
    return null;
}

// Check if there are alternative paths that skip the increment
const alternativePaths = this.findAlternativePaths(loopBodyId, decisionId, incId);
console.log(`Found ${alternativePaths.length} alternative paths that skip increment`);

if (alternativePaths.length > 0) {
    console.log(`Not a for-loop: some paths skip the increment`);
    this.forPatternInProgress.delete(decisionId);
    this.forPatternCache.set(decisionId, null);
    return null;
}

// ============================================
// NEW: Check for early exits (break/return to END)
// ============================================
const earlyExits = this.findEarlyExits(loopBodyId, decisionId);
console.log(`For-loop check: Found ${earlyExits.length} early exits from loop body ${loopBodyId}`);

// Log the early exit paths for debugging
for (const exitPath of earlyExits) {
    console.log(`  Early exit path: ${exitPath.join(' -> ')}`);
}

// True for-loops should NOT have early exits to END
// (they only exit when the loop condition becomes false)
if (earlyExits.length > 0) {
    console.log(`Decision ${decisionId}: REJECTED as for-loop - has ${earlyExits.length} early exit(s) to END`);
    this.forPatternInProgress.delete(decisionId);
    this.forPatternCache.set(decisionId, null);
    return null;
}
    // -------------------------------
    // 5) Handle increasing vs decreasing loops
    // -------------------------------
    let finalStart = startValue;
    let finalEnd   = endValue;
    let finalStep  = step;

    // --- DECREASING LOOPS (DOWNWARD) ---
    if (comparisonOp === '>' || comparisonOp === '>=') {
        // force negative step
        finalStep = -Math.abs(step);

        // range() is exclusive
        if (comparisonOp === '>=') {
            finalEnd = `${parseInt(endValue) - 1}`;
        } else {
            finalEnd = endValue;
        }
    } else {
        // --- INCREASING LOOPS (UPWARD) ---
        // ensure positive step
        finalStep = Math.abs(step);

        if (comparisonOp === '<=') {
            // include the end value
            finalEnd = `(${endValue}) + 1`;
        } else {
            finalEnd = endValue;
        }
    }

    // -------------------------------
    // 6) It's a valid counted for-loop
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

    console.log(`Valid for-loop detected: ${varName} from ${finalStart} to ${finalEnd} step ${finalStep}`);
    this.forPatternCache.set(decisionId, result);
    return result;
}

/**
 * Find the main execution path (DFS, prefer straight line over branches)
 */
findMainExecutionPath(startId, targetId, visited = new Set()) {
    if (!startId || visited.has(startId)) return null;
    if (startId === targetId) return [startId];
    
    visited.add(startId);
    
    const node = this.nodes.find(n => n.id === startId);
    
    // Prefer "next" connections over "yes"/"no" branches
    const outgoing = this.outgoingMap.get(startId) || [];
    
    // First try "next" connections
    for (const edge of outgoing) {
        if (edge.port === 'next') {
            const path = this.findMainExecutionPath(edge.targetId, targetId, new Set([...visited]));
            if (path) {
                return [startId, ...path];
            }
        }
    }
    
    // Then try other connections
    for (const edge of outgoing) {
        if (edge.port !== 'next') {
            const path = this.findMainExecutionPath(edge.targetId, targetId, new Set([...visited]));
            if (path) {
                return [startId, ...path];
            }
        }
    }
    
    return null;
}

/**
 * Find alternative paths that skip a required node
 */
findAlternativePaths(startId, targetId, mustIncludeId, visited = new Set(), currentPath = []) {
    if (!startId || visited.has(startId)) return [];
    if (startId === targetId) {
        // If this path reaches target but doesn't include mustIncludeId, it's an alternative
        if (!currentPath.includes(mustIncludeId) && !currentPath.includes(targetId)) {
            return [[...currentPath, startId]];
        }
        return [];
    }
    
    visited.add(startId);
    const newPath = [...currentPath, startId];
    const alternatives = [];
    
    const outgoing = this.outgoingMap.get(startId) || [];
    for (const edge of outgoing) {
        const paths = this.findAlternativePaths(edge.targetId, targetId, mustIncludeId, new Set([...visited]), newPath);
        alternatives.push(...paths);
    }
    
    return alternatives;
}


findAllPaths(startId, targetId, avoidSet = new Set(), currentPath = []) {
    if (!startId || avoidSet.has(startId) || currentPath.includes(startId)) {
        return [];
    }
    
    if (startId === targetId) {
        return [[...currentPath, startId]];
    }
    
    const newPath = [...currentPath, startId];
    const allPaths = [];
    
    const outgoing = this.outgoingMap.get(startId) || [];
    for (const edge of outgoing) {
        const paths = this.findAllPaths(edge.targetId, targetId, avoidSet, newPath);
        allPaths.push(...paths);
    }
    
    return allPaths;
}
/**
 * Find early exits (paths that go to END without returning to loop header)
 */
/**
 * Find early exits (paths that go to END without returning to loop header)
 */
findEarlyExits(startId, loopHeaderId) {
    const exits = [];
    const stack = [{ nodeId: startId, path: [] }];
    const visited = new Set();
    
    while (stack.length > 0) {
        const current = stack.pop();
        const nodeId = current.nodeId;
        
        if (visited.has(nodeId) || nodeId === loopHeaderId) continue;
        visited.add(nodeId);
        
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) continue;
        
        if (node.type === 'end') {
            exits.push([...current.path, nodeId]);
            continue;
        }
        
        const outgoing = this.outgoingMap.get(nodeId) || [];
        for (const edge of outgoing) {
            stack.push({
                nodeId: edge.targetId,
                path: [...current.path, nodeId]
            });
        }
    }
    
    return exits;
}
/**
 * Check if a path exists from startId to targetId
 */
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
/**
 * Find increment node using BFS to handle longer paths
 * Returns object with node, step size, and direction info
 */
findIncrementNodeBFS(startId, stopId, varName) {
    const queue = [{ nodeId: startId, visited: new Set() }];
    
    while (queue.length > 0) {
        const current = queue.shift();
        
        if (current.nodeId === stopId || current.visited.has(current.nodeId)) {
            continue;
        }
        
        current.visited.add(current.nodeId);
        
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

    /**
     * Find increment node in loop body
     */
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

    /**
     * Compile loop body, stopping at back edges    
     */
    compileLoopBody(loopHeaderId, startId, skipNodeId, visitedInPath, contextStack, indentLevel,
    inLoopBody = false,
    inLoopHeader = false) {
        let code = "";
        let currentId = startId;
        const visitedInLoop = new Set([...visitedInPath]);
        
        while (currentId && currentId !== loopHeaderId) {
            // >>> ALWAYS highlight loop body nodes <<<
        if (this.useHighlighting) {
            const indentHL = "    ".repeat(indentLevel);
            code += `${indentHL}highlight('${currentId}')\n`;
        }

            // Check if we should skip this node (for increment in for loops)
            if (currentId === skipNodeId) {
                currentId = this.getSuccessor(currentId, 'next');
                continue;
            }
            
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
            
            if (hasBackEdge || isBackEdgeToAnyLoop) {
                // Compile this node but don't follow the back edge
                // We need to compile just this node's code without following its 'next' connection
            // Compile this node but don't follow the back edge
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
            
            // Compile the node
// Always highlight body nodes
            if (this.useHighlighting) {
                code += `${"    ".repeat(indentLevel)}highlight('${currentId}')\n`;
            }

            // Compile the node normally
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


/**
 * Find the common convergence point after all branches of a decision
 */
findCommonConvergencePoint(decisionId, yesId, noId) {
    // Get all end points of YES branch
    const yesEnds = this.findAllEndPoints(yesId, new Set([decisionId]));
    
    // Get all end points of NO branch (if it exists)
    const noEnds = noId ? this.findAllEndPoints(noId, new Set([decisionId])) : [];
    
    // Find common nodes (intersection)
    const common = yesEnds.filter(nodeId => noEnds.includes(nodeId));
    
    if (common.length > 0) {
        // Return the first common node (closest to the branches)
        return common[0];
    }
    
    // If no direct common, check if NO branch is another decision
    if (noId) {
        const noNode = this.nodes.find(n => n.id === noId);
        if (noNode && noNode.type === 'decision') {
            // Recursively check the elif chain
            const noYesId = this.getSuccessor(noId, 'yes');
            const noNoId = this.getSuccessor(noId, 'no');
            return this.findCommonConvergencePoint(noId, noYesId, noNoId);
        }
    }
    
    return null;
}

/**
 * Find all end points (nodes with no outgoing "next" or convergence points)
 */
findAllEndPoints(startId, visited = new Set()) {
    if (!startId || visited.has(startId)) return [];
    visited.add(startId);
    
    const node = this.nodes.find(n => n.id === startId);
    if (!node) return [];
    
    // If this is a convergence point, it's an end point for branch compilation
    if (this.isConvergencePoint(startId)) {
        return [startId];
    }
    
    // If node has no "next" connection, it's an end point
    const nextId = this.getSuccessor(startId, 'next');
    if (!nextId) {
        return [startId];
    }
    
    // For decisions, check both branches
    if (node.type === 'decision') {
        const yesId = this.getSuccessor(startId, 'yes');
        const noId = this.getSuccessor(startId, 'no');
        
        const yesEnds = yesId ? this.findAllEndPoints(yesId, new Set([...visited])) : [];
        const noEnds = noId ? this.findAllEndPoints(noId, new Set([...visited])) : [];
        
        return [...yesEnds, ...noEnds];
    }
    
    // Otherwise, continue
    return this.findAllEndPoints(nextId, visited);
}

/**
 * Compile a node until reaching a stop point (exclusive)
 */
compileNodeUntil(startId, stopId, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader) {
    if (!startId || startId === stopId) return "";
    
    const node = this.nodes.find(n => n.id === startId);
    if (!node) return "";
    
    // Check if we've already visited this node in this path
    if (visitedInPath.has(startId)) return "";
    visitedInPath.add(startId);
    
    const indent = "    ".repeat(indentLevel);
    let code = "";
    
    // Add highlight
    if (this.useHighlighting) {
        code += this.emitHighlight(startId, indentLevel);
    }
    
    // Compile the node
    switch (node.type) {
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
        case "decision":
            // For decisions within a branch, compile normally
            const yesId = this.getSuccessor(startId, 'yes');
            const noId = this.getSuccessor(startId, 'no');
            
            if (yesId && noId) {
                code += this.compileNodeUntilDecision(node, yesId, noId, stopId, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader);
            }
            break;
        default:
            break;
    }
    
    // Check if next node is the stop point
    const nextId = this.getSuccessor(startId, 'next');
    if (nextId && nextId !== stopId) {
        code += this.compileNodeUntil(nextId, stopId, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader);
    }
    
    return code;
}

/**
 * Compile elif chain stopping at convergence point
 */
compileElifChainUntil(elifNode, convergencePoint, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader) {
    let code = "";
    const indent = "    ".repeat(indentLevel);
    
    let currentElif = elifNode;
    const seen = new Set();
    
    while (currentElif && currentElif.type === 'decision') {
        if (seen.has(currentElif.id)) break;
        seen.add(currentElif.id);
        
        const elifYesId = this.getSuccessor(currentElif.id, 'yes');
        const elifNoId = this.getSuccessor(currentElif.id, 'no');
        
        code += `${indent}elif ${currentElif.text}:\n`;
        
        const elifContext = [...contextStack, `elif_${currentElif.id}`];
        const elifVisited = new Set([...visitedInPath]);
        
        // Compile YES branch up to convergence point
        const elifCode = this.compileNodeUntil(elifYesId, convergencePoint, elifVisited, elifContext, indentLevel + 1, inLoopBody, inLoopHeader);
        code += elifCode || `${indent}    pass\n`;
        
        if (!elifNoId) break;
        
        const nextNode = this.nodes.find(n => n.id === elifNoId);
        
        // Another elif in the chain?
        if (nextNode && nextNode.type === 'decision') {
            currentElif = nextNode;
            continue;
        }
        
        // Final else clause
        if (!code.endsWith("\n")) code += "\n";
        code += `${indent}else:\n`;
        
        const elseCode = this.compileNodeUntil(elifNoId, convergencePoint, visitedInPath, contextStack, indentLevel + 1, inLoopBody, inLoopHeader);
        code += elseCode || `${indent}    pass\n`;
        
        break;
    }
    
    return { code };
}

/**
 * Compile if/else statement with support for elif
 */
// In compileIfElse method:
compileIfElse(node, yesId, noId, visitedInPath, contextStack, indentLevel,
    inLoopBody = false,
    inLoopHeader = false) {
    
    // Find the convergence point AFTER the entire decision chain
    let convergencePoint = this.findCommonConvergencePoint(node.id, yesId, noId);
    
    const indent = "    ".repeat(indentLevel);
    let code = `${indent}if ${node.text}:\n`;
    
    // Compile YES branch BUT STOP at convergence point
    const ifContext = [...contextStack, `if_${node.id}`];
    const ifVisited = new Set([...visitedInPath]);
    
    // If we have a convergence point, compile YES branch up to (but not including) it
    let ifCode = "";
    if (convergencePoint) {
        ifCode = this.compileNodeUntil(yesId, convergencePoint, ifVisited, ifContext, indentLevel + 1, inLoopBody, inLoopHeader);
    } else {
        ifCode = this.compileNode(yesId, ifVisited, ifContext, indentLevel + 1, inLoopBody, inLoopHeader);
    }
    
    code += ifCode || `${indent}    pass\n`;
    
    // Handle else/elif
    if (noId) {
        const noNode = this.nodes.find(n => n.id === noId);
        
        if (noNode && noNode.type === 'decision') {
            // Check if this is a movement chain pattern (elif chain)
            const isMovementChain = node.text.includes('movement ==');
            
            if (isMovementChain) {
                // Compile as elif chain
                const elifResult = this.compileElifChainUntil(noNode, convergencePoint, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader);
                code += elifResult.code || "";
            } else {
                // Regular else with decision
                if (!code.endsWith("\n")) code += "\n";
                code += `${indent}else:\n`;
                
                let elseCode = "";
                if (convergencePoint) {
                    elseCode = this.compileNodeUntil(noId, convergencePoint, visitedInPath, [...contextStack, `else_${node.id}`], indentLevel + 1, inLoopBody, inLoopHeader);
                } else {
                    elseCode = this.compileNode(noId, visitedInPath, [...contextStack, `else_${node.id}`], indentLevel + 1, inLoopBody, inLoopHeader);
                }
                
                code += elseCode || `${indent}    pass\n`;
            }
        } else {
            // Simple else branch
            if (!code.endsWith("\n")) code += "\n";
            code += `${indent}else:\n`;
            
            let elseCode = "";
            if (convergencePoint) {
                elseCode = this.compileNodeUntil(noId, convergencePoint, visitedInPath, [...contextStack, `else_${node.id}`], indentLevel + 1, inLoopBody, inLoopHeader);
            } else {
                elseCode = this.compileNode(noId, visitedInPath, [...contextStack, `else_${node.id}`], indentLevel + 1, inLoopBody, inLoopHeader);
            }
            
            code += elseCode || `${indent}    pass\n`;
        }
    }
    
    // AFTER the if-elif-else chain, compile the convergence point
    if (convergencePoint) {
        if (!code.endsWith("\n")) code += "\n";
        const convCode = this.compileNode(convergencePoint, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader);
        code += convCode;
    }
    
    return code;
}  /**
     * Handle elif chains
     */
/**
 * Handle elif chains safely (no infinite A ↔ B bouncing)
 */
compileElifChain(elifNode, visitedInPath, contextStack, indentLevel ,inLoopBody,inLoopHeader) {
    let code = "";
    const indent = "    ".repeat(indentLevel);

    let currentElif = elifNode;
    const seen = new Set();   // prevent the same decision reappearing in the chain
    
    // FIRST PASS: Find all convergence points from all branches BEFORE compiling
    const convergencePoints = new Set();
    let tempElif = elifNode;
    const tempSeen = new Set();
    
    while (tempElif && tempElif.type === 'decision') {
        if (tempSeen.has(tempElif.id)) break;
        tempSeen.add(tempElif.id);
        
        const yesId = this.getSuccessor(tempElif.id, 'yes');
        const noId = this.getSuccessor(tempElif.id, 'no');
        
        if (yesId) {
            const conv = this.findConvergencePoint(yesId, new Set());
            if (conv) convergencePoints.add(conv);
        }
        
        if (!noId) break;
        const nextNode = this.nodes.find(n => n.id === noId);
        if (nextNode && nextNode.type === 'decision') {
            tempElif = nextNode;
            continue;
        }
        if (noId) {
            const conv = this.findConvergencePoint(noId, new Set());
            if (conv) convergencePoints.add(conv);
        }
        break;
    }
    
    // Mark that we're compiling an elif chain - prevent branches from compiling convergence points
    const originalSkipConvergence = this.skipConvergencePoints;
    this.skipConvergencePoints = new Set(convergencePoints); // Add all convergence points to skip set

    // SECOND PASS: Compile all branches
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
        if (!code.endsWith("\n")) code += "\n";
        // Final else clause
        code += `${indent}else:\n`;
        const elseCode = this.compileNode(elifNoId, visitedInPath, contextStack, indentLevel + 1,inLoopBody,inLoopHeader);
        code += elseCode || `${indent}    pass\n`;

        break;
    }
    
    // Restore original skipConvergencePoints
    this.skipConvergencePoints = originalSkipConvergence;
    
    // Return code and convergence points
    return {
        code: code,
        convergencePoints: Array.from(convergencePoints)
    };
}

/**
 * Find the first convergence point reachable from startId
 */
findConvergencePoint(startId, visited = new Set()) {
    if (!startId || visited.has(startId)) return null;
    visited.add(startId);
    
    // If this is a convergence point, return it
    if (this.isConvergencePoint(startId)) {
        return startId;
    }
    
    const node = this.nodes.find(n => n.id === startId);
    if (!node) return null;
    
    // If this is END, return null (not a convergence point we care about)
    if (node.type === 'end') {
        return null;
    }
    
    // Check successors
    if (node.type === 'decision') {
        const yesId = this.getSuccessor(startId, 'yes');
        const noId = this.getSuccessor(startId, 'no');
        
        // Check both branches, return the first convergence point found
        if (yesId) {
            const yesConv = this.findConvergencePoint(yesId, new Set([...visited]));
            if (yesConv) return yesConv;
        }
        if (noId) {
            const noConv = this.findConvergencePoint(noId, new Set([...visited]));
            if (noConv) return noConv;
        }
    } else {
        const nextId = this.getSuccessor(startId, 'next');
        if (nextId) {
            return this.findConvergencePoint(nextId, new Set([...visited]));
        }
    }
    
    return null; // No convergence point found
}

/**
 * Check if a path from startId has any exit (reaches END without returning to loopHeaderId)
 */
hasExitPath(startId, loopHeaderId, visited = new Set()) {
    if (!startId || visited.has(startId) || startId === loopHeaderId) return false;
    
    visited.add(startId);
    
    const node = this.nodes.find(n => n.id === startId);
    if (!node) return false;
    
    // Found END → has exit
    if (node.type === 'end') return true;
    
    // Check all successors
    const outgoing = this.outgoingMap.get(startId) || [];
    for (const edge of outgoing) {
        if (this.hasExitPath(edge.targetId, loopHeaderId, new Set([...visited]))) {
            return true;
        }
    }
    
    return false;
}


}

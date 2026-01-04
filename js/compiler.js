window.FlowCode = window.FlowCode || {};

class FlowchartCompiler {
    constructor(nodes, connections, useHighlighting = false) {
        this.nodes = nodes;
        this.connections = connections;
        this.useHighlighting = useHighlighting;
        this.loweredImplicitLoops = new Set();   // prevents stack overflow on implicit loops
        this.nodesToSkip = new Set();


        // Build adjacency maps for faster lookups
        this.outgoingMap = new Map();
        this.incomingMap = new Map();
        this.loopHeaderCache = new Map(); // Cache for loop header detection
        this.forPatternCache = new Map();
this.forPatternInProgress = new Set();

        this.buildMaps();
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

// look at every decision node (possible loop header)
for (const dec of this.nodes.filter(n => n.type === "decision")) {

    const info = this.detectForLoopPattern(dec.id);
    if (!info || !info.initNodeId) continue;

    // must match the detected init node
    if (info.initNodeId !== nodeId) continue;

// must be in a straight-line chain that reaches the header
const incoming = this.incomingMap.get(dec.id) || [];
const straightLine = (nodeId) => {
    let cur = nodeId;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
        seen.add(cur);
        if (cur === dec.id) return true;


        const inc = this.incomingMap.get(cur) || [];
        if (inc.length !== 1) return false;   // stop at branching

        cur = inc[0].sourceId;
    }
    return false;
};

if (!straightLine(nodeId)) return false;

}

return false;
}


    findImplicitForeverLoopHeaders() {

const headers = new Set();

const visited = new Set();
const onStack = new Set();

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

            // ignore ALL decision-controlled loops
            if (fromNode.type === "decision") continue;
            if (toNode.type   === "decision") continue;

            // non-decision → non-decision = implicit forever loop
            headers.add(target);
        }
    }

    onStack.delete(nodeId);
};

const start = this.nodes.find(n => n.type === "start");
if (start) dfs(start.id);

return headers;
}

    buildMaps() {
        // Clear maps and cache
        this.outgoingMap.clear();
        this.incomingMap.clear();
        if (this.loopHeaderCache) {
            this.loopHeaderCache.clear();
        }
        
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
    this.forPatternInProgress.clear();
    const startNode = this.nodes.find(n => n.type === 'start');
    if (!startNode) return "# Add a Start node.";
    
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
     * Compile a node with context tracking
     */
    compileNode(nodeId, visitedInPath, contextStack, indentLevel, inLoopBody = false, inLoopHeader = false) {
        if (!nodeId) return "";
    
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return "";
    
        // ✅ END NODE: no per-visit highlight, no children
        if (node.type === "end") {
            // Do not emit highlight here – the END is highlighted once in compile()
            return "";
        }
    
        // ✅ everyone else gets highlighted on entry
        let code = "";
        code += this.emitHighlight(nodeId, indentLevel);
    
        // ===========================
        // END NODE FINISHES FLOW
        // ===========================
        if (node.type === "end") {
            return code; // highlight already emitted
        }
    
        // ===========================
        // cycle protection PER CONTEXT
        // ===========================
        if (visitedInPath.has(nodeId)) return "";
        visitedInPath.add(nodeId);

    
        // ===========================
        // skip for-loop init nodes
        // ===========================
        if (this.isInitOfForLoop(nodeId)) {
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
        // follow next unless it’s a loop back edge
        // ===========================
        const nextNodeId = this.getSuccessor(nodeId, "next");
    
        if (contextStack.some(ctx => ctx.startsWith("loop_"))) {
            for (const ctx of contextStack) {
                if (ctx.startsWith("loop_")) {
                    const hdr = ctx.replace("loop_", "");
                    if (nextNodeId === hdr) return code;
                }
            }
        }
    
        return code + this.compileNode(nextNodeId, visitedInPath, contextStack, indentLevel, inLoopBody, inLoopHeader);
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

// while True header
code += `${indent}while True:\n`;

if (this.useHighlighting) {
    code += `${indent}    highlight('${nodeId}')\n`;
}

// ----- compile the header node body once (inside loop) -----
const nodeCode = this.compileSingleNode(nodeId, indentLevel + 1) || "";

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


/**
 * Simple if/else compilation without elif chains for nested decision structures
 */
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

    // Compile YES branch
    const ifContext = [...contextStack, `if_${node.id}`];
    const ifVisited = new Set([...visitedInPath]);
    const ifCode = this.compileNode(yesId, ifVisited, ifContext, indentLevel + 1, inLoopBody, inLoopHeader);
    code += ifCode || `${indent}    pass\n`;

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
    /**
     * Compile decision node (could be if, while, or for)
     */
    /**
 * Compile decision node (could be if, while, or for)
 */
 compileDecision(
    node,
    visitedInPath,
    contextStack,
    indentLevel,
    inLoopBody = false,
    inLoopHeader = false
) {
    const yesId = this.getSuccessor(node.id, 'yes');
    const noId  = this.getSuccessor(node.id, 'no');

    // If this decision node is *already* in a loop context,
    // just treat it as a normal if/else to avoid re-creating the loop.
    const isAlreadyLoop = contextStack.some(ctx => ctx === `loop_${node.id}`);
    if (isAlreadyLoop) {
        return this.compileIfElse(node, yesId, noId, visitedInPath, contextStack, indentLevel,
    inLoopBody,
    inLoopHeader);
    }

    // Simple loop detection: does this branch eventually lead back to me?
    const isLoopYes = this.isLoopHeader(node.id, yesId);
    const isLoopNo  = noId ? this.isLoopHeader(node.id, noId) : false;
    const isLoop    = isLoopYes || isLoopNo;
    
    if (isLoop) {
        // YES or NO branch is the loop body
        const loopBodyId  = isLoopYes ? yesId : noId;
        const exitId      = isLoopYes ? noId  : yesId;
        const useNoBranch = !isLoopYes && isLoopNo;  // loop on "no" branch => negate condition

        return this.compileLoop(
            node,
            loopBodyId,
            exitId,
            visitedInPath,
            contextStack,
            indentLevel,
            useNoBranch,
    inLoopBody,
    inLoopHeader
        );
    } else {
        // Plain if/else - BUT use a simpler approach for nested decisions
        return this.compileSimpleIfElse(node, yesId, noId, visitedInPath, contextStack, indentLevel,
    inLoopBody,
    inLoopHeader);
    }
}
    /**
     * Check if a decision node is a loop header
     */
/**
 * Check if a decision node is a loop header by following all paths
 */
 isLoopHeader(nodeId, branchId) {

if (!branchId) return false;

const MAX_DEPTH = 200;
const visited = new Set();

const dfs = (id, depth = 0) => {

    if (!id) return false;
    if (depth > MAX_DEPTH) return false;

    // Real loop only if it comes back to THIS decision
    if (id === nodeId) return true;

    if (visited.has(id)) return false;
    visited.add(id);

    const outgoing = this.outgoingMap.get(id) || [];

    for (const edge of outgoing) {
        if (dfs(edge.targetId, depth + 1)) {
            return true;
        }
    }

    return false;
};

return dfs(branchId, 0);
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
    /* inLoopBody = */ true,true
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

// YES-branch loop → normal condition
// NO-branch loop  → negate condition
let condition = node.text;
if (useNoBranch) condition = `not (${condition})`;

code += `${indent}while ${condition}:\n`;

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
// 1) Find initialisation before decision (look for any assignment to loop variable)
// -------------------------------
const decisionNode = this.nodes.find(n => n.id === decisionId);
if (!decisionNode || !decisionNode.text) return null;

// Extract variable name from decision condition (e.g., "x < max" → "x")
let varName = null;
const condMatch = decisionNode.text.match(/^\s*(\w+)\s*[<>=!]/);
if (!condMatch) return null;
varName = condMatch[1];

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

// -------------------------------
// 3) Find increment anywhere in loop body (BFS)
// -------------------------------
const yesId = this.getSuccessor(decisionId, 'yes');
const incrementInfo = this.findIncrementNodeBFS(yesId, decisionId, varName);

if (!incrementInfo) return null;

let step = incrementInfo.step || 1;

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
     * Compile if/else statement with support for elif
     */
/**
 * Compile if/else statement with support for elif
 */
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

    // ----- ELSE / ELIF -----
    if (noId) {
        const noNode = this.nodes.find(n => n.id === noId);

        if (noNode && noNode.type === 'decision') {
            // Check if this "else" decision is itself a loop header.
            // If it is, we MUST NOT turn it into an elif chain, or we get
            // exactly the infinite recursion you're seeing.
            const yesOfNo        = this.getSuccessor(noNode.id, 'yes');
            const noBranchIsLoop = this.isLoopHeader(noNode.id, yesOfNo);

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
}   /**
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

    while (currentElif && currentElif.type === 'decision') {
        // Stop if we’ve already emitted this decision in the chain
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

}

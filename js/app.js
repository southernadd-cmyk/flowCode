window.FlowCode = window.FlowCode || {};
const ELBOW_GAP = 35;   // minimum distance from ports
const GRID = 10;       // soft snap grid

function snap(v) {
    return Math.round(v / GRID) * GRID;
}

function clampElbow(v, a, b) {
    const min = Math.min(a, b) + ELBOW_GAP;
    const max = Math.max(a, b) - ELBOW_GAP;
    return Math.min(max, Math.max(min, v));
}

function rectIntersectsVertical(x, y1, y2, rect) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return (
        x >= rect.x &&
        x <= rect.x + rect.w &&
        maxY >= rect.y &&
        minY <= rect.y + rect.h
    );
}

function rectIntersectsHorizontal(y, x1, x2, rect) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    return (
        y >= rect.y &&
        y <= rect.y + rect.h &&
        maxX >= rect.x &&
        minX <= rect.x + rect.w
    );
}

function orthogonalSmart(p1, p2, nodes) {
    const GAP = 30;  // Increased gap for better clearance
    const MIN_SEGMENT = 40; // Minimum segment length for clean elbows
    
    // Helper: check if a point is too close to any node
    function pointTooCloseToNode(x, y, excludeNodeId = null) {
        for (const node of nodes) {
            if (excludeNodeId && node.id === excludeNodeId) continue;
            
            const d = {
                start:    { w: 95,  h: 40 },
                end:      { w: 95,  h: 40 },
                process:  { w: 120, h: 50 },
                var:      { w: 120, h: 50 },
                list:     { w: 140, h: 50 },
                input:    { w: 130, h: 50 },
                output:   { w: 130, h: 50 },
                decision: { w: 130, h: 110 }
            }[node.type] || { w: 120, h: 50 };
            
            // Add padding for clearance
            const padding = 15;
            const rect = {
                x: node.x - padding,
                y: node.y - padding,
                w: d.w + padding * 2,
                h: d.h + padding * 2
            };
            
            if (x >= rect.x && x <= rect.x + rect.w && 
                y >= rect.y && y <= rect.y + rect.h) {
                return true;
            }
        }
        return false;
    }
    
    // Helper: check if a segment intersects any node
    function segmentIntersectsNode(x1, y1, x2, y2, excludeNodeId = null) {
        for (const node of nodes) {
            if (excludeNodeId && node.id === excludeNodeId) continue;
            
            const d = {
                start:    { w: 95,  h: 40 },
                end:      { w: 95,  h: 40 },
                process:  { w: 120, h: 50 },
                var:      { w: 120, h: 50 },
                list:     { w: 140, h: 50 },
                input:    { w: 130, h: 50 },
                output:   { w: 130, h: 50 },
                decision: { w: 130, h: 110 }
            }[node.type] || { w: 120, h: 50 };
            
            const rect = { x: node.x, y: node.y, w: d.w, h: d.h };
            
            // Check horizontal segment
            if (Math.abs(y1 - y2) < 1) { // horizontal
                if (rectIntersectsHorizontal(y1, x1, x2, rect)) return true;
            }
            // Check vertical segment
            else if (Math.abs(x1 - x2) < 1) { // vertical
                if (rectIntersectsVertical(x1, y1, y2, rect)) return true;
            }
        }
        return false;
    }
    
    // Simple downward flow (most common case)
    if (p2.y > p1.y + GAP) {
        const midY = p1.y + GAP + (p2.y - p1.y - GAP * 2) / 2;
        const elbowX = p1.x;
        
        // Try simple L-shaped route first
        const path1 = `
            M ${p1.x} ${p1.y}
            V ${midY}
            H ${p2.x}
            V ${p2.y}
        `;
        
        // Check if this simple path is clear
        if (!segmentIntersectsNode(p1.x, p1.y, p1.x, midY) &&
            !segmentIntersectsNode(p1.x, midY, p2.x, midY) &&
            !segmentIntersectsNode(p2.x, midY, p2.x, p2.y)) {
            return path1.replace(/\s+/g, ' ');
        }
        
        // Try alternative with longer vertical first
        const altMidY = Math.max(p1.y + GAP * 2, p2.y - GAP * 2);
        const path2 = `
            M ${p1.x} ${p1.y}
            V ${altMidY}
            H ${p2.x}
            V ${p2.y}
        `;
        
        if (!segmentIntersectsNode(p1.x, p1.y, p1.x, altMidY) &&
            !segmentIntersectsNode(p1.x, altMidY, p2.x, altMidY) &&
            !segmentIntersectsNode(p2.x, altMidY, p2.x, p2.y)) {
            return path2.replace(/\s+/g, ' ');
        }
    }
    
    // Target is above source (loopback)
    if (p2.y < p1.y) {
        const dir = p1.x < p2.x ? -1 : 1;
        
        // Try multiple lanes with increasing distance
        for (let lane = 0; lane < 5; lane++) {
            const laneX = p1.x + dir * (80 + lane * 60);
            const detourY = p1.y + GAP * 2;
            
            // Check all segments for clearance
            const segments = [
                [p1.x, p1.y, p1.x, p1.y + GAP],
                [p1.x, p1.y + GAP, laneX, p1.y + GAP],
                [laneX, p1.y + GAP, laneX, p2.y - GAP],
                [laneX, p2.y - GAP, p2.x, p2.y - GAP],
                [p2.x, p2.y - GAP, p2.x, p2.y]
            ];
            
            let clear = true;
            for (const [x1, y1, x2, y2] of segments) {
                if (segmentIntersectsNode(x1, y1, x2, y2)) {
                    clear = false;
                    break;
                }
            }
            
            if (clear) {
                return `
                    M ${p1.x} ${p1.y}
                    V ${p1.y + GAP}
                    H ${laneX}
                    V ${p2.y - GAP}
                    H ${p2.x}
                    V ${p2.y}
                `.replace(/\s+/g, ' ');
            }
        }
    }
    
    // Target is at similar height (sideways flow)
    if (Math.abs(p2.y - p1.y) < GAP * 2) {
        const midX = (p1.x + p2.x) / 2;
        
        // Try U-shaped route
        const detourY = Math.min(p1.y, p2.y) - GAP * 2;
        
        if (detourY > 0 && 
            !segmentIntersectsNode(p1.x, p1.y, p1.x, detourY) &&
            !segmentIntersectsNode(p1.x, detourY, p2.x, detourY) &&
            !segmentIntersectsNode(p2.x, detourY, p2.x, p2.y)) {
            return `
                M ${p1.x} ${p1.y}
                V ${detourY}
                H ${p2.x}
                V ${p2.y}
            `.replace(/\s+/g, ' ');
        }
        
        // Try downward U-shaped route
        const detourY2 = Math.max(p1.y, p2.y) + GAP * 2;
        if (!segmentIntersectsNode(p1.x, p1.y, p1.x, detourY2) &&
            !segmentIntersectsNode(p1.x, detourY2, p2.x, detourY2) &&
            !segmentIntersectsNode(p2.x, detourY2, p2.x, p2.y)) {
            return `
                M ${p1.x} ${p1.y}
                V ${detourY2}
                H ${p2.x}
                V ${p2.y}
            `.replace(/\s+/g, ' ');
        }
    }
    
    // Fallback: Z-shaped route with good clearance
    const midY1 = p1.y + GAP;
    const midY2 = p2.y - GAP;
    const midX = (p1.x + p2.x) / 2;
    
    return `
        M ${p1.x} ${p1.y}
        V ${midY1}
        H ${midX}
        V ${midY2}
        H ${p2.x}
        V ${p2.y}
    `.replace(/\s+/g, ' ');
}

window. App = {
    nodes: [], connections: [], nextId: 1, isRunning: false,
    isConnecting: false, connStart: null, fullExecCode: "",
    editingNode: null, selectedNodeId: null,viewportScale: 1,
viewportX: 0,
viewportY: 0,
minScale: 0.3,
maxScale: 2.5,
cancelExecution: false,
skulptTask: null,
skModule: null,

screenFromWorld(x, y) {
    return {
        x: x * this.viewportScale + this.viewportX,
        y: y * this.viewportScale + this.viewportY
    };
}
,
 mapExecLineToUserLine(execCode, userCode, execLine) {

    const execLines = execCode.split("\n");

    let visibleLine = execLine;

    for (let i = 0; i < execLine - 1; i++) {
        if (execLines[i].trim().startsWith("highlight(")) {
            visibleLine -= 1;
        }
    }

    return visibleLine;
},
exportPython() {
    const code = document.getElementById("code-python").innerText || "";

    const blob = new Blob([code], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "flowcode_program.py";
    a.click();

    URL.revokeObjectURL(url);
}
,
exportJSON() {
    const diagram = {
        nodes: this.nodes,
        connections: this.connections,
        version: "3.0"
    };

    const blob = new Blob(
        [JSON.stringify(diagram, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowchart.json";
    a.click();

    URL.revokeObjectURL(url);
}
,   

async exportImage() {
    if (this.nodes.length === 0) {
        alert("Nothing to export.");
        return;
    }

    // --- Node dimensions must match your CSS + getPortPos dims ---
    const DIMS = {
        start:    { w: 95,  h: 40 },
        end:      { w: 95,  h: 40 },
        process:  { w: 120, h: 50 },
        var:      { w: 120, h: 50 },
        list:     { w: 140, h: 50 },
        input:    { w: 130, h: 50 },
        output:   { w: 130, h: 50 },
        decision: { w: 130, h: 110 }
    };

    const PAD = 40;

    // 1) Compute accurate WORLD bounding box (not viewport/screen)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const n of this.nodes) {
        const d = DIMS[n.type] || { w: 120, h: 50 };
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + d.w);
        maxY = Math.max(maxY, n.y + d.h);
    }

    const width  = Math.ceil((maxX - minX) + PAD * 2);
    const height = Math.ceil((maxY - minY) + PAD * 2);

    // Map WORLD -> EXPORT-LOCAL coords
    const toLocal = (x, y) => ({
        x: (x - minX) + PAD,
        y: (y - minY) + PAD
    });

    // 2) Build an off-screen export container (so nothing is clipped)
    const exportRoot = document.createElement("div");
    exportRoot.style.position = "fixed";
    exportRoot.style.left = "-100000px";
    exportRoot.style.top = "0";
    exportRoot.style.width = width + "px";
    exportRoot.style.height = height + "px";
    exportRoot.style.background = "#ffffff";
    exportRoot.style.overflow = "hidden";
    exportRoot.style.zIndex = "-1";
	exportRoot.style.transform = "none";
exportRoot.style.filter = "none";
exportRoot.style.contain = "none";
exportRoot.style.willChange = "auto";
exportRoot.style.zoom = "1";
exportRoot.style.isolation = "isolate";

    // A relative stage so absolute children place correctly
    const stage = document.createElement("div");
    stage.style.position = "relative";
    stage.style.width = "100%";
    stage.style.height = "100%";
    exportRoot.appendChild(stage);

    // 3) Create SVG connector layer for export
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none";

    // Arrowhead defs (match your existing marker usage)
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrowhead_export");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("refX", "10");
    marker.setAttribute("refY", "3.5");
    marker.setAttribute("orient", "auto");
    const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowPath.setAttribute("d", "M 0 0 L 10 3.5 L 0 7 z");
    arrowPath.setAttribute("fill", "#444");
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);
    stage.appendChild(svg);








    // 4) Clone node DOM into export stage at translated positions
    //    (Keeps your shapes/styles exactly as the app renders them)
    for (const n of this.nodes) {
        const liveEl = document.getElementById(n.id);
        if (!liveEl) continue;

        const clone = liveEl.cloneNode(true);

        // Remove transient UI states from export
        clone.classList.remove("running");
        clone.classList.remove("selected");

        const p = toLocal(n.x, n.y);
        clone.style.position = "absolute";
        clone.style.left = p.x + "px";
        clone.style.top = p.y + "px";

        stage.appendChild(clone);
    }

    // 5) Draw connectors into export SVG (from WORLD ports -> LOCAL coords)
    //    Use your existing getPortPos() which returns WORLD positions.
    for (const c of this.connections) {
        const p1w = this.getPortPos(c.from, c.port);  // world
        const p2w = this.getPortPos(c.to, "in");      // world

        const p1 = toLocal(p1w.x, p1w.y);
        const p2 = toLocal(p2w.x, p2w.y);

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", orthogonalSmart(p1, p2, this.nodes));

        path.setAttribute("fill", "none");

        const stroke =
            c.port === "yes" ? "#16a34a" :
            c.port === "no"  ? "#dc2626" :
                               "#444";

        path.setAttribute("stroke", stroke);
        path.setAttribute("stroke-width", "2.5");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("marker-end", "url(#arrowhead_export)");

        svg.appendChild(path);

        // Optional YES/NO labels (simple SVG text so it exports cleanly)
        if (c.port === "yes" || c.port === "no") {
            const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
            t.setAttribute("x", (p1.x + 10).toString());
            t.setAttribute("y", (p1.y + 18).toString());
            t.setAttribute("font-size", "14");
            t.setAttribute("font-family", "sans-serif");
            t.setAttribute("font-weight", "700");
            t.setAttribute("fill", stroke);
            t.textContent = c.port.toUpperCase();
            svg.appendChild(t);
        }
    }

    // Attach off-screen DOM
    document.documentElement.appendChild(exportRoot);

    try {
        // Allow fonts/layout to settle (important for html2canvas reliability)
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const canvas = await html2canvas(exportRoot, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    width: width,
    height: height,
    windowWidth: width,
    windowHeight: height
        });

        // Download
        canvas.toBlob((blob) => {
            if (!blob) {
                const url = canvas.toDataURL("image/png");
                const a = document.createElement("a");
                a.href = url;
                a.download = "flowchart.png";
                a.click();
                return;
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "flowchart.png";
            a.click();
            URL.revokeObjectURL(url);
        }, "image/png");
    } finally {
        exportRoot.remove();
    }
},




openSaveOptions() {
    const modal = new bootstrap.Modal(
        document.getElementById('saveOptionsModal')
    );
    modal.show();
    buildShareLink();
}
,
updateVarWatch(varsObj) {
const div = document.getElementById("varwatch-table");
if (!div) return;

let html = "<table style='width:100%; border-collapse: collapse;'>";
let hasVars = false;

for (const key in varsObj) {
    // Filter out internal Skulpt attributes and the highlight function itself
    if (key.startsWith("__") || key === "highlight" || key === "input" || key === "print") continue;

    let val = varsObj[key];
    let displayVal = val;

    // Safely unwrap Skulpt types
    if (val !== null && typeof val === 'object') {
        if (val.v !== undefined) {
            displayVal = val.v; // Standard primitives
        } else if (val.tp$name !== undefined) {
            displayVal = `[${val.tp$name}]`; // Objects/Lists
        }
    }

    html += `
        <tr style="border-bottom: 1px solid #333;">
            <td style="color: #888; padding: 4px; font-weight: bold;">${key}</td>
            <td style="color: #0f0; padding: 4px; text-align: right;">${displayVal}</td>
        </tr>`;
    hasVars = true;
}

html += "</table>";
div.innerHTML = hasVars ? html : "<em>No variables set</em>";
},

stopSim() {
    if (!this.isRunning) return;

    this.cancelExecution = true;

    // abort Skulpt task if exists
    if (this.skulptTask && this.skulptTask.cancel) {
        try { this.skulptTask.cancel(); } catch (_) {}
    }

    this.isRunning = false;

    // UI reset
    document.querySelectorAll('.node').forEach(n => n.classList.remove('running'));
    document.getElementById('run-btn').style.display = "inline-block";
    document.getElementById('stop-btn').style.display = "none";

    this.log("\n>>> Stopped.");
}
,
async loadExampleFromFile(filename) {
    try {
        const res = await fetch(`flows/${filename}`);
        if (!res.ok) {
            alert(`Could not load ${filename}`);
            return;
        }

        const diagram = await res.json();
        this.loadDiagramObject(diagram);

    } catch (err) {
        console.error(err);
        alert("Error loading example file");
    }
},
loadDiagramObject(diagram) {
    if (!diagram.nodes || !Array.isArray(diagram.nodes)) {
        alert("Invalid diagram file (missing nodes)");
        return;
    }

    if (!diagram.connections || !Array.isArray(diagram.connections)) {
        alert("Invalid diagram file (missing connections)");
        return;
    }

    // reset
    this.nodes = [];
    this.connections = [];
    this.selectedNodeId = null;

    document.getElementById('nodes-layer').innerHTML = "";
    document.getElementById('console').innerHTML = "";
    document.getElementById('code-python').innerText = "";

    this.nextId = 1;

    // restore nodes
    diagram.nodes.forEach(node => {
        const num = parseInt(node.id.replace("n", "")) || 0;
        if (num >= this.nextId) this.nextId = num + 1;

        this.nodes.push(node);
        this.renderNode(node);
    });

    // restore connections
    this.connections = diagram.connections;

    requestAnimationFrame(() => {
        this.drawConns();
        this.updateCode();
        if (this.resetView) this.resetView();
    });
},

zoomIn() {
    this.viewportScale = Math.min(this.maxScale, this.viewportScale * 1.2);
    this.applyViewportTransform();
},

zoomOut() {
    this.viewportScale = Math.max(this.minScale, this.viewportScale / 1.2);
    this.applyViewportTransform();
},

resetView() {
    this.viewportScale = 1;
    this.viewportX = 0;
    this.viewportY = 0;
    this.applyViewportTransform();
},

applyViewportTransform() {
    const t = `translate(${this.viewportX}px, ${this.viewportY}px) scale(${this.viewportScale})`;
    this.nodesLayer.style.transform = t;
    //this.svgLayer.style.transform = t;

    // force connectors to match new zoom/pan
    this.drawConns();
}
,

    init() {

        
        Sk.configure({ 
            output: (t) => this.log(t), 
            read: (x) => Sk.builtinFiles["files"][x], 
            inputfun: (p) => this.handleInput(p), 
            inputfunTakesPrompt: true 
        });
        this.canvas = document.getElementById('canvas');
        this.nodesLayer = document.getElementById('nodes-layer');
        this.svgLayer = document.getElementById('connections-layer');
        this.dragLine = document.getElementById('drag-line');
        this.setupGlobalEvents();
        this.setupDragDrop();
        this.createNode('start', 50, 50);
        document.getElementById('save-node-btn').onclick = () => this.saveNodeEdit();
        this.applyViewportTransform();
        this.dragLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
this.dragLine.setAttribute("stroke", "#666");
this.dragLine.setAttribute("stroke-width", "3");
this.dragLine.setAttribute("fill", "none");
this.dragLine.style.display = "none";
this.svgLayer.appendChild(this.dragLine);

// Only auto-load welcome.json if NO shared chart link is present
if (!location.hash.startsWith("#chart=")) {
    this.loadExampleFromFile("welcome.json");
}

    },

    log(t) { 
        const c = document.getElementById('console'); 
        const s = document.createElement('span'); 
        s.innerText = t; 
        c.appendChild(s); 
        c.scrollTop = c.scrollHeight; 
    },

    handleInput(prompt) {
        return new Promise((resolve) => {
            const modal = new bootstrap.Modal(document.getElementById('inputModal'));
            document.getElementById('modal-prompt').innerText = prompt || "\"Enter value:\"";
            const field = document.getElementById('modal-field');
            field.value = ""; modal.show();
            const finish = () => { modal.hide(); resolve(field.value); };
            document.getElementById('modal-submit').onclick = finish;
            field.onkeydown = (e) => { if(e.key === 'Enter') finish(); };
        });
    },

    createNode(type, x, y) {
        const validTypes = ['start', 'end', 'process', 'var', 'list', 'input', 'output', 'decision'];
        if (!validTypes.includes(type)) {
            console.error('Invalid node type:', type);
            return;
        }
// ★ Prevent more than one START node
if (type === "start") {
    const hasStart = this.nodes.some(n => n.type === "start");
    if (hasStart) {
        alert("Only one Start node is allowed.");
        return;
    }
}

// ★ Prevent more than one END node
if (type === "end") {
    const hasEnd = this.nodes.some(n => n.type === "end");
    if (hasEnd) {
        alert("Only one End node is allowed.");
        return;
    }
}

const id = `n${this.nextId++}`;

        let text = '';
        let varName = "x";
        let prompt = "\"Enter value\"";
        let dtype = "int";
        
        switch(type) {
            
    case 'start': text = 'Start'; break;
    case 'end':   text = 'End'; break;
    case 'decision': text = 'x < 10'; break;
    case 'var': text = 'x = 0'; break;
    case 'list':
    text = 'myList = []';
    break;

    case 'output': text = 'x'; break;
    case 'process': text = 'x = x + 1'; break;
    case 'input': text = ''; varName = "x"; prompt = "\"Enter value\""; dtype = "int"; break;
}

        
        const config = { id, type, x, y, text, varName, prompt, dtype };
        this.nodes.push(config); 
        this.renderNode(config); 
        this.updateCode();
    },

    renderNode(node) {
    const el = document.createElement('div');
    el.className = `node shape-${node.type}`; 
    el.id = node.id;
    el.style.left = node.x + 'px'; 
    el.style.top = node.y + 'px';
    
    let label = node.text;
    if (node.type === 'output') label = `${node.text}`;
    if (node.type === 'input') label = `${node.prompt}`;
    
    // Logic for the Diamond SVG
    if (node.type === 'decision') {
        el.innerHTML = `
            <svg class="decision-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="50,0 100,50 50,100 0,50" />
            </svg>
            <div class="inner-text">${label}</div>
        `;
    } else {
        el.innerHTML = `<div class="inner-text">${label}</div>`;
    }
    el.title = label || "";
    // Ports
    if (node.type !== 'start') this.addDot(el, 'in', 'in');
    
    if (node.type === 'decision') { 
        this.addDot(el, 'out-yes', 'yes'); 
        this.addDot(el, 'out-no', 'no'); 
    } else if (node.type !== 'end') {
        this.addDot(el, 'out', 'next');
    }
    
    // Dragging Logic (unchanged)
    el.onpointerdown = (e) => {
        if (e.target.classList.contains('dot')) return;
        this.selectNode(node.id);
        const sX = e.clientX, sY = e.clientY, iX = node.x, iY = node.y;
        const move = (me) => {
            node.x = iX + (me.clientX - sX); 
            node.y = iY + (me.clientY - sY);
            el.style.left = node.x + 'px'; 
            el.style.top = node.y + 'px';
            this.drawConns();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', () => { 
            window.removeEventListener('pointermove', move); 
            this.updateCode(); 
        }, {once: true});
    };
    
    el.ondblclick = () => this.openEditor(node);
    this.nodesLayer.appendChild(el);
},
    selectNode(id) {
        this.selectedNodeId = id;
        document.querySelectorAll('.node').forEach(n => 
            n.classList.toggle('selected', n.id === id));
    },

    getPortPos(id, portType) {
    const node = this.nodes.find(n => n.id === id);
    if (!node) return { x: 0, y: 0 };

    // These dimensions should match your CSS widths/heights
    const dims = {
        start:    { w: 95,  h: 40 },
        end:      { w: 95,  h: 40 },
        process:  { w: 120, h: 50 },
        var:      { w: 120, h: 50 },
        list:     { w: 140, h: 50 },
        input:    { w: 130, h: 50 },
        output:   { w: 130, h: 50 },
        decision: { w: 130, h: 110 }
    };

    const d = dims[node.type] || { w: 120, h: 50 };
    let x = node.x;
    let y = node.y;

    // Calculate relative offset based on port type
    switch (portType) {
        case 'in':
            x += d.w / 2;
            y += 0;
            break;
        case 'next':
        case 'yes':
            x += d.w / 2;
            y += d.h;
            break;
        case 'no':
            x += d.w;
            y += d.h / 2;
            break;
    }

    return { x, y };
},

drawConns() {
function cleanPath(pathStr) {
        // Remove duplicate consecutive H/V commands and very short segments
        const commands = pathStr.match(/[A-Z][^A-Z]*/g);
        if (!commands) return pathStr;
        
        const cleaned = [];
        let lastX = 0, lastY = 0;
        
        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];
            const type = cmd[0];
            const coords = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat);
            
            if (type === 'M') {
                lastX = coords[0];
                lastY = coords[1];
                cleaned.push(cmd);
            } 
            else if (type === 'V') {
                const y = coords[0];
                // Skip if this vertical move is tiny
                if (Math.abs(y - lastY) > 15) {
                    cleaned.push(cmd);
                    lastY = y;
                }
            }
            else if (type === 'H') {
                const x = coords[0];
                // Skip if this horizontal move is tiny
                if (Math.abs(x - lastX) > 15) {
                    cleaned.push(cmd);
                    lastX = x;
                }
            }
            else {
                cleaned.push(cmd);
            }
        }
        
        return cleaned.join(' ');
    }
// Remove old labels
document.querySelectorAll('.conn-label').forEach(l => l.remove());

// Reset SVG paths
const d = this.svgLayer.querySelector('defs');
this.svgLayer.innerHTML = "";
this.svgLayer.appendChild(d);
this.svgLayer.appendChild(this.dragLine);


// Draw each connection
this.connections.forEach(c => {

    // world coords from node geometry
const p1w = this.getPortPos(c.from, c.port);
const p2w = this.getPortPos(c.to,   'in');

// ✔ convert to screen coords because SVG NOT transformed
const p1 = this.screenFromWorld(p1w.x, p1w.y);
const p2 = this.screenFromWorld(p2w.x, p2w.y);




// CHANGE IT TO:
let dStr = orthogonalSmart(p1, p2, this.nodes);
dStr = cleanPath(dStr);  // Add this line

const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
path.setAttribute('d', dStr);

    path.setAttribute('d', dStr);

    // colors by port
    path.setAttribute(
        'stroke',
        c.port === 'yes' ? '#16a34a' :
        c.port === 'no'  ? '#dc2626' :
                        '#444'
    );

    path.setAttribute('stroke-width', 2.5);
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrowhead)');

    // tidy corners
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');

    this.svgLayer.appendChild(path);

    // YES / NO labels
    if (c.port === 'yes' || c.port === 'no') {
        const l = document.createElement('div');
        l.className = 'conn-label';
        l.innerText = c.port.toUpperCase();
        l.style.left = (p1.x + 8) + 'px';
        l.style.top  = (p1.y + 8) + 'px';
        this.svgLayer.parentElement.appendChild(l);

    }
});
}
,

    updateCode() {
        try {
            const comp = new FlowchartCompiler(this.nodes, this.connections, false);
            const execComp = new FlowchartCompiler(this.nodes, this.connections, true);
            const code = comp.compile();
            document.getElementById('code-python').innerText = code;
            this.fullExecCode = execComp.compile();
        } catch (error) {
            console.error('Compilation error:', error);
            document.getElementById('code-python').innerText = `# Compilation Error: ${error.message}\n# Check console for details.`;
            this.fullExecCode = "";
        }
    },

    async runSim() {
if (this.isRunning) return;

this.isRunning = true;
this.cancelExecution = false;

document.getElementById('run-btn').style.display = "none";
document.getElementById('stop-btn').style.display = "inline-block";
document.getElementById('console').innerHTML = ">>> Running...<br/>";

// Reset watch
this.updateVarWatch({});

// Define the highlight bridge
Sk.builtins.highlight = new Sk.builtin.func((id) => {
    if (this.cancelExecution) throw new Error("Execution stopped.");

    const nid = (typeof id === "string") ? id : id.v;

    // UI Update: Highlight Node
    document.querySelectorAll('.node').forEach(n => n.classList.remove('running'));
    const activeNode = document.getElementById(nid);
    if (activeNode) activeNode.classList.add('running');

    // VARIABLE TRACKER LOGIC:
    // Use Sk.globals to get the current state of user variables
    if (Sk.globals) {
        this.updateVarWatch(Sk.globals);
    }

    const delay = 2100 - document.getElementById('speed-slider').value;
    return new Sk.misceval.promiseToSuspension(
        new Promise(resolve => setTimeout(resolve, delay))
    );
});

try {
    this.skulptTask = Sk.misceval.asyncToPromise(() =>
        Sk.importMainWithBody("<stdin>", false, this.fullExecCode, true)
    );
    await this.skulptTask;
} catch (e) {

    let pyLine = null;

    if (e.traceback && e.traceback.length > 0) {
        pyLine = e.traceback[0].lineno;

        // 🔥 adjust for highlight lines
        const userLine = this.mapExecLineToUserLine(
            this.fullExecCode,
            document.getElementById('code-python').innerText,
            pyLine
        );

this.log(
    "Error on line " + userLine + "\n" +
    (e.tp$name || "Error") + ": " + e.message
);

        return;
    }

    this.log(e.toString());
}


this.isRunning = false;
document.querySelectorAll('.node').forEach(n => n.classList.remove('running'));
document.getElementById('run-btn').style.display = "inline-block";
document.getElementById('stop-btn').style.display = "none";
if (!this.cancelExecution) this.log("\n>>> Finished.");
} ,
    setupGlobalEvents() {

        this.canvas.addEventListener("wheel", (e) => {
    e.preventDefault();

    const scaleBefore = this.viewportScale;

    if (e.deltaY < 0) this.viewportScale *= 1.1;
    else this.viewportScale /= 1.1;

    this.viewportScale = Math.min(this.maxScale, Math.max(this.minScale, this.viewportScale));

    // zoom towards mouse pointer
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    this.viewportX = mx - (mx - this.viewportX) * (this.viewportScale / scaleBefore);
    this.viewportY = my - (my - this.viewportY) * (this.viewportScale / scaleBefore);

    this.applyViewportTransform();
}, { passive: false });
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

this.canvas.addEventListener("pointerdown", (e) => {
        // CRITICAL: Check if we clicked on a dot first
        if (e.target.classList.contains('dot')) {
            // Let the dot's handler deal with it
            return;
        }
    // only pan if clicking empty canvas background
    if (e.target.id === "canvas" || e.target.id === "connections-layer") {
        isPanning = true;
        panStartX = e.clientX - this.viewportX;
        panStartY = e.clientY - this.viewportY;
    }
});

window.addEventListener("pointermove", (e) => {
    if (!isPanning) return;
    this.viewportX = e.clientX - panStartX;
    this.viewportY = e.clientY - panStartY;
    this.applyViewportTransform();
});

window.addEventListener("pointerup", () => {
    isPanning = false;
});

        window.onkeydown = (e) => {
            if ((e.key === "Delete" || e.key === "Backspace") && this.selectedNodeId) {
                if (document.activeElement.tagName === "INPUT") return;
                const n = this.nodes.find(x => x.id === this.selectedNodeId); 
                if(n?.type === 'start') return;
                
                this.nodes = this.nodes.filter(x => x.id !== this.selectedNodeId);
                this.connections = this.connections.filter(c => 
                    c.from !== this.selectedNodeId && c.to !== this.selectedNodeId);
                
                document.getElementById(this.selectedNodeId)?.remove(); 
                this.selectedNodeId = null; 
                this.drawConns(); 
                this.updateCode();
            }
        };
        
        window.onpointermove = (e) => {
    if (!this.isConnecting) return;

    const rect = this.canvas.getBoundingClientRect();

    // --- mouse to WORLD coordinates ---
    const worldX = (e.clientX - rect.left - this.viewportX) / this.viewportScale;
    const worldY = (e.clientY - rect.top  - this.viewportY) / this.viewportScale;

    // --- port position already in WORLD coordinates ---
    const startWorld = this.getPortPos(
        this.connStart.nodeId,
        this.connStart.portType
    );

    // --- convert BOTH into SCREEN/SVG coordinates ---
    const startScreenX = startWorld.x * this.viewportScale + this.viewportX;
    const startScreenY = startWorld.y * this.viewportScale + this.viewportY;

    const endScreenX = worldX * this.viewportScale + this.viewportX;
    const endScreenY = worldY * this.viewportScale + this.viewportY;

    this.dragLine.setAttribute(
        "d",
        `M ${startScreenX} ${startScreenY} L ${endScreenX} ${endScreenY}`
    );
};

        
window.onpointerup = (e) => {
    if (!this.isConnecting) return;
    this.isConnecting = false; 
    this.dragLine.style.display = 'none';
    
    const target = document.elementFromPoint(e.clientX, e.clientY);
    
    // Check if target is an input port dot
    const targetDot = target?.closest('.dot.in');
    const targetNode = target?.closest('.node');
    
    if (targetDot && targetNode && targetNode.id !== this.connStart.nodeId) {
        // Remove any existing connection from same port
        this.connections = this.connections.filter(c => 
            !(c.from === this.connStart.nodeId && c.port === this.connStart.portType));
        
        // Add new connection
        this.connections.push({ 
            from: this.connStart.nodeId, 
            port: this.connStart.portType, 
            to: targetNode.id 
        });
        
        this.drawConns(); 
        this.updateCode();
    }
};
    },

    setupDragDrop() {
        document.querySelectorAll('.palette-item').forEach(p => 
            p.ondragstart = (e) => {
                e.dataTransfer.setData('type', p.dataset.type);
                e.dataTransfer.setData('valid', 'true');
                
                // Store the mouse offset within the dragged item
                const rect = p.getBoundingClientRect();
                e.dataTransfer.setData('offsetX', e.clientX - rect.left);
                e.dataTransfer.setData('offsetY', e.clientY - rect.top);
            });
        
        this.canvas.ondragover = (e) => e.preventDefault();
        
        this.canvas.ondrop = (e) => {
            e.preventDefault();
            
            const type = e.dataTransfer.getData('type');
            const isValid = e.dataTransfer.getData('valid') === 'true';
            const validTypes = ['start', 'end', 'process', 'var', 'list', 'input', 'output', 'decision'];
            
            if (isValid && validTypes.includes(type)) {
                const rect = this.canvas.getBoundingClientRect();
                
                // Debug logging
                console.log('Drop event:', {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    rectLeft: rect.left,
                    rectTop: rect.top,
                    viewportX: this.viewportX,
                    viewportY: this.viewportY,
                    viewportScale: this.viewportScale
                });
                
                // Simple: drop at cursor position (no centering)
                const worldX = (e.clientX - rect.left - this.viewportX) / this.viewportScale;
                const worldY = (e.clientY - rect.top - this.viewportY) / this.viewportScale;
                
                console.log('Creating node at:', { worldX, worldY });
                
                this.createNode(type, worldX, worldY);
            }
        };
    },

    openEditor(node) {
        // Backward compatibility and safety defaults
node.text = node.text || node.code || node.label || "";
node.prompt = node.prompt || node.text || "";

        if (node.type === 'start' || node.type === 'end') return;

    this.editingNode = node;
    const body = document.getElementById('edit-modal-body');

    if (node.type === 'output') {
        body.innerHTML = `
            <label class="small fw-bold mb-1">Output value (inside print)</label>
            <div class="input-group">
                <span class="input-group-text">print(</span>
                <input id="edit-output-text" class="form-control" value="${escHTML(node.text)}">
                <span class="input-group-text">)</span>
            </div>
        `;
    }
    else if (node.type === 'decision') {
        body.innerHTML = `
            <label class="small fw-bold mb-1">Decision condition</label>
            <div class="input-group">
                <span class="input-group-text">if</span>
                <input id="edit-decision-text" class="form-control" value="${escHTML(node.text)}">
                <span class="input-group-text">:</span>
            </div>
            <div class="form-text">Examples: x &lt; 10, total == 0, name != ""</div>
        `;
    }
    else if (node.type === 'input') {
        body.innerHTML = `
            <label class="small fw-bold">Variable name</label>
            <input id="edit-input-var" class="form-control mb-2" value="${escHTML(node.varName) || escHTML(node.var) || ""}">

            <label class="small fw-bold">Prompt text</label>
            <input id="edit-input-prompt" class="form-control mb-2" value="${escHTML(node.prompt) || escHTML(node.text) || ""}">

            <label class="small fw-bold">Input type</label>
            <select id="edit-input-dtype" class="form-select">
                <option value="int" ${node.dtype === 'int' ? 'selected' : ''}>Integer Number</option>
                <option value="str" ${node.dtype === 'str' ? 'selected' : ''}>String</option>
            </select>

            <div class="mt-2 small text-muted">
                Preview:
                <code id="input-preview"></code>
            </div>
        `;

        setTimeout(() => {
            const updatePreview = () => {
                const v = document.getElementById("edit-input-var").value || "x";
                const p = document.getElementById("edit-input-prompt").value || "";
                const t = document.getElementById("edit-input-dtype").value;

                document.getElementById("input-preview").innerText =
                    t === "int"
                        ? `${v} = int(input(${p}))`
                        : `${v} = input(${p})`;
            };

            document.getElementById("edit-input-var").oninput = updatePreview;
            document.getElementById("edit-input-prompt").oninput = updatePreview;
            document.getElementById("edit-input-dtype").onchange = updatePreview;

            updatePreview();
        }, 0);
    }
    else if (node.type === 'var') {

        // Split existing text like:   total = total + 1
        let varName = "x";
        let varValue = "";

        if (node.text && node.text.includes("=")) {
            const parts = escHTML(node.text).split("=");
            varName = parts[0].trim();
            varValue = parts.slice(1).join("=").trim();
        }

        body.innerHTML = `
            <label class="small fw-bold">Variable name</label>
            <input id="edit-var-name" class="form-control mb-2" value="${varName}">

            <label class="small fw-bold">Value or expression</label>
            <input id="edit-var-value" class="form-control mb-2" value="${varValue}">

            <div class="mt-2 small text-muted">
                Preview:
                <code id="var-preview"></code>
            </div>
        `;

        setTimeout(() => {
            const updatePreview = () => {
                const n = document.getElementById("edit-var-name").value || "x";
                const v = document.getElementById("edit-var-value").value || "0";
                document.getElementById("var-preview").innerText = `${n} = ${v}`;
            };

            document.getElementById("edit-var-name").oninput = updatePreview;
            document.getElementById("edit-var-value").oninput = updatePreview;

            updatePreview();
        }, 0);
    }

    else if (node.type === 'list') {

// defaults
let listName = "myList";
let values = [];

if (node.text && node.text.includes("=")) {
    const parts = node.text.split("=");
    listName = parts[0].trim();

    // parse array literal
    try {
        values = JSON.parse(parts[1].trim().replace(/'/g,'"'));
    } catch {
        values = [];
    }
}

const length = values.length || 0;

// build initial element inputs
let elementsHtml = "";
for (let i = 0; i < length; i++) {
    elementsHtml += `
        <input class="form-control mb-1 list-element"
               value="${values[i] ?? ''}"
               placeholder="Element ${i}">
    `;
}

body.innerHTML = `
    <label class="small fw-bold">List name</label>
    <input id="edit-list-name" class="form-control mb-2" value="${listName}">

    <label class="small fw-bold">List length</label>
    <input id="edit-list-length" type="number"
           min="0" class="form-control mb-2" value="${length}">

    <label class="small fw-bold">Elements</label>
    <div id="list-elements-box">${elementsHtml}</div>

    <div class="mt-2 small text-muted">
        Preview:
        <code id="list-preview"></code>
    </div>
`;

// dynamic behaviour
setTimeout(() => {

    const listBox = document.getElementById("list-elements-box");

    const rebuild = () => {
        const len = parseInt(document.getElementById("edit-list-length").value) || 0;

        listBox.innerHTML = "";
        for (let i = 0; i < len; i++) {
            listBox.innerHTML += `
                <input class="form-control mb-1 list-element"
                       placeholder="Element ${i}">
            `;
        }
        updatePreview();
    };

    const updatePreview = () => {
        const name = document.getElementById("edit-list-name").value || "myList";
        const elems = [...document.querySelectorAll(".list-element")].map(e => e.value);

        const quoted = elems.map(v =>
            isNaN(v) || v === "" ? `"${v}"` : v
        );

        document.getElementById("list-preview").innerText =
            `${name} = [${quoted.join(", ")}]`;
    };

    document.getElementById("edit-list-length").oninput = rebuild;
    document.getElementById("edit-list-name").oninput = updatePreview;
    listBox.oninput = updatePreview;

    updatePreview();
}, 0);
}

    else {
        body.innerHTML = `
            <label class="small fw-bold">Code Text</label>
            <input id="edit-generic-text" class="form-control" value="${node.text ?? ""}">
        `;
    }

    new bootstrap.Modal(document.getElementById('editModal')).show();
}
,
saveNodeEdit() {
    const n = this.editingNode;

    if (n.type === 'output') {
        n.text = document.getElementById('edit-output-text').value;
    }
    else if (n.type === 'decision') {
        n.text = document.getElementById('edit-decision-text').value;
    }
    else if (n.type === 'input') {
        n.varName = document.getElementById('edit-input-var').value;
        n.prompt  = document.getElementById('edit-input-prompt').value;
        n.dtype   = document.getElementById('edit-input-dtype').value;
    }
    else if (n.type === 'var') {
        const name  = document.getElementById('edit-var-name').value || "x";
        const value = document.getElementById('edit-var-value').value || "0";
        n.text = `${name} = ${value}`;
    }
    else if (n.type === 'list') {

const name = document.getElementById("edit-list-name").value || "myList";

const elems = [...document.querySelectorAll(".list-element")].map(e => e.value);

const formatted = elems.map(v =>
    isNaN(v) || v === "" ? `"${v}"` : v
);

n.text = `${name} = [${formatted.join(", ")}]`;
}

    else {
        n.text = document.getElementById('edit-generic-text').value;
    }

    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();

    document.getElementById(n.id).remove();
    this.renderNode(n);
    this.drawConns();
    this.updateCode();
}
,
addDot(parent, cls, portType) {
    const d = document.createElement('div'); 
    d.className = `dot ${cls}`;
    
    // Store port type as data attribute
    d.dataset.portType = portType;
    
    d.onpointerdown = (e) => { 
        e.stopPropagation(); 
        e.preventDefault(); // Also prevent default to stop any drag selection
        
        // Only allow dragging from OUTPUT ports
        // Input ports have portType 'in'
        if (portType === 'in') {
            // Still block the event from bubbling up
            return false; // Explicitly return false to stop propagation
        }
        
        this.isConnecting = true; 
        this.connStart = { nodeId: parent.id, portType }; 
        
        const start = this.getPortPos(parent.id, portType);
        
        // show drag preview line immediately
        this.dragLine.style.display = "block";
        this.dragLine.setAttribute(
            "d",
            `M ${start.x} ${start.y} L ${start.x} ${start.y}`
        );
        
        // Return true to indicate event was handled
        return true;
    };
    
    parent.appendChild(d);
},

    saveDiagram() {
        const diagram = {
            nodes: this.nodes,
            connections: this.connections,
            version: "3.3"
        };
        
        const json = JSON.stringify(diagram, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'flowchart.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    loadDiagram() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const diagram = JSON.parse(event.target.result);
                    
                    // Validate the diagram structure
                    if (!diagram.nodes || !Array.isArray(diagram.nodes)) {
                        alert('Invalid diagram file: missing nodes array');
                        return;
                    }
                    if (!diagram.connections || !Array.isArray(diagram.connections)) {
                        alert('Invalid diagram file: missing connections array');
                        return;
                    }
                    
                    // Clear current canvas
                    this.nodes = [];
                    this.connections = [];
                    this.selectedNodeId = null;
                    document.getElementById('nodes-layer').innerHTML = "";
                    document.getElementById('code-python').innerText = "";
                    document.getElementById('console').innerHTML = "";
                    
                    // Restore nodes
                    this.nextId = 1;
                    diagram.nodes.forEach(node => {
                        // Update nextId to avoid ID conflicts
                        const nodeNum = parseInt(node.id.replace('n', '')) || 0;
                        if (nodeNum >= this.nextId) {
                            this.nextId = nodeNum + 1;
                        }
                        this.nodes.push(node);
                        this.renderNode(node);
                    });
                    
                    // Restore connections
                    this.connections = diagram.connections;
                    
                    // Redraw everything
                    this.drawConns();
                    
                    // Update code with error handling
                    try {
                        this.updateCode();
                    } catch (compileError) {
                        console.error('Compilation error after load:', compileError);
                        document.getElementById('code-python').innerText = `# Error compiling loaded diagram: ${compileError.message}`;
                    }
                } catch (error) {
                    alert('Error loading diagram: ' + error.message);
                    console.error('Load error:', error);
                    console.error('Stack:', error.stack);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    },

    clearCanvas() { 
        if(confirm("Clear all?")) { 
            this.nodes=[]; 
            this.connections=[]; 
            this.selectedNodeId=null; 
            document.getElementById('nodes-layer').innerHTML=""; 
            document.getElementById('code-python').innerText=""; 
            document.getElementById('console').innerHTML=""; 
            this.drawConns(); 
            this.updateCode(); 
        } 
    }

};
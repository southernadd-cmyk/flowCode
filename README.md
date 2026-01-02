# FlowCode v3.6

Build **real, executable flowcharts** in the browser — then automatically generate Python code and run it step-by-step.

FlowCode is designed for teaching programming and algorithmic thinking at KS3/KS4/college level. Students drag blocks, connect them, run the program, and instantly see corresponding Python.
---
Major update highlights:

- ✅ Challenges system added (30 scaffolded programming problems)
- ✅ Ellipsis text truncation on nodes
- ✅ Full text in tooltip on nodes when text is truncated
- ✅ Improved zoom & pan controls
- ✅ Massive compiler upgrades:
  - implicit forever loop support
  - **ongoing loop detection improvements**
- ✅ Export options modal
  - PNG image
  - JSON diagram
  - Python `.py` file

---

## 🚀 Live features

### 🧱 Drag-and-drop editor
- Start, End, Process, Input, Output
- Decision (diamond)
- Variable and List blocks
- Connection ports & auto-routed links
- Node snapping and highlighting
- Double-click to edit

### ▶️ Executable flowcharts
- Python is generated automatically
- Step-by-step visual execution
- Highlight current running node
- Console output panel
- Input modal for `input()` nodes
- Execution speed slider

### 🔁 Control structures supported
FlowCode currently supports:

- sequence
- selection (IF / ELIF / ELSE)
- **while loops**
- **for loops (auto-detected patterns)**
- infinite / implicit loops
- nested loops and conditionals

The compiler translates decision diamonds into real Python based on control-flow graph inspection — not just linear text matching.

### 🧭 Zooming and view control
- Zoom in
- Zoom out
- Reset view
- Smooth scaling of nodes and edges

### 🧪 Challenges mode
30+ scaffolded tasks split by difficulty:

- sequence
- selection
- iteration
- while loops
- lists
- mixed challenges

Each challenge includes:

- title
- difficulty badge
- description
- **pseudocode**
- success criteria
- skills focus

When selected:

- “Active Challenge” banner appears
- pseudocode displayed underneath
- banner can be dragged anywhere
- banner always stays on top
- students can hide it at any time

---

## 🧰 Export options

Export dialog allows:

- ✔ Python source file
- ✔ JSON diagram file
- ✔ PNG image via `html2canvas`

Students can:

- submit diagrams
- submit Python
- email/share JSON
- paste diagrams between sessions

---

## 🖥 Tech stack

- Vanilla JavaScript
- Bootstrap 5
- Skulpt (client-side Python)
- HTML5 / CSS3 / SVG
- html2canvas

No backend required — works offline.

---

## 🧑‍🏫 Designed for classrooms

FlowCode was built for teachers and learners:

- supports direct instruction or discovery learning
- challenges mode encourages independent practice
- pseudocode bridges GCSE specs
- visual execution helps SEN learners
- Python alignment supports most UK curricula

---

## 📦 Installation

No build step required.

Just:

1. Download repository
2. Open `index.html` in a browser

or host via:

- GitHub Pages
- school VLE
- local network share
- simple static hosting

---

## 🔮 Roadmap / ideas

Planned and possible features:

- procedure / function blocks
- tabbed multi-function programs
- arrays visualization
- runtime breakpoints
- classroom teacher dashboard
- marking / auto-assessment of challenges

---

## 🙌 Contributing

Pull requests and testing feedback are welcome — especially from:

- teachers
- examiners
- trainee teachers
- FE / HE lecturers
- students using the tool

Bug reports are very helpful too.

---

## 📝 License

MIT License. Free for schools, teachers and students.

---

### ⭐ If you find FlowCode useful…

Please star the repo — it helps others find it!


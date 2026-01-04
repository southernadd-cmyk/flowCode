window.FlowCode = window.FlowCode || {};
document.addEventListener("DOMContentLoaded", () => {
const FLOWCODE_CHALLENGES = [
    /* ----------------------------- LEVEL 1 — SEQUENCE ----------------------------- */
    {
      "id": 1,
      "diff": 1,
      "title": "Print Shop – Poster Quote",
      "skills": ["input","output","sequence"],
      "task": "Calculate total cost for posters at £3 each.",
      "pseudocode": "INPUT posters\nSET cost = posters * 3\nOUTPUT cost",
      "success": "Outputs correct total cost"
    },
    {
      "id": 2,
      "diff": 1,
      "title": "Helpdesk Ticket Message",
      "skills": ["input","output","sequence"],
      "task": "Create formatted helpdesk ticket text.",
      "pseudocode": "INPUT name\nINPUT device\nINPUT fault\nOUTPUT \"Ticket created for \" + name + \" with \" + device + \" fault: \" + fault",
      "success": "Outputs sentence correctly"
    },
    {
      "id": 3,
      "diff": 1,
      "title": "Photocopy Billing",
      "skills": ["input","output","sequence"],
      "task": "Calculate total price for B&W and colour copies.",
      "pseudocode": "INPUT bw\nINPUT colour\nSET total = (bw * 0.05) + (colour * 0.12)\nOUTPUT total",
      "success": "Correct calculation"
    },
    {
      "id": 4,
      "diff": 1,
      "title": "Minutes to Seconds",
      "skills": ["input","output","sequence"],
      "task": "Convert minutes entered to seconds.",
      "pseudocode": "INPUT minutes\nSET seconds = minutes * 60\nOUTPUT seconds",
      "success": "Correct conversion"
    },
    {
      "id": 5,
      "diff": 1,
      "title": "Simple Pay Calculator",
      "skills": ["input","output","sequence"],
      "task": "Multiply hours worked by hourly rate.",
      "pseudocode": "INPUT hours\nINPUT rate\nSET pay = hours * rate\nOUTPUT pay",
      "success": "Outputs correct pay"
    },
  
    /* ----------------------------- LEVEL 2 — SELECTION ----------------------------- */
    {
      "id": 6,
      "diff": 2,
      "title": "Apprenticeship Eligibility",
      "skills": ["selection"],
      "task": "Check if student is 16 or over.",
      "pseudocode": "INPUT age\nIF age >= 16 THEN\n OUTPUT \"Eligible\"\nELSE\n OUTPUT \"Not eligible\"\nENDIF",
      "success": "Outputs correct eligibility"
    },
    {
      "id": 7,
      "diff": 2,
      "title": "Password Length Check",
      "skills": ["selection"],
      "task": "Warn if password is too short.",
      "pseudocode": "INPUT length\nIF length < 8 THEN\n OUTPUT \"Too weak\"\nELSE\n OUTPUT \"OK\"\nENDIF",
      "success": "Outputs correct message"
    },
    {
      "id": 8,
      "diff": 2,
      "title": "Mobile Usage Discount",
      "skills": ["selection"],
      "task": "Check if minutes used qualifies for discount.",
      "pseudocode": "INPUT minutes\nIF minutes > 500 THEN\n OUTPUT \"Apply discount\"\nELSE\n OUTPUT \"No discount\"\nENDIF",
      "success": "Correct decision"
    },
    {
      "id": 9,
      "diff": 2,
      "title": "Exam Grade",
      "skills": ["selection"],
      "task": "Output Pass or Fail based on mark 50.",
      "pseudocode": "INPUT mark\nIF mark >= 50 THEN\n OUTPUT \"Pass\"\nELSE\n OUTPUT \"Fail\"\nENDIF",
      "success": "Correct grade"
    },
    {
      "id": 10,
      "diff": 2,
      "title": "IT Shop Delivery Charge",
      "skills": ["selection"],
      "task": "Add delivery if under £50 spend.",
      "pseudocode": "INPUT total\nIF total < 50 THEN\n SET total = total + 4.99\nENDIF\nOUTPUT total",
      "success": "Adds delivery when required"
    },
  
    /* ----------------------------- LEVEL 3 — FOR LOOPS ----------------------------- */
    {
      "id": 11,
      "diff": 3,
      "title": "Invoice Number Printing",
      "skills": ["loop"],
      "task": "Print numbers 1 to N.",
      "pseudocode": "INPUT n\nFOR i = 1 TO n\n OUTPUT i\nNEXT i",
      "success": "Correct list output"
    },
    {
      "id": 12,
      "diff": 3,
      "title": "Sticker Printer",
      "skills": ["loop"],
      "task": "Print message N times.",
      "pseudocode": "INPUT n\nFOR i = 1 TO n\n OUTPUT \"Sticker printed\"\nNEXT i",
      "success": "Correct repeat count"
    },
    {
      "id": 13,
      "diff": 3,
      "title": "Times Table Maker",
      "skills": ["loop"],
      "task": "Print 1–10 multiplication table.",
      "pseudocode": "INPUT n\nFOR i = 1 TO 10\n OUTPUT n * i\nNEXT i",
      "success": "Correct products"
    },
    {
      "id": 14,
      "diff": 3,
      "title": "Sum of First N",
      "skills": ["loop"],
      "task": "Calculate 1 + 2 + ... + N.",
      "pseudocode": "INPUT n\nSET total = 0\nFOR i = 1 TO n\n SET total = total + i\nNEXT i\nOUTPUT total",
      "success": "Correct total"
    },
    {
      "id": 15,
      "diff": 3,
      "title": "Days Worked Hours Total",
      "skills": ["loop"],
      "task": "Total hours worked across days.",
      "pseudocode": "INPUT days\nSET total = 0\nFOR i = 1 TO days\n INPUT hours\n SET total = total + hours\nNEXT i\nOUTPUT total",
      "success": "Correct accumulation"
    },
  
    /* ----------------------------- LEVEL 4 — LOOPS + SELECTION ----------------------------- */
    {
      "id": 16,
      "diff": 4,
      "title": "Website Uptime Monitor",
      "skills": ["loop","selection"],
      "task": "Count slow ping responses.",
      "pseudocode": "SET slow = 0\nFOR i = 1 TO 10\n INPUT ping\n IF ping > 200 THEN\n  SET slow = slow + 1\n ENDIF\nNEXT i\nOUTPUT slow",
      "success": "Counts correctly"
    },
    {
      "id": 17,
      "diff": 4,
      "title": "Password Retry Until Correct",
      "skills": ["loop","selection"],
      "task": "Keep asking password until correct.",
      "pseudocode": "SET password = \"letmein\"\nINPUT guess\nWHILE guess != password\n INPUT guess\nENDWHILE\nOUTPUT \"Access granted\"",
      "success": "Loops until correct"
    },
    {
      "id": 18,
      "diff": 4,
      "title": "Loyalty Card Stamp Counter",
      "skills": ["loop","selection"],
      "task": "Ask repeatedly to add stamp.",
      "pseudocode": "SET stamps = 0\nINPUT answer\nWHILE answer == \"yes\"\n SET stamps = stamps + 1\n INPUT answer\nENDWHILE\nOUTPUT stamps",
      "success": "Counts stamps correctly"
    },
    {
      "id": 19,
      "diff": 4,
      "title": "Even Number Finder",
      "skills": ["loop","selection"],
      "task": "Print all even numbers up to N.",
      "pseudocode": "INPUT n\nFOR i = 1 TO n\n IF i % 2 == 0 THEN\n  OUTPUT i\n ENDIF\nNEXT i",
      "success": "Even numbers correct"
    },
    {
      "id": 20,
      "diff": 4,
      "title": "Guess the Secret Number",
      "skills": ["loop","selection"],
      "task": "Repeat guessing until secret number matched.",
      "pseudocode": "SET secret = 7\nINPUT guess\nWHILE guess != secret\n INPUT guess\nENDWHILE\nOUTPUT \"Correct\"",
      "success": "Stops only when correct"
    },
  
    /* ----------------------------- LEVEL 5 — LISTS / ARRAYS ----------------------------- */
    {
      "id": 21,
      "diff": 5,
      "title": "Store Student Marks",
      "skills": ["list","loop"],
      "task": "Input five marks and output them.",
      "pseudocode": "CREATE list\nFOR i = 1 TO 5\n INPUT mark\n APPEND mark TO list\nNEXT i\nOUTPUT list",
      "success": "Stores 5 marks"
    },
    {
      "id": 22,
      "diff": 5,
      "title": "Average of Marks",
      "skills": ["list","loop"],
      "task": "Calculate average of 5 marks.",
      "pseudocode": "SET total = 0\nFOR i = 1 TO 5\n INPUT mark\n SET total = total + mark\nNEXT i\nSET average = total / 5\nOUTPUT average",
      "success": "Correct average"
    },
    {
      "id": 23,
      "diff": 5,
      "title": "Highest Priority Job",
      "skills": ["list","loop","selection"],
      "task": "Find highest priority value in list.",
      "pseudocode": "INPUT n\nINPUT first\nSET max = first\nFOR i = 2 TO n\n INPUT value\n IF value > max THEN\n  SET max = value\n ENDIF\nNEXT i\nOUTPUT max",
      "success": "Outputs maximum"
    },
    {
      "id": 24,
      "diff": 5,
      "title": "Network Latency Average",
      "skills": ["list","loop"],
      "task": "Average 5 network latency readings.",
      "pseudocode": "SET total = 0\nFOR i = 1 TO 5\n INPUT ping\n SET total = total + ping\nNEXT i\nOUTPUT total / 5",
      "success": "Correct mean latency"
    },
    {
      "id": 25,
      "diff": 5,
      "title": "Count Failed Login Attempts",
      "skills": ["list","loop","selection"],
      "task": "Count login attempts recorded as FAIL.",
      "pseudocode": "SET fails = 0\nFOR i = 1 TO 5\n INPUT result\n IF result == \"FAIL\" THEN\n  SET fails = fails + 1\n ENDIF\nNEXT i\nOUTPUT fails",
      "success": "Counts fail values"
    },
  
    /* ----------------------------- LEVEL 6 — CAPSTONE ----------------------------- */
    {
      "id": 26,
      "diff": 6,
      "title": "Cyber Login Lockout",
      "skills": ["loop","selection"],
      "task": "Block account after 3 wrong attempts.",
      "pseudocode": "SET attempts = 0\nSET pin = 1234\nWHILE attempts < 3\n INPUT guess\n IF guess == pin THEN\n  OUTPUT \"Success\"\n  STOP\n ENDIF\n SET attempts = attempts + 1\nENDWHILE\nOUTPUT \"Locked\"",
      "success": "Locks after 3 tries"
    },
    {
      "id": 27,
      "diff": 6,
      "title": "USB Order Discount System",
      "skills": ["selection","arithmetic"],
      "task": "Apply discount for bulk orders.",
      "pseudocode": "INPUT qty\nSET price = qty * 6\nIF qty >= 20 THEN\n SET price = price * 0.8\nELSE IF qty >= 10 THEN\n SET price = price * 0.9\nENDIF\nOUTPUT price",
      "success": "Correct discount applied"
    },
    {
      "id": 28,
      "diff": 6,
      "title": "Network Cable Cutter",
      "skills": ["loop","arithmetic"],
      "task": "Cut 3m sections from cable and count leftover.",
      "pseudocode": "INPUT total\nSET count = 0\nWHILE total >= 3\n SET total = total - 3\n SET count = count + 1\nENDWHILE\nOUTPUT count\nOUTPUT total",
      "success": "Correct cut count and remainder"
    },
    {
      "id": 29,
      "diff": 6,
      "title": "Backup Storage Filler",
      "skills": ["loop","selection","arithmetic"],
      "task": "Add files until storage reaches 1000MB.",
      "pseudocode": "SET used = 0\nSET files = 0\nWHILE used < 1000\n INPUT size\n SET used = used + size\n SET files = files + 1\nENDWHILE\nOUTPUT used\nOUTPUT files",
      "success": "Stops near capacity"
    },
    {
      "id": 30,
      "diff": 6,
      "title": "Project Task Burndown",
      "skills": ["loop","arithmetic","selection"],
      "task": "Count days until project tasks reach zero.",
      "pseudocode": "INPUT tasks\nSET days = 0\nWHILE tasks > 0\n INPUT done\n SET tasks = tasks - done\n SET days = days + 1\nENDWHILE\nOUTPUT days",
      "success": "Outputs correct day count"
    }
  ]
  ;

  function renderChallengeList() {
    const ul = document.getElementById("challenge-list");
    ul.innerHTML = "";

    FLOWCODE_CHALLENGES.forEach(ch => {
        const li = document.createElement("li");
        li.className = "list-group-item list-group-item-action";
        li.textContent = `#${ch.id} ${ch.title}`;
        li.onclick = () => loadChallenge(ch);
        ul.appendChild(li);
    });
}


let ACTIVE_CHALLENGE = null;
let CHALLENGE_COMPLETED = new Set();

function loadChallenge(ch) {
    document.getElementById("challenge-title").textContent = ch.title;
    document.getElementById("challenge-diff").textContent = "Difficulty " + ch.diff;
    document.getElementById("challenge-task").textContent = ch.task;
    document.getElementById("challenge-detail").textContent = ch.detail;
    document.getElementById("challenge-success").textContent = "Success Criteria: " + ch.success;
    document.getElementById("challenge-code").textContent = ch.pseudocode; // ✅ Fixed
    document.getElementById("challenge-skills").textContent = "Skills: " + ch.skills.join(", ");
    
    // Enable the attempt button and store the challenge
    document.getElementById("btn-attempt-challenge").disabled = false;
    ACTIVE_CHALLENGE = ch;
}

document.getElementById("btn-challenges").addEventListener("click", () => {
    const modal = new bootstrap.Modal(document.getElementById("challengesModal"));
    modal.show();
    renderChallengeList();
});

  document.getElementById("btn-attempt-challenge").addEventListener("click", () => {

    if (!ACTIVE_CHALLENGE) return;
    
    // show banner overlay
    const banner = document.getElementById("active-challenge-banner");
    banner.style.display = "block";
    document.getElementById("active-challenge-text").textContent =
        `#${ACTIVE_CHALLENGE.id} — ${ACTIVE_CHALLENGE.title}`;
        document.getElementById("active-challenge-code").textContent =
        `${ACTIVE_CHALLENGE.pseudocode}`;
    // ★ CLOSE THE MODAL ★
    const modalEl = document.getElementById("challengesModal");
    const modal = bootstrap.Modal.getInstance(modalEl) 
                || new bootstrap.Modal(modalEl);
    modal.hide();
    });
    
    document.getElementById("dismiss-challenge").addEventListener("click", () => {
        document.getElementById("active-challenge-banner").style.display = "none";
    });
    
// === Draggable challenge banner ===
// === Global Draggable Challenge Banner ===
(function () {
    const banner = document.getElementById("active-challenge-banner");
    if (!banner) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    banner.addEventListener("mousedown", (e) => {
        // Prevent dragging when clicking the hide button or the code block
        if (e.target.id === "dismiss-challenge" || e.target.id === "active-challenge-code") return;

        isDragging = true;
        
        // Get current position
        const rect = banner.getBoundingClientRect();
        
        // Calculate where the mouse is relative to the top-left of the banner
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        // When starting a drag, remove the CSS "left: 50% + transform" centering
        // and replace it with fixed pixel coordinates
        banner.style.left = rect.left + "px";
        banner.style.top = rect.top + "px";
        banner.style.transform = "none"; 
        banner.style.margin = "0";

        document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;

        // Calculate new X and Y
        let x = e.clientX - offsetX;
        let y = e.clientY - offsetY;

        // Keep the banner inside the browser window edges
        const maxX = window.innerWidth - banner.offsetWidth - 10;
        const maxY = window.innerHeight - banner.offsetHeight - 10;

        x = Math.max(10, Math.min(x, maxX));
        y = Math.max(10, Math.min(y, maxY));

        banner.style.left = x + "px";
        banner.style.top = y + "px";
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
        document.body.style.userSelect = "";
    });
})();

        // Show welcome modal on first visit
        document.addEventListener("DOMContentLoaded", function () {
        const welcomeScreen = document.getElementById('welcome-screen');
        const closeBtn = document.getElementById("welcomeCloseBtn");
        const dontShowCheck = document.getElementById("dontShowAgainCheck");
    
        // Check localStorage
        if (localStorage.getItem("hideWelcomeModal") === "true") {
            welcomeScreen.style.display = "none";
        } else {
            // Prevent background scrolling while welcome is visible
            document.body.style.overflow = "hidden";
        }
    
        closeBtn.onclick = function () {
            if (dontShowCheck.checked) {
                localStorage.setItem("hideWelcomeModal", "true");
            }
            
            // Smooth transition out
            welcomeScreen.style.opacity = "0";
            setTimeout(() => {
                welcomeScreen.style.display = "none";
                document.body.style.overflow = "auto"; // Re-enable scrolling
            }, 400);
        };
    });
});
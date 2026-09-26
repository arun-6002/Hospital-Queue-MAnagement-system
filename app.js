/* =========================================================================
   PulseCare Hospital Queue Management System
   Core Data Structures & Algorithms — implemented from scratch in vanilla JS
   (mirrors the C++ classes in cpp_version/)
   ========================================================================= */

/* ---------------------------- 1. PATIENT MODEL --------------------------- */
let nextId = 1001;
function makePatient(name, age, gender, symptom, severity, queueType){
  return {
    id: nextId++,
    name, age, gender, symptom, severity: Number(severity),
    queueType,                       // 'emergency' | 'opd'
    status: 'waiting',               // waiting | in-consult | treated
    doctorAssigned: null,
    arrivalOrder: Date.now(),
    estWait: Math.floor(Math.random()*40) + 5,   // minutes, simulated
    dpCost: severity >= 5 ? 3 : severity >= 3 ? 2 : 1,
    dpUtility: Number(severity) * 20
  };
}

/* ---------------------------- 2. BINARY MAX-HEAP -------------------------
   Array-backed priority queue. Priority = severity (desc), tie-broken by
   earlier arrival. O(log n) insert / extract via heapifyUp / heapifyDown.  */
class PriorityQueueHeap{
  constructor(){ this.arr = []; }
  size(){ return this.arr.length; }
  isEmpty(){ return this.arr.length === 0; }
  higherPriority(a,b){
    if(a.severity !== b.severity) return a.severity > b.severity;
    return a.arrivalOrder < b.arrivalOrder;
  }
  insert(patient){
    this.arr.push(patient);
    this.heapifyUp(this.arr.length-1);
  }
  heapifyUp(i){
    while(i > 0){
      const parent = Math.floor((i-1)/2);
      if(this.higherPriority(this.arr[i], this.arr[parent])){
        [this.arr[i], this.arr[parent]] = [this.arr[parent], this.arr[i]];
        i = parent;
      } else break;
    }
  }
  extractMax(){
    if(this.isEmpty()) return null;
    const top = this.arr[0];
    const last = this.arr.pop();
    if(this.arr.length > 0){ this.arr[0] = last; this.heapifyDown(0); }
    return top;
  }
  heapifyDown(i){
    const n = this.arr.length;
    while(true){
      let largest = i, l = 2*i+1, r = 2*i+2;
      if(l < n && this.higherPriority(this.arr[l], this.arr[largest])) largest = l;
      if(r < n && this.higherPriority(this.arr[r], this.arr[largest])) largest = r;
      if(largest === i) break;
      [this.arr[i], this.arr[largest]] = [this.arr[largest], this.arr[i]];
      i = largest;
    }
  }
}

/* ---------------------------- 3. SINGLY LINKED LIST QUEUE ----------------
   FIFO queue for the OPD registration flow. O(1) enqueue (tail) / dequeue (head). */
class ListNode{ constructor(data){ this.data = data; this.next = null; } }
class StandardQueue{
  constructor(){ this.head = null; this.tail = null; this.count = 0; }
  size(){ return this.count; }
  isEmpty(){ return this.count === 0; }
  enqueue(patient){
    const node = new ListNode(patient);
    if(!this.head){ this.head = this.tail = node; }
    else { this.tail.next = node; this.tail = node; }
    this.count++;
  }
  dequeue(){
    if(!this.head) return null;
    const node = this.head;
    this.head = this.head.next;
    if(!this.head) this.tail = null;
    this.count--;
    return node.data;
  }
  toArray(){
    const out = []; let cur = this.head;
    while(cur){ out.push(cur.data); cur = cur.next; }
    return out;
  }
}

/* ---------------------------- 4. ACTION STACK -----------------------------
   Classic LIFO stack backing the History Terminal / undo log. */
class ActionStack{
  constructor(){ this.items = []; }
  push(entry){ this.items.push({ text: entry, time: new Date() }); }
  pop(){ return this.items.pop() || null; }
  peek(){ return this.items[this.items.length-1] || null; }
  toArray(){ return this.items.slice().reverse(); }
}

/* ---------------------------- 5. BINARY SEARCH TREE -----------------------
   Indexes patients by ID for O(log n) average lookup. Recursive insert/search. */
class BSTNode{
  constructor(patient){ this.patient = patient; this.left = null; this.right = null; }
}
class PatientBST{
  constructor(){ this.root = null; }
  insert(patient){ this.root = this._insert(this.root, patient); }
  _insert(node, patient){
    if(!node) return new BSTNode(patient);
    if(patient.id < node.patient.id) node.left = this._insert(node.left, patient);
    else node.right = this._insert(node.right, patient);
    return node;
  }
  // returns { found: BSTNode|null, path: BSTNode[] } tracing the recursive descent
  search(id){
    const path = [];
    let cur = this.root;
    while(cur){
      path.push(cur);
      if(id === cur.patient.id) return { found: cur, path };
      cur = id < cur.patient.id ? cur.left : cur.right;
    }
    return { found: null, path };
  }
  inorder(){
    const out = [];
    const walk = (n) => { if(!n) return; walk(n.left); out.push(n.patient); walk(n.right); };
    walk(this.root);
    return out;
  }
}

/* ---------------------------- 6. HOSPITAL GRAPH + DIJKSTRA ----------------- */
const GRAPH_NODES = ['Reception','Triage Room','General OPD','Pathology Lab','Cardiology','Pharmacy'];
const GRAPH_POS = {
  'Reception':    {x:450, y:45},
  'Triage Room':  {x:190, y:150},
  'General OPD':  {x:710, y:150},
  'Pathology Lab':{x:450, y:230},
  'Cardiology':   {x:150, y:325},
  'Pharmacy':     {x:670, y:325},
};
const GRAPH_EDGES = [
  ['Reception','Triage Room', 5],
  ['Reception','General OPD', 8],
  ['Triage Room','Cardiology', 6],
  ['Triage Room','Pathology Lab', 4],
  ['General OPD','Pharmacy', 3],
  ['General OPD','Pathology Lab', 5],
  ['Cardiology','Pharmacy', 7],
  ['Pathology Lab','Pharmacy', 2],
  ['Cardiology','General OPD', 9],
];
class HospitalGraph{
  constructor(nodes, edges){
    this.adj = {};
    nodes.forEach(n => this.adj[n] = []);
    edges.forEach(([a,b,w]) => { this.adj[a].push([b,w]); this.adj[b].push([a,w]); });
  }
  dijkstra(start, end){
    const dist = {}, prev = {}, visited = new Set();
    Object.keys(this.adj).forEach(n => dist[n] = Infinity);
    dist[start] = 0;
    const pq = [[0, start]];
    while(pq.length){
      pq.sort((a,b) => a[0]-b[0]);
      const [d, u] = pq.shift();
      if(visited.has(u)) continue;
      visited.add(u);
      if(u === end) break;
      for(const [v, w] of this.adj[u]){
        const nd = d + w;
        if(nd < dist[v]){ dist[v] = nd; prev[v] = u; pq.push([nd, v]); }
      }
    }
    const path = [];
    let cur = end;
    if(dist[end] === Infinity) return { path: [], dist: Infinity };
    while(cur !== undefined){ path.unshift(cur); cur = prev[cur]; }
    return { path, dist: dist[end] };
  }
}
const hospitalGraph = new HospitalGraph(GRAPH_NODES, GRAPH_EDGES);

/* ---------------------------- 7. DP: 0/1 KNAPSACK KIT ALLOCATION ---------- */
function knapsackAllocate(items, budget){
  const n = items.length;
  const dp = Array.from({length:n+1}, () => new Array(budget+1).fill(0));
  for(let i=1;i<=n;i++){
    const {dpCost:cost, dpUtility:val} = items[i-1];
    for(let c=0;c<=budget;c++){
      dp[i][c] = dp[i-1][c];
      if(cost <= c) dp[i][c] = Math.max(dp[i][c], dp[i-1][c-cost] + val);
    }
  }
  // backtrack
  const selected = [];
  let c = budget;
  for(let i=n;i>0;i--){
    if(dp[i][c] !== dp[i-1][c]){
      selected.push(items[i-1]);
      c -= items[i-1].dpCost;
    }
  }
  return { dp, selected: selected.reverse(), maxValue: dp[n][budget] };
}

/* ---------------------------- 8. SORTING (Quick / Merge) ------------------ */
function quickSort(arr, key, desc){
  if(arr.length <= 1) return arr;
  const pivot = arr[Math.floor(arr.length/2)][key];
  const less = [], equal = [], greater = [];
  for(const item of arr){
    if(item[key] < pivot) less.push(item);
    else if(item[key] > pivot) greater.push(item);
    else equal.push(item);
  }
  const sortedAsc = [...quickSort(less,key,desc), ...equal, ...quickSort(greater,key,desc)];
  return desc ? [...quickSort(greater,key,desc), ...equal, ...quickSort(less,key,desc)] : sortedAsc;
}
function mergeSort(arr, key, desc){
  if(arr.length <= 1) return arr;
  const mid = Math.floor(arr.length/2);
  const left = mergeSort(arr.slice(0,mid), key, desc);
  const right = mergeSort(arr.slice(mid), key, desc);
  const merged = [];
  let i=0,j=0;
  while(i<left.length && j<right.length){
    const cond = desc ? left[i][key] >= right[j][key] : left[i][key] <= right[j][key];
    merged.push(cond ? left[i++] : right[j++]);
  }
  return [...merged, ...left.slice(i), ...right.slice(j)];
}

/* ========================================================================
   APPLICATION STATE
   ======================================================================== */
const heap = new PriorityQueueHeap();
const opdQueue = new StandardQueue();
const bst = new PatientBST();
const stack = new ActionStack();
const allPatients = [];
const doctors = [
  { name:'Dr. Chen', specialty:'Cardiology', status:'free', currentPatient:null },
  { name:'Dr. Patel', specialty:'General Medicine', status:'free', currentPatient:null },
  { name:'Dr. Nair', specialty:'Emergency', status:'free', currentPatient:null },
  { name:'Dr. Rao', specialty:'Orthopedics', status:'free', currentPatient:null },
];

/* ========================================================================
   RENDER: STATS / DOCTORS / TERMINAL
   ======================================================================== */
function updateStats(){
  const treated = allPatients.filter(p => p.status === 'treated').length;
  const waiting = heap.size() + opdQueue.size();
  const waitingPatients = allPatients.filter(p => p.status === 'waiting');
  const avgWait = waitingPatients.length
    ? Math.round(waitingPatients.reduce((s,p)=>s+p.estWait,0) / waitingPatients.length)
    : 0;
  document.getElementById('statTotal').textContent = allPatients.length;
  document.getElementById('statTreated').textContent = treated;
  document.getElementById('statWaiting').textContent = waiting;
  document.getElementById('statWait').innerHTML = avgWait + '<small>m</small>';
}

function renderCabins(){
  const box = document.getElementById('cabinList');
  box.innerHTML = doctors.map(d => `
    <div class="cabin-card ${d.status}">
      <div>
        <div class="cabin-name">${d.name}</div>
        <div class="cabin-specialty">${d.specialty}${d.currentPatient ? ' — with ' + d.currentPatient.name : ''}</div>
      </div>
      <span class="cabin-status ${d.status}">${d.status === 'free' ? 'Available' : 'In Session'}</span>
    </div>`).join('');
}

function renderTerminal(){
  const box = document.getElementById('terminalLog');
  box.innerHTML = stack.toArray().slice(0,40).map(e =>
    `<div><span class="t-time">${e.time.toLocaleTimeString()}</span>${escapeHtml(e.text)}</div>`
  ).join('');
}
function escapeHtml(s){ return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function logAction(text){
  stack.push(text);
  renderTerminal();
}

/* ========================================================================
   RENDER: HEAP (SVG binary tree from array)
   ======================================================================== */
const sevColor = s => ({1:'var(--sev-1)',2:'var(--sev-2)',3:'var(--sev-3)',4:'var(--sev-4)',5:'var(--sev-5)'}[s] || 'var(--sev-3)');

function renderHeap(){
  const svg = document.getElementById('heapSvg');
  const arr = heap.arr;
  if(arr.length === 0){ svg.innerHTML = emptyMsg('Heap is empty — register an Emergency patient.'); return; }
  const levels = Math.floor(Math.log2(arr.length)) + 1;
  const W = 900, H = 380, topMargin = 40, levelGap = (H-80)/Math.max(levels-1,1);
  let svgStr = '';
  const coords = [];
  for(let i=0;i<arr.length;i++){
    const level = Math.floor(Math.log2(i+1));
    const idxInLevel = i - (Math.pow(2,level)-1);
    const slots = Math.pow(2, level);
    const x = W * (idxInLevel+1)/(slots+1);
    const y = topMargin + level*levelGap;
    coords.push({x,y});
  }
  // edges first
  for(let i=1;i<arr.length;i++){
    const parent = Math.floor((i-1)/2);
    svgStr += `<line class="edge-line" x1="${coords[parent].x}" y1="${coords[parent].y}" x2="${coords[i].x}" y2="${coords[i].y}" />`;
  }
  // nodes
  for(let i=0;i<arr.length;i++){
    const p = arr[i];
    const rootClass = (i===0 && p.severity===5) ? 'heap-root-pulse' : '';
    svgStr += `<g class="${rootClass}">
      <circle class="node-circle" cx="${coords[i].x}" cy="${coords[i].y}" r="24" fill="${sevColor(p.severity)}" fill-opacity="0.22" stroke="${sevColor(p.severity)}" />
      <text class="node-text" x="${coords[i].x}" y="${coords[i].y-2}">${p.id}</text>
      <text class="node-sub" x="${coords[i].x}" y="${coords[i].y+11}">S${p.severity}</text>
    </g>`;
  }
  svg.innerHTML = svgStr;
}

function emptyMsg(msg){
  return `<text x="450" y="190" text-anchor="middle" fill="var(--text-faint)" font-family="Inter" font-size="13">${msg}</text>`;
}

/* ========================================================================
   RENDER: OPD LINKED LIST
   ======================================================================== */
function renderList(){
  const svg = document.getElementById('listSvg');
  const arr = opdQueue.toArray();
  if(arr.length === 0){ svg.innerHTML = emptyMsg('OPD queue is empty — register an OPD patient.'); return; }
  const boxW = 130, gap = 46, startX = 30, y = 90;
  let svgStr = '';
  arr.forEach((p, i) => {
    const x = startX + i*(boxW+gap);
    svgStr += `<g>
      <rect x="${x}" y="${y}" width="${boxW}" height="60" rx="10" fill="rgba(56,189,248,0.08)" stroke="var(--blue)" stroke-width="1.5"/>
      <text class="node-text" x="${x+boxW/2}" y="${y+24}" fill="#e7edf5">#${p.id} ${p.name.split(' ')[0]}</text>
      <text class="node-sub" x="${x+boxW/2}" y="${y+42}">Sev ${p.severity} · ${p.age}y</text>
    </g>`;
    if(i < arr.length-1){
      const x2 = x + boxW;
      svgStr += `<line class="edge-line" x1="${x2}" y1="${y+30}" x2="${x2+gap-6}" y2="${y+30}" marker-end="url(#arrow)" />`;
    }
  });
  svgStr = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
    <path d="M0,0 L8,4 L0,8 z" fill="var(--blue)" /></marker></defs>` + svgStr;
  svgStr += `<text x="${startX}" y="70" class="node-sub" fill="var(--text-dim)">HEAD</text>`;
  svg.innerHTML = svgStr;
}

/* ========================================================================
   RENDER: BST
   ======================================================================== */
function renderBST(highlightPath){
  const svg = document.getElementById('bstSvg');
  if(!bst.root){ svg.innerHTML = emptyMsg('BST is empty — register a patient to index by ID.'); return; }
  // assign x via inorder index, y via depth
  const positions = new Map();
  let counter = 0;
  const totalW = 900;
  const countNodes = (n) => n ? 1 + countNodes(n.left) + countNodes(n.right) : 0;
  const total = countNodes(bst.root);
  const walk = (n, depth) => {
    if(!n) return;
    walk(n.left, depth+1);
    const x = totalW * (counter+1) / (total+1);
    positions.set(n, { x, y: 50 + depth*70 });
    counter++;
    walk(n.right, depth+1);
  };
  walk(bst.root, 0);

  let svgStr = '';
  const drawEdges = (n) => {
    if(!n) return;
    const pos = positions.get(n);
    if(n.left){ const c = positions.get(n.left); svgStr += `<line class="edge-line" x1="${pos.x}" y1="${pos.y}" x2="${c.x}" y2="${c.y}" />`; drawEdges(n.left); }
    if(n.right){ const c = positions.get(n.right); svgStr += `<line class="edge-line" x1="${pos.x}" y1="${pos.y}" x2="${c.x}" y2="${c.y}" />`; drawEdges(n.right); }
  };
  drawEdges(bst.root);

  const highlightSet = new Set(highlightPath || []);
  positions.forEach((pos, n) => {
    const isHi = highlightSet.has(n);
    svgStr += `<g>
      <circle class="node-circle" cx="${pos.x}" cy="${pos.y}" r="22"
        fill="${isHi ? 'rgba(56,189,248,0.3)' : 'rgba(45,212,191,0.14)'}"
        stroke="${isHi ? 'var(--blue)' : 'var(--teal)'}" />
      <text class="node-text" x="${pos.x}" y="${pos.y+4}">${n.patient.id}</text>
    </g>`;
  });
  svg.innerHTML = svgStr;
  return positions;
}

async function traceBstSearch(id){
  const { found, path } = bst.search(id);
  const positions = renderBST();
  if(!positions){ return; }
  for(const node of path){
    const pos = positions.get(node);
    const circle = [...document.querySelectorAll('#bstSvg circle')].find(c =>
      Math.abs(parseFloat(c.getAttribute('cx')) - pos.x) < 0.5 && Math.abs(parseFloat(c.getAttribute('cy')) - pos.y) < 0.5);
    if(circle){
      circle.parentElement.classList.add('node-flash');
      circle.setAttribute('stroke', 'var(--blue)');
      circle.setAttribute('fill', 'rgba(56,189,248,0.35)');
    }
    await sleep(420);
  }
  logAction(found ? `BST search: patient ${id} FOUND in ${path.length} step(s)` : `BST search: patient ${id} NOT FOUND (${path.length} step(s) traced)`);
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

/* ========================================================================
   RENDER: HOSPITAL GRAPH
   ======================================================================== */
function renderGraph(highlightPath){
  const svg = document.getElementById('graphSvg');
  const hiEdges = new Set();
  if(highlightPath){
    for(let i=0;i<highlightPath.length-1;i++) hiEdges.add(highlightPath[i]+'|'+highlightPath[i+1]);
  }
  let svgStr = '';
  GRAPH_EDGES.forEach(([a,b,w]) => {
    const pa = GRAPH_POS[a], pb = GRAPH_POS[b];
    const isHi = hiEdges.has(a+'|'+b) || hiEdges.has(b+'|'+a);
    svgStr += `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"
      stroke="${isHi ? 'var(--blue)' : 'rgba(255,255,255,0.18)'}" stroke-width="${isHi?3:1.6}"
      style="${isHi ? 'filter:drop-shadow(0 0 6px var(--blue));' : ''}" />`;
    svgStr += `<text class="edge-label" x="${(pa.x+pb.x)/2}" y="${(pa.y+pb.y)/2 - 6}">${w}</text>`;
  });
  const hiNodes = new Set(highlightPath || []);
  GRAPH_NODES.forEach(n => {
    const p = GRAPH_POS[n];
    const isHi = hiNodes.has(n);
    svgStr += `<g>
      <circle class="node-circle" cx="${p.x}" cy="${p.y}" r="30" fill="${isHi ? 'rgba(56,189,248,0.3)' : 'rgba(255,255,255,0.05)'}" stroke="${isHi ? 'var(--blue)' : 'var(--panel-border)'}" />
      <text class="node-sub" x="${p.x}" y="${p.y+4}" fill="#fff" font-size="10">${n}</text>
    </g>`;
  });
  svg.innerHTML = svgStr;
}

/* ========================================================================
   RENDER: DP TABLE
   ======================================================================== */
function renderDP(items, budget){
  const { dp, selected, maxValue } = knapsackAllocate(items, budget);
  const out = document.getElementById('dpOutput');
  let html = `<div class="dp-summary">
    <span class="chip">Budget: ${budget} kits</span>
    <span class="chip">Patients considered: ${items.length}</span>
    <span class="chip">Max utility achieved: ${maxValue}</span>
    <span class="chip">Kits selected: ${selected.length}</span>
  </div>`;
  html += `<h3 style="font-family:var(--font-display);font-size:14px;margin:14px 0 6px;">Optimal Allocation</h3>`;
  html += selected.map(p => `<div class="patient-list-item">
      <span>#${p.id} ${p.name}</span>
      <span class="mono-tag">sev ${p.severity} · cost ${p.dpCost} · util ${p.dpUtility}</span>
    </div>`).join('') || '<p class="panel-sub">No items fit the budget.</p>';

  if(items.length <= 12 && budget <= 20){
    html += `<h3 style="font-family:var(--font-display);font-size:14px;margin:16px 0 6px;">DP State Table (rows = patients, cols = kit budget)</h3>`;
    html += '<div style="overflow-x:auto;"><table class="dp-table"><tr><th>i \\ c</th>' +
      Array.from({length:budget+1},(_,c)=>`<th>${c}</th>`).join('') + '</tr>';
    for(let i=0;i<dp.length;i++){
      html += `<tr><th>${i===0?'-':'#'+items[i-1].id}</th>` +
        dp[i].map((v,c) => `<td class="${i>0 && dp[i][c]!==dp[i-1][c] ? 'selected':''}">${v}</td>`).join('') + '</tr>';
    }
    html += '</table></div>';
  }
  out.innerHTML = html;
}

/* ========================================================================
   RENDER: SORT OUTPUT
   ======================================================================== */
function renderSort(key, algo){
  const desc = key === 'severity';
  const copy = allPatients.slice();
  const sorted = algo === 'quick' ? quickSort(copy, key, desc) : mergeSort(copy, key, desc);
  const out = document.getElementById('sortOutput');
  if(sorted.length === 0){ out.innerHTML = '<p class="panel-sub">No patient records yet.</p>'; return; }
  out.innerHTML = `<p class="panel-sub">${algo === 'quick' ? 'Quick Sort' : 'Merge Sort'} by <b>${key}</b> — O(n log n) average.</p>` +
    sorted.map((p,i) => `<div class="patient-list-item">
      <span>${i+1}. #${p.id} ${p.name}</span>
      <span class="mono-tag">${key}: ${p[key] !== undefined ? p[key] : ''}</span>
    </div>`).join('');
}

/* ========================================================================
   EVENT WIRING
   ======================================================================== */
function renderActiveTab(){
  const active = document.querySelector('.tab.active').dataset.tab;
  if(active === 'heap') renderHeap();
  else if(active === 'list') renderList();
  else if(active === 'bst') renderBST();
  else if(active === 'graph') renderGraph();
}

document.getElementById('tabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if(!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  renderActiveTab();
});

const fSeverity = document.getElementById('fSeverity');
const severityLabels = {1:'Minor',2:'Low',3:'Moderate',4:'Serious',5:'Critical'};
fSeverity.addEventListener('input', () => {
  const v = fSeverity.value;
  const out = document.getElementById('severityOut');
  out.textContent = `${v} — ${severityLabels[v]}`;
  out.className = 'sev-badge sev-' + v;
});

document.getElementById('patientForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('fName').value.trim();
  const age = document.getElementById('fAge').value;
  const gender = document.getElementById('fGender').value;
  const symptom = document.getElementById('fSymptom').value.trim();
  const severity = document.getElementById('fSeverity').value;
  const queueType = document.getElementById('fQueueType').value;
  const patient = makePatient(name, age, gender, symptom, severity, queueType);

  if(queueType === 'emergency') heap.insert(patient);
  else opdQueue.enqueue(patient);
  bst.insert(patient);
  allPatients.push(patient);

  logAction(`Registered #${patient.id} ${patient.name} → ${queueType === 'emergency' ? 'Emergency Heap' : 'OPD Queue'} (sev ${patient.severity})`);
  updateStats();
  renderActiveTab();
  e.target.reset();
  fSeverity.value = 3;
  document.getElementById('severityOut').textContent = '3 — Moderate';
  document.getElementById('severityOut').className = 'sev-badge sev-3';
});

document.getElementById('btnConsult').addEventListener('click', () => {
  let patient = null;
  if(!heap.isEmpty()) patient = heap.extractMax();
  else if(!opdQueue.isEmpty()) patient = opdQueue.dequeue();
  if(!patient){ logAction('Consult attempted — both queues are empty'); renderTerminal(); return; }

  const doctor = doctors.find(d => d.status === 'free');
  if(!doctor){ logAction(`#${patient.id} ${patient.name} extracted but no doctor is free — re-queued`); 
    if(patient.queueType === 'emergency') heap.insert(patient); else opdQueue.enqueue(patient);
    renderActiveTab(); return;
  }
  patient.status = 'in-consult';
  patient.doctorAssigned = doctor.name;
  doctor.status = 'busy';
  doctor.currentPatient = patient;
  logAction(`${doctor.name} is now consulting #${patient.id} ${patient.name}`);
  renderCabins(); updateStats(); renderActiveTab();

  setTimeout(() => {
    patient.status = 'treated';
    doctor.status = 'free';
    doctor.currentPatient = null;
    logAction(`#${patient.id} ${patient.name} treated & discharged by ${doctor.name}`);
    renderCabins(); updateStats();
  }, 4000);
});

document.getElementById('btnUndo').addEventListener('click', () => {
  const popped = stack.pop();
  if(!popped){ return; }
  renderTerminal();
  logAction(`Undo: cleared log entry — "${popped.text}"`);
});

document.getElementById('btnBstSearch').addEventListener('click', () => {
  const id = parseInt(document.getElementById('bstSearchId').value, 10);
  if(!id) return;
  traceBstSearch(id);
});

const graphDest = document.getElementById('graphDest');
GRAPH_NODES.filter(n => n !== 'Reception').forEach(n => {
  const opt = document.createElement('option'); opt.value = n; opt.textContent = n;
  graphDest.appendChild(opt);
});
document.getElementById('btnGraphRoute').addEventListener('click', () => {
  const dest = graphDest.value;
  const { path, dist } = hospitalGraph.dijkstra('Reception', dest);
  renderGraph(path);
  document.getElementById('graphResult').textContent = path.length
    ? `${path.join(' → ')}  (distance: ${dist})`
    : 'No path found';
  logAction(`Dijkstra: Reception → ${dest} = ${dist} units via ${path.join(' > ')}`);
});

document.getElementById('btnDpRun').addEventListener('click', () => {
  const budget = Math.max(1, parseInt(document.getElementById('dpBudget').value, 10) || 10);
  const items = allPatients.length ? allPatients.filter(p => p.status !== 'treated') : demoPatients();
  renderDP(items, budget);
  logAction(`DP Knapsack: allocated kits across ${items.length} patients with budget ${budget}`);
});

document.getElementById('btnSortRun').addEventListener('click', () => {
  renderSort(document.getElementById('sortKey').value, document.getElementById('sortAlgo').value);
  logAction(`Sorted patient records by ${document.getElementById('sortKey').value} using ${document.getElementById('sortAlgo').value === 'quick' ? 'Quick Sort' : 'Merge Sort'}`);
});

function demoPatients(){
  return [
    makePatient('Amit Sharma',45,'Male','Fracture',3,'opd'),
    makePatient('Priya Singh',29,'Female','Chest pain',5,'emergency'),
    makePatient('Rohan Das',62,'Male','Breathing difficulty',4,'emergency'),
    makePatient('Sneha Rao',8,'Female','Fever',2,'opd'),
    makePatient('Vikram Iyer',34,'Male','Laceration',3,'opd'),
    makePatient('Anjali Nair',71,'Female','Stroke symptoms',5,'emergency'),
  ];
}

/* ---------------------------- INITIAL RENDER ------------------------------ */
renderCabins();
renderTerminal();
updateStats();
renderHeap();
logAction('System initialized — 4 doctor cabins online');

const fs = require('fs');
const path = 'c:/Users/dietr/Downloads/CivilMate Pro corregido/civilmate Pro EBA/contracts.html';
let data = fs.readFileSync(path, 'utf8');

const headImports = `
    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
`;

if(!data.includes('firebase-app-compat')) {
    data = data.replace('</head>', headImports + '\n</head>');
}

const newScript = `
        const firebaseConfig = { apiKey: "AIzaSyClWpKp8f0axjSEJrnJMKa6jUrerhyrC4A", authDomain: "civilmate-pro.firebaseapp.com", projectId: "civilmate-pro", storageBucket: "civilmate-pro.firebasestorage.app", messagingSenderId: "674522561149", appId: "1:674522561149:web:4e55096c4f8d72f142cf14" };
        if(!window.firebase || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        let currentTab = 'registry';
        let currentProjectId = localStorage.getItem('civilmate_current_project_id');
        let loadedProjects = [];
        let currentUserUid = null;

        firebase.auth().onAuthStateChanged(user => {
            if(user) {
                currentUserUid = user.uid;
                init();
            } else {
                window.location.replace('index.html');
            }
        });

        function init() {
            loadRegistry();
        }

        function switchTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('tab-' + tabId).classList.add('active');
            document.getElementById('view-registry').classList.add('hidden');
            document.getElementById('view-viewer').classList.add('hidden');
            document.getElementById('view-' + tabId).classList.remove('hidden');
            if (tabId === 'registry') loadRegistry();
        }

        async function loadRegistry() {
            const tbody = document.getElementById('registryTable');
            tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400 italic"><i class="fas fa-spinner fa-spin mr-2"></i> Loading approved contracts from Cloud...</td></tr>';

            try {
                const snap = await db.collection("tenants").doc(currentUserUid).collection("budgets").get();
                loadedProjects = [];
                
                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.status === 'Approved') {
                        loadedProjects.push({ id: doc.id, ...data });
                    }
                });

                if (loadedProjects.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400 italic">No approved contracts found. Approve a quote in the Estimator to see it here.</td></tr>';
                    return;
                }

                loadedProjects.sort((a, b) => (b.finalizedAt || 0) - (a.finalizedAt || 0));

                tbody.innerHTML = '';
                loadedProjects.forEach(p => {
                    const date = p.finalizedAt ? new Date(p.finalizedAt).toLocaleDateString() : 'Draft';
                    const totalVal = p.items ? p.items.reduce((acc, i) => acc + (Number(i.qty || 0) * Number(i.rate || 0)), 0) : 0;
                    
                    tbody.innerHTML += \`
                        <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0">
                            <td class="p-4">
                                <div class="font-bold text-slate-800">\${p.clientName || 'Untitled'}</div>
                                <div class="text-[10px] text-slate-400 uppercase">\${p.name || ''}</div>
                            </td>
                            <td class="p-4 text-xs text-slate-500">\${date}</td>
                            <td class="p-4 text-right font-bold text-slate-700">$\${totalVal.toLocaleString('en-NZ', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                            <td class="p-4 text-center">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase \${p.status === 'Approved' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-600'}">\${p.status}</span>
                            </td>
                            <td class="p-4 text-center">
                                <div class="flex justify-center gap-2">
                                    <button onclick="viewDocument('\${p.id}')" class="px-3 py-1 bg-white border rounded text-[10px] font-bold hover:bg-slate-50">VIEW DOC</button>
                                    <button onclick="localStorage.setItem('civilmate_current_project_id', '\${p.id}'); window.location.href='project_hub.html'" class="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700">MANAGE</button>
                                </div>
                            </td>
                        </tr>\`;
                });

                if (currentProjectId && currentProjectId !== 'null') {
                    const existing = loadedProjects.find(proj => proj.id === currentProjectId);
                    if(existing) viewDocument(currentProjectId);
                }

            } catch (e) {
                console.error("Error loading registry:", e);
                tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-red-500 italic">Error connecting to database.</td></tr>';
            }
        }

        function viewDocument(id) {
            localStorage.setItem('civilmate_current_project_id', id);
            const p = loadedProjects.find(proj => proj.id === id);
            if (!p) return;

            switchTab('viewer');
            const cont = document.getElementById('viewerContent');
            
            const totalVal = p.items ? p.items.reduce((acc, i) => acc + (Number(i.qty || 0) * Number(i.rate || 0)), 0) : 0;
            
            cont.innerHTML = \`
                <div class="border-b-4 border-slate-800 pb-6 mb-8 flex justify-between items-start">
                    <div>
                        <h1 class="text-3xl font-bold text-slate-800 uppercase tracking-widest">Construction Contract</h1>
                        <p class="text-sm text-slate-500 mt-1">Ref: #CON-\${p.id.slice(0, 6).toUpperCase()}</p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-xl" id="contractClientName">\${p.clientName || 'N/A'}</p>
                        <p class="text-[10px] font-bold text-slate-400 uppercase mt-4">Contractor</p>
                        <p class="font-bold text-lg" id="contractorName">CivilMate Enterprise</p>
                        <p class="text-sm text-slate-500">\${p.address || ''}</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-8 mb-10">
                    <div class="p-4 bg-slate-50 rounded-xl">
                        <h4 class="text-[10px] font-bold text-slate-400 uppercase mb-2">Contract Value</h4>
                        <p class="text-3xl font-bold text-slate-900">$\${totalVal.toLocaleString('en-NZ', {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
                    </div>
                    <div class="p-4 bg-slate-50 rounded-xl">
                        <h4 class="text-[10px] font-bold text-slate-400 uppercase mb-2">Status</h4>
                        <p class="text-3xl font-bold text-green-600">ACTIVE</p>
                    </div>
                </div>
                
                <table class="w-full text-left text-sm mb-10">
                    <thead class="border-b-2 border-slate-200">
                        <tr><th class="py-2">Scope of Work</th><th class="py-2 text-right">Amount</th></tr>
                    </thead>
                    <tbody class="divide-y">
                        \${(p.items || []).map(i => {
                            const rowBase = (Number(i.qty || 0) * Number(i.rate || 0));
                            return \`<tr><td class="py-3">\${i.desc}</td><td class="py-3 text-right font-bold">$\${rowBase.toLocaleString('en-NZ', {minimumFractionDigits:2, maximumFractionDigits:2})}</td></tr>\`;
                        }).join('')}
                    </tbody>
                </table>
                <div class="mt-20 pt-10 border-t border-slate-200 grid grid-cols-2 gap-20">
                    <div><div class="border-b border-black h-8"></div><p class="text-[10px] font-bold mt-2">CLIENT SIGNATURE</p></div>
                    <div><div class="border-b border-black h-8"></div><p class="text-[10px] font-bold mt-2">CONTRACTOR SIGNATURE</p></div>
                </div>
            \`;

            // Apply Dynamic Branding
            const settings = JSON.parse(localStorage.getItem('civilmate_settings') || '{}');
            const contractorName = settings.companyName || 'CivilMate Enterprise';
            const el = document.getElementById('contractorName');
            if (el) el.innerText = contractorName;
        }
`;

const startIndex = data.lastIndexOf('<script>');
const endIndex = data.lastIndexOf('</script>');

data = data.substring(0, startIndex + '<script>'.length) + '\n' + newScript + '\n' + data.substring(endIndex);

fs.writeFileSync(path, data);
console.log("Contracts updated to Firebase");

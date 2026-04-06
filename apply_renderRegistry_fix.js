const fs = require('fs');
const path = 'c:/Users/dietr/Downloads/CivilMate Pro corregido/civilmate Pro EBA/valuations.html';
let data = fs.readFileSync(path, 'utf8');

const newRenderReg = `
async function renderRegistry() {
    const list = document.getElementById('contractList');
    if (!list) return; // Prevent crash if element doesn't exist
    list.innerHTML = '<p class="text-slate-400 p-4"><i class="fas fa-spinner fa-spin mr-2"></i>Loading contracts from Cloud...</p>';

    const user = firebase.auth() ? firebase.auth().currentUser : null;
    if(!user) return;
    const uid = user.uid;

    try {
        const db = firebase.firestore();
        // Traer todos los presupuestos para evitar problemas de índices en Firebase
        const snap = await db.collection("tenants").doc(uid).collection("budgets").get();
        
        let localContracts = [];
        snap.forEach(doc => {
            const data = doc.data();
            // Filtro manual estricto en el cliente
            if (data.status === 'Approved') {
                localContracts.push({ id: doc.id, ...data });
            }
        });

        if(localContracts.length === 0) {
            list.innerHTML = \`<div class="p-4 bg-yellow-900/20 text-yellow-500 border border-yellow-700 rounded font-bold"><i class="fas fa-exclamation-triangle mr-2"></i> No approved contracts found in the Cloud. Go to Budgets and approve a project first.</div>\`;
            return;
        }

        if (typeof contracts !== 'undefined') { contracts = localContracts; } // Sync global if it exists

        list.innerHTML = localContracts.map(con => {
            let currentClaim = con.currentClaimNum || 1;
            return \`
            <div class="grid grid-cols-12 gap-2 p-4 border border-slate-600 bg-slate-700 rounded hover:bg-slate-600 transition shadow-sm mb-2 items-center">
                <div class="col-span-5 font-bold text-white text-lg cursor-pointer" onclick="openContract('\${con.id}')">\${con.name}</div>
                <div class="col-span-3 text-slate-300 text-sm cursor-pointer" onclick="openContract('\${con.id}')"><i class="fas fa-user text-slate-400 mr-1"></i> \${con.clientName || 'No Client Listed'}</div>
                <div class="col-span-2 text-blue-400 font-bold text-sm">Working on Claim #\${currentClaim}</div>
                <div class="col-span-2 text-right flex justify-end items-center gap-4">
                    <button onclick="openContract('\${con.id}')" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold shadow">Process Valuations</button>
                </div>
            </div>\`;
        }).join('');
    } catch (e) {
        console.error("Error loading contracts:", e);
        list.innerHTML = \`<p class="text-red-500 p-4">Error connecting to Database: \${e.message}</p>\`;
    }
}
`;

// Insert the function before the closing </script> tag
if(data.includes('async function renderRegistry()')) {
    data = data.replace(/async function renderRegistry\(\) \{[\s\S]*?(?=<\/script>|\n[ \t]*async function|\n[ \t]*function)/, newRenderReg);
    console.log("Replaced existing renderRegistry");
} else {
    data = data.replace('</script>', newRenderReg + '\n</script>');
    console.log("Appended renderRegistry");
}
fs.writeFileSync(path, data);

const fs = require('fs');
const path = 'c:/Users/dietr/Downloads/CivilMate Pro corregido/civilmate Pro EBA/valuations.html';

let rawContent = fs.readFileSync(path, 'utf8');
let content = rawContent.replace(/\r\n/g, '\n'); // Normalize

// 1. Navigation
content = content.replace('href="project_budgets.html"', 'href="estimator.html"');

// 2. Init variables
const varTarget = `        let contracts = DataManager.get(DB_KEYS.CONTRACTS) || [];
        let siteLogs = JSON.parse(localStorage.getItem('civilmate_sitelogs')) || [];
        let activeContract = null;
        let currentNetAmountForLocking = 0;`;

const varReplacement = `        let contracts = [];
        let siteLogs = JSON.parse(localStorage.getItem('civilmate_sitelogs')) || [];
        let activeContract = null;
        let currentNetAmountForLocking = 0;
        let currentUserUid = null;`;

content = content.replace(varTarget, varReplacement);

// 3. DOMContentLoaded
const domTarget = `        document.addEventListener('DOMContentLoaded', () => {
            init();
        });

        function init() {
            document.getElementById('claimDate').innerText = new Date().toLocaleDateString('en-NZ');
            document.getElementById('signDate').innerText = new Date().toLocaleDateString('en-NZ');
            renderRegistry();
        }`;
const domReplacement = `        document.addEventListener('DOMContentLoaded', () => {
            firebase.auth().onAuthStateChanged(user => {
                if(user) {
                    currentUserUid = user.uid;
                    document.getElementById('claimDate').innerText = new Date().toLocaleDateString('en-NZ');
                    document.getElementById('signDate').innerText = new Date().toLocaleDateString('en-NZ');
                    renderRegistry();
                } else {
                    window.location.replace("index.html");
                }
            });
        });`;

content = content.replace(domTarget, domReplacement);

// 4. renderRegistry
const renderRegTargetRegex = /function renderRegistry\(\) \{[\s\S]*?(?=        function deleteContract)/m;
const renderRegRep = `async function renderRegistry() {
            const list = document.getElementById('contractList');
            list.innerHTML = '<p class="text-slate-400 p-4"><i class="fas fa-spinner fa-spin mr-2"></i>Loading approved contracts from Cloud...</p>';

            if(!currentUserUid) return;

            try {
                const snap = await db.collection("tenants").doc(currentUserUid).collection("budgets").where("status", "==", "Approved").get();
                contracts = [];
                snap.forEach(doc => {
                    contracts.push({ id: doc.id, ...doc.data() });
                });

                if(contracts.length === 0) {
                    list.innerHTML = \`<div class="p-4 bg-yellow-900/20 text-yellow-500 border border-yellow-700 rounded font-bold"><i class="fas fa-exclamation-triangle mr-2"></i> No approved contracts found. Go back to Budgets and approve a project first.</div>\`;
                    return;
                }

                list.innerHTML = contracts.map(con => {
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
                list.innerHTML = \`<p class="text-red-500 p-4">Error loading contracts from Database.</p>\`;
            }
        }

`;
content = content.replace(renderRegTargetRegex, renderRegRep);

// 5. lockAndCertify
const lockTargetRegex = /function lockAndCertify\(\) \{[\s\S]*?(?=        function syncFromTracker)/m;
const lockRep = `async function lockAndCertify() {
            if(!confirm("LOCK CLAIM?\\n\\nThis will freeze the current amounts, add them to your 'Previous Payments', clear signatures, and prepare the system for the NEXT Claim number.\\n\\nEnsure you have printed the Dossier first!")) return;

            if(!activeContract.history) activeContract.history = [];
            activeContract.history.push({
                claimNum: activeContract.currentClaimNum,
                date: new Date().toLocaleDateString('en-NZ'),
                netAmountLocked: currentNetAmountForLocking
            });

            activeContract.previousPayments = (parseFloat(activeContract.previousPayments) || 0) + currentNetAmountForLocking;
            activeContract.currentClaimNum += 1;

            const idx = contracts.findIndex(x => x.id === activeContract.id);
            contracts[idx] = activeContract;

            try {
                await db.collection("tenants").doc(currentUserUid).collection("budgets").doc(activeContract.id).set(activeContract, { merge: true });
                
                clearSig('sigContractor');
                clearSig('sigEngineer');

                alert(\`✅ Claim Locked!\\n\\nThe system has automatically added $\${currentNetAmountForLocking.toFixed(2)} to your Previous Payments.\\n\\nYou are now working on Claim #\${activeContract.currentClaimNum}.\`);
                openContract(activeContract.id);
            } catch(e) {
                console.error("Firebase Error:", e);
                alert("Failed to lock claim in Cloud. Check connection.");
            }
        }

`;
content = content.replace(lockTargetRegex, lockRep);

// 6. syncFromTracker
const syncTargetRegex = /function syncFromTracker\(\) \{[\s\S]*?(?=        function renderAppendix)/m;
const syncRep = `async function syncFromTracker() {
            siteLogs = JSON.parse(localStorage.getItem('civilmate_sitelogs')) || [];
            const logs = siteLogs.filter(l => l.contractId === activeContract.id);
            
            if(logs.length === 0) { alert("No site records found to sync."); return; }

            let sums = {};
            let hasExtras = false;

            logs.forEach(l => {
                if(l.itemId !== 'VO') { sums[l.itemId] = (sums[l.itemId] || 0) + parseFloat(l.qty); } 
                else { hasExtras = true; }
            });

            activeContract.items.forEach(item => {
                if(item.type !== 'SECTION' && sums[item.id] !== undefined) { item.qtyToDate = sums[item.id]; }
            });

            const idx = contracts.findIndex(x => x.id === activeContract.id);
            contracts[idx] = activeContract;
            
            try {
                await db.collection("tenants").doc(currentUserUid).collection("budgets").doc(activeContract.id).set(activeContract, { merge: true });
            } catch(e) {
                console.error("Firebase Error:", e);
                alert("Failed to sync claim in Cloud.");
            }

            renderSchedule();
            switchTab('sch');
            
            let msg = "Quantities successfully synced and saved to Schedule!";
            if(hasExtras) msg += "\\n\\nNote: Extra Work (VOs) were detected in the logs. Please review the Appendix and manually add them to the Variations tab if approved.";
            alert(msg);
        }

`;
content = content.replace(syncTargetRegex, syncRep);

// 7. saveDraft
const saveTargetRegex = /function saveDraft\(\) \{[\s\S]*?(?=        function closeEditor)/m;
const saveRep = `async function saveDraft() {
            if(!currentUserUid || !activeContract) return;
            const idx = contracts.findIndex(x => x.id === activeContract.id); 
            contracts[idx] = activeContract;
            
            try {
                await db.collection("tenants").doc(currentUserUid).collection("budgets").doc(activeContract.id).set(activeContract, { merge: true });
                alert("Valuation Draft Saved to Cloud.");
            } catch(e) {
                console.error(e);
            }
        }
`;
content = content.replace(saveTargetRegex, saveRep);

content = content.replace(/\n/g, '\r\n'); // Bring back windows formatting just in case
fs.writeFileSync(path, content, 'utf8');
console.log('Update completed with normalized line endings');

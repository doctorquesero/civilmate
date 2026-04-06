const fs = require('fs');
const path = 'c:/Users/dietr/Downloads/CivilMate Pro corregido/civilmate Pro EBA/project_hub.html';
let data = fs.readFileSync(path, 'utf8');
const startMatch = '<script>';
const endMatch = '</script>';
const startIndex = data.lastIndexOf(startMatch);
const endIndex = data.lastIndexOf(endMatch);

const newScript = `
        const firebaseConfig = { apiKey: "AIzaSyClWpKp8f0axjSEJrnJMKa6jUrerhyrC4A", authDomain: "civilmate-pro.firebaseapp.com", projectId: "civilmate-pro", storageBucket: "civilmate-pro.firebasestorage.app", messagingSenderId: "674522561149", appId: "1:674522561149:web:4e55096c4f8d72f142cf14" };
        if(!window.firebase || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        function fmtMoney(n) { return "$" + n.toLocaleString('en-NZ', {minimumFractionDigits: 2}); }
        function openLink(url) { window.location.href = url; }
        function createNewClaim() { localStorage.removeItem('civilmate_current_claim_id'); window.location.href = 'valuations.html'; }
        function viewClaim(claimId) { localStorage.setItem('civilmate_current_claim_id', claimId); window.location.href = 'valuations.html'; }

        firebase.auth().onAuthStateChanged(user => {
            if(user) {
                const pid = localStorage.getItem('civilmate_current_project_id');
                if(!pid) { 
                    alert("No project selected. Please select a project from the Dashboard."); 
                    window.location.href='dashboard.html'; 
                    return; 
                }

                // 1. Cargar datos del presupuesto aprobado desde la bóveda del Tenant
                db.collection('tenants').doc(user.uid).collection('budgets').doc(pid).onSnapshot(doc => {
                    if(doc.exists) {
                        const p = doc.data();
                        document.getElementById('projName').innerText = p.name || 'Unnamed Project';
                        document.getElementById('clientName').innerText = p.clientName || 'Client N/A';

                        const schedule = p.items || [];
                        let originalSum = 0;
                        schedule.forEach(item => {
                            originalSum += (Number(item.qty || 0) * Number(item.rate || 0));
                        });
                        
                        let variationsSum = p.variations ? p.variations.reduce((a, b) => a + (Number(b.amount) || 0), 0) : 0;
                        const revisedSum = originalSum + variationsSum;
                        const totalClaimed = p.previousPayments || 0;

                        document.getElementById('kpiOriginal').innerText = fmtMoney(originalSum);
                        document.getElementById('kpiVariations').innerText = fmtMoney(variationsSum);
                        document.getElementById('kpiRevised').innerText = fmtMoney(revisedSum);
                        document.getElementById('kpiClaimed').innerText = fmtMoney(totalClaimed);

                        const progress = revisedSum > 0 ? (totalClaimed / revisedSum) * 100 : 0;
                        document.getElementById('progressBar').style.width = \`\${Math.min(progress, 100)}%\`;
                        document.getElementById('progressTxt').innerText = \`\${progress.toFixed(1)}% Complete\`;

                        // 2. Cargar historial de valuaciones
                        const tbody = document.getElementById('claimsTable');
                        tbody.innerHTML = "";
                        if(p.history && p.history.length > 0) {
                            p.history.forEach(c => {
                                tbody.innerHTML += \`
                                <tr class="hover:bg-slate-50 transition border-b border-slate-50">
                                    <td class="p-3 text-center font-bold text-slate-600">#\${c.claimNum}</td>
                                    <td class="p-3 text-slate-500">\${c.date}</td>
                                    <td class="p-3 text-right font-mono text-slate-700">\${fmtMoney(c.netAmountLocked)}</td>
                                    <td class="p-3 text-right font-bold text-slate-800 font-mono">\${fmtMoney(c.netAmountLocked)}</td>
                                    <td class="p-3 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold uppercase bg-green-100 text-green-700">Locked</span></td>
                                    <td class="p-3 text-center"><button class="text-slate-400 cursor-not-allowed px-2 py-1 rounded text-xs"><i class="fas fa-lock"></i></button></td>
                                </tr>\`;
                            });
                        } else {
                            tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400 italic">No claims generated yet. Start getting paid! 💸</td></tr>';
                        }
                    }
                });

                // 3. Cargar Site Logs (Actividad Reciente)
                const siteLogs = JSON.parse(localStorage.getItem('civilmate_sitelogs')) || [];
                const pLogs = siteLogs.filter(l => l.contractId === pid).sort((a,b) => b.timestamp - a.timestamp).slice(0, 10);
                const feed = document.getElementById('activityFeed');
                feed.innerHTML = "";
                if(pLogs.length === 0) {
                    feed.innerHTML = "<p class='italic opacity-50'>No recent activity.</p>";
                } else {
                    pLogs.forEach(log => {
                        feed.innerHTML += \`
                        <div class="flex gap-3 border-b border-slate-200 pb-2 mb-2 last:border-0">
                            <div class="mt-1"><i class="fas fa-hard-hat text-blue-400"></i></div>
                            <div>
                                <p class="text-slate-600 font-bold">\${log.itemName}</p>
                                <p class="text-[10px] text-slate-400">\${log.date} • \${log.qty} \${log.unit}</p>
                            </div>
                        </div>\`;
                    });
                }
            } else {
                window.location.href = 'index.html';
            }
        });
`;

data = data.substring(0, startIndex + startMatch.length) + "\n" + newScript + "\n    " + data.substring(endIndex);
fs.writeFileSync(path, data);
console.log('Replaced successfully');

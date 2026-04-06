/**
 * CIVILMATE CORE ENGINE (V12.0 - FIREBASE CLOUD HYBRID INTEGRATION)
 * - Strict syntax (no backticks)
 * - Exact PDF Mirror (Untouched)
 * - MathEngine (Untouched)
 * - DataManager (Upgraded for real-time Cloud Sync)
 */

window.CURRENT_UID = null; // Variable global para rastrear al usuario activo en la nube

const DB_KEYS = {
    RESOURCES: 'civilmate_resources',
    MASTER_APU: 'civilmate_master_apus',
    BUDGETS: 'civilmate_budgets',
    CONTRACTS: 'civilmate_contracts',
    SETTINGS: 'civilmate_settings',
    VERSION: 'civilmate_v4.0_restore_stable'
};

const DataManager = {
    // 1. LEER DATOS (Sigue leyendo hiper-rápido desde la memoria local)
    get: function(key) {
        const data = localStorage.getItem(key);
        if (data) {
            return JSON.parse(data);
        } else {
            return [];
        }
    },

    // 2. GUARDAR DATOS (Guarda local y respalda en Oregon en silencio)
    set: function(key, data) {
        // A. Guardado instantáneo local (Evita que la pantalla se congele)
        localStorage.setItem(key, JSON.stringify(data));
        
        // B. Respaldo en la Nube (Solo si hay un usuario logeado)
        if (window.CURRENT_UID && typeof firebase !== 'undefined') {
            const db = firebase.firestore();
            db.collection("tenants").get().then((snapshot) => {
                let tenantId = window.CURRENT_UID;
                snapshot.forEach(doc => {
                    const tData = doc.data();
                    if (tData.email && tData.email.toLowerCase() === window.CURRENT_EMAIL.toLowerCase()) { tenantId = doc.id; } 
                    else if (tData.staff && Array.isArray(tData.staff)) {
                        if (tData.staff.find(s => s.email.toLowerCase() === window.CURRENT_EMAIL.toLowerCase())) { tenantId = doc.id; }
                    }
                });
                
                db.collection("tenants").doc(tenantId).collection("appData").doc(key)
                    .set({
                        payload: JSON.stringify(data),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    })
                    .catch(function(err) {
                        console.error("Cloud Sync Error (Respaldo en la nube falló):", err);
                    });
            });
        }
    },

    // 3. DESCARGAR DESDE LA NUBE (Al iniciar sesión en un equipo nuevo)
    syncFromCloud: function() {
        if (!window.CURRENT_UID || typeof firebase === 'undefined') return;
        
        const db = firebase.firestore();
        
        // Find the correct tenantId for the current user
        db.collection("tenants").get().then((snapshot) => {
            let tenantId = window.CURRENT_UID; // Default
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.email && data.email.toLowerCase() === window.CURRENT_EMAIL.toLowerCase()) {
                    tenantId = doc.id;
                } else if (data.staff && Array.isArray(data.staff)) {
                    const staffMatch = data.staff.find(s => s.email.toLowerCase() === window.CURRENT_EMAIL.toLowerCase());
                    if (staffMatch) { tenantId = doc.id; }
                }
            });

            db.collection("tenants").doc(tenantId).collection("appData").get()
                .then(function(snapshot) {
                    let hasChanges = false;
                    snapshot.forEach(function(doc) {
                        const key = doc.id;
                        const cloudData = doc.data().payload;
                        if (cloudData) {
                            localStorage.setItem(key, cloudData);
                            hasChanges = true;
                        }
                    });
                    
                    // Always render after checking cloud to ensure UI is in sync
                    if(typeof window.renderResourcesTable === 'function') window.renderResourcesTable();
                    if(typeof window.renderAPUsTable === 'function') window.renderAPUsTable();
                    if(typeof window.render === 'function') window.render();
                    
                    // Si descargó datos nuevos y es el primer inicio de sesión, refresca para mostrarlos
                    if (hasChanges && !sessionStorage.getItem('civilmate_cloud_synced')) {
                        sessionStorage.setItem('civilmate_cloud_synced', 'true');
                        // window.location.reload(); // Evitamos reload brusco ya que render() ya actualizó la UI
                    }
                })
                .catch(function(err) {
                    console.error("Cloud Load Error:", err);
                });
        });
    },

    getSettings: function() {
        const settings = this.get(DB_KEYS.SETTINGS);
        if (settings && Object.keys(settings).length > 0) {
            return settings;
        } else {
            return {
                companyName: "YOUR COMPANY NAME",
                companyAddress: "",
                companyContact: ""
            };
        }
    },
    saveSettings: function(s) { 
        this.set(DB_KEYS.SETTINGS, s); 
        return true; 
    },
    addResource: function(newRes) {
        let resources = this.get(DB_KEYS.RESOURCES);
        let exists = false;
        for (let i = 0; i < resources.length; i++) {
            if (resources[i].code === newRes.code) exists = true;
        }
        if (exists) return { success: false, msg: 'Error: Code exists.' };
        
        resources.push(newRes);
        this.set(DB_KEYS.RESOURCES, resources);
        return { success: true, msg: 'Resource added.' };
    },
    addMasterAPU: function(newAPU) {
        let apus = this.get(DB_KEYS.MASTER_APU);
        const masterClone = JSON.parse(JSON.stringify(newAPU));
        delete masterClone.qty; 
        delete masterClone.originID;
        
        let exists = false;
        for (let i = 0; i < apus.length; i++) {
            if (apus[i].id === masterClone.id) exists = true;
        }
        if (exists) masterClone.id = Utils.generateID('APU');
        
        apus.push(masterClone);
        this.set(DB_KEYS.MASTER_APU, apus);
        return true;
    },
    init: function() {
        const version = localStorage.getItem(DB_KEYS.VERSION);
        if (!version) {
            localStorage.setItem(DB_KEYS.VERSION, 'done');
        }

        // NUEVO: Escudo de Firebase - Conecta el Core al Usuario Activo
        if (typeof firebase !== 'undefined') {
            firebase.auth().onAuthStateChanged(function(user) {
                if (user) {
                    window.CURRENT_UID = user.uid;
                    window.CURRENT_EMAIL = user.email;
                    DataManager.syncFromCloud(); // Sincroniza al entrar
                }
            });
        }
    },
    reorderBudgetItems: function(budgetId, domMap) {
        let budgets = this.get(DB_KEYS.BUDGETS);
        let bIndex = -1;
        for (let i = 0; i < budgets.length; i++) {
            if (budgets[i].id === budgetId) bIndex = i;
        }
        
        if (bIndex !== -1) {
            const currentItems = budgets[bIndex].items;
            const newItemsArray = [];
            
            domMap.forEach(function(sectionBlock) {
                let sectionObj = null;
                for (let k = 0; k < currentItems.length; k++) {
                    if (currentItems[k].id === sectionBlock.id) sectionObj = currentItems[k];
                }
                
                if (!sectionObj) {
                    sectionObj = { id: sectionBlock.id, type: 'SECTION', desc: sectionBlock.desc, qty: 0, rate: 0 };
                }
                sectionObj.desc = sectionBlock.desc; 
                newItemsArray.push(sectionObj);
                
                sectionBlock.items.forEach(function(itemId) {
                    let itemObj = null;
                    for (let j = 0; j < currentItems.length; j++) {
                        if (currentItems[j].id === itemId) itemObj = currentItems[j];
                    }
                    if (itemObj) newItemsArray.push(itemObj);
                });
            });
            
            budgets[bIndex].items = newItemsArray;
            this.set(DB_KEYS.BUDGETS, budgets);
            return true;
        }
        return false;
    },
    createContractFromBudget: function(budgetId) {
        let budgets = this.get(DB_KEYS.BUDGETS);
        let bIndex = -1;
        for (let i = 0; i < budgets.length; i++) {
            if (budgets[i].id === budgetId) bIndex = i;
        }
        if (bIndex === -1) return false;

        let b = budgets[bIndex];
        let contracts = this.get(DB_KEYS.CONTRACTS);
        
        let exists = false;
        for (let i = 0; i < contracts.length; i++) {
            if (contracts[i].budgetId === budgetId) exists = true;
        }
        if (exists) return false; 

        let resources = this.get(DB_KEYS.RESOURCES);
        let frozenItems = [];

        for (let i = 0; i < b.items.length; i++) {
            let item = b.items[i];
            if (item.type === 'SECTION') {
                frozenItems.push({ id: item.id, type: 'SECTION', desc: item.desc });
            } else {
                const calc = MathEngine.calculateAPU(item, resources);
                const disp = MathEngine.getDisplayValues(calc, item.pricingFormat, item.qty);
                frozenItems.push({
                    id: item.id,
                    type: 'ITEM',
                    desc: item.desc,
                    unit: item.unit,
                    contractQty: item.qty || 0,
                    frozenRate: disp.rate,
                    contractTotal: disp.total,
                    qtyToDate: 0,
                    amountToDate: 0
                });
            }
        }

        let newContract = {
            id: Utils.generateID('CON'),
            budgetId: b.id,
            name: b.name,
            clientName: b.clientName,
            clientContact: b.clientContact,
            siteAddress: b.siteAddress,
            created: new Date().toISOString(),
            items: frozenItems,
            variations: [],
            deductions: [],
            previousPayments: 0
        };

        contracts.push(newContract);
        this.set(DB_KEYS.CONTRACTS, contracts);

        b.status = 'Approved';
        this.set(DB_KEYS.BUDGETS, budgets);
        return true;
    }
};

const MathEngine = {
    calculateAPU: function(apu, resourceList) {
        if (apu.type === 'SECTION') { return { finalUnitRate: 0, fullyLoadedHourlyRate: 0 }; }
        let matTotal = 0; let plantDaily = 0; let laborBaseDaily = 0;
        let output = parseFloat(apu.output); if (isNaN(output) || output === 0) { output = 1; }
        let shift = parseFloat(apu.shift); if (isNaN(shift) || shift === 0) { shift = 8; }

        const resolve = function(item) {
            if (item.isCustom) return item;
            for (let i = 0; i < resourceList.length; i++) {
                if (resourceList[i].code === item.code) return resourceList[i];
            }
            return null;
        };

        const mapList = function(list, type) {
            let arr = list; if (!arr) arr = [];
            const result = [];
            for (let i = 0; i < arr.length; i++) {
                let item = arr[i];
                const r = resolve(item);
                if (r !== null) {
                    let qty = parseFloat(item.qty); if (isNaN(qty)) qty = 0;
                    let rate = parseFloat(r.rate); if (isNaN(rate)) rate = 0;
                    const lineTotal = qty * rate; 
                    if (type === 'MAT') matTotal += lineTotal;
                    else if (type === 'PLANT') plantDaily += lineTotal;
                    else if (type === 'LABOR') laborBaseDaily += lineTotal;

                    let incidenceBase = 0;
                    if (type === 'MAT') incidenceBase = lineTotal;
                    else incidenceBase = lineTotal / output;
                    
                    let clone = Object.assign({}, r);
                    clone.qty = qty; clone.rate = rate; clone.lineTotal = lineTotal; clone.incidenceBase = incidenceBase;
                    result.push(clone);
                }
            }
            return result;
        };

        const matList = mapList(apu.materials, 'MAT');
        const plantList = mapList(apu.plant, 'PLANT');
        const laborList = mapList(apu.labor, 'LABOR');

        let benefitsPerc = 50;
        if (apu.benefitsPerc !== undefined) {
            let p = parseFloat(apu.benefitsPerc);
            if (!isNaN(p)) benefitsPerc = p;
        }
        
        const benefitsVal = laborBaseDaily * (benefitsPerc / 100);
        const laborTotalDaily = laborBaseDaily + benefitsVal; 
        const plantUnitCost = plantDaily / output;
        const laborUnitCost = laborTotalDaily / output;
        const directCost = matTotal + plantUnitCost + laborUnitCost;

        let overheadPerc = parseFloat(apu.overheadPerc); if (isNaN(overheadPerc)) overheadPerc = 0;
        let profitPerc = parseFloat(apu.profitPerc); if (isNaN(profitPerc)) profitPerc = 0;

        const overheadVal = directCost * (overheadPerc / 100);
        const profitVal = directCost * (profitPerc / 100);
        const finalUnitRate = directCost + overheadVal + profitVal;
        const fullyLoadedHourlyRate = (finalUnitRate * output) / shift;

        const getPct = function(val) {
            if (finalUnitRate > 0) return (val / finalUnitRate) * 100;
            return 0;
        };
        
        for (let i = 0; i < matList.length; i++) matList[i].incidencePct = getPct(matList[i].incidenceBase);
        for (let i = 0; i < plantList.length; i++) plantList[i].incidencePct = getPct(plantList[i].incidenceBase);
        for (let i = 0; i < laborList.length; i++) laborList[i].incidencePct = getPct(laborList[i].incidenceBase);

        return {
            matList: matList, plantList: plantList, laborList: laborList,
            matTotal: matTotal, plantDaily: plantDaily, plantUnitCost: plantUnitCost, 
            laborBaseDaily: laborBaseDaily, benefitsPerc: benefitsPerc, benefitsVal: benefitsVal, 
            laborTotalDaily: laborTotalDaily, laborUnitCost: laborUnitCost,
            directCost: directCost, overheadVal: overheadVal, profitVal: profitVal,
            finalUnitRate: parseFloat(finalUnitRate.toFixed(2)),
            fullyLoadedHourlyRate: parseFloat(fullyLoadedHourlyRate.toFixed(2)),
            overheadIncidencePct: getPct(overheadVal), profitIncidencePct: getPct(profitVal), 
            benefitsIncidencePct: getPct(benefitsVal / output),
            dailyTotalCost: plantDaily + laborTotalDaily
        };
    },

    getDisplayValues: function(calc, format, qtyInput) {
        let rate = calc.finalUnitRate; 
        let total = 0;
        if (format === 'HOURLY') rate = calc.fullyLoadedHourlyRate;
        if (format === 'LUMP_SUM') total = rate; 
        else {
            let q = parseFloat(qtyInput); if (isNaN(q)) q = 0;
            total = rate * q;
        }
        return { rate: rate, total: total };
    }
};

const Utils = {
    fmtMoney: function(n) {
        let val = parseFloat(n); if (isNaN(val)) val = 0;
        return "$" + val.toLocaleString('en-NZ', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    },
    fmtPct: function(n) {
        let val = parseFloat(n); if (isNaN(val)) val = 0;
        return val.toFixed(2) + "%";
    },
    generateID: function(prefix) { return prefix + '-' + Date.now().toString(36).toUpperCase(); }
};

const RenderEngine = {
    generateRows: function(list, key, updateFnName, removeFnName) {
        if (!list || list.length === 0) return '';
        let html = '';
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            html += '<tr class="hover:bg-slate-800 border-b border-slate-800">';
            html += '<td class="p-1 border border-slate-700 text-xs text-slate-400 font-mono">' + item.code + '</td>';
            html += '<td class="p-1 border border-slate-700 text-xs text-white">' + item.desc + '</td>';
            html += '<td class="p-1 border border-slate-700 text-xs text-center text-slate-400">' + item.unit + '</td>';
            html += '<td class="p-1 border border-slate-700 w-20"><input type="number" value="' + item.qty + '" onchange="' + updateFnName + '(\'' + key + '\',' + i + ',this.value)" class="w-20 bg-black text-white border border-slate-600 rounded text-center font-bold text-xs focus:outline-none focus:border-blue-500"></td>';
            html += '<td class="p-1 border border-slate-700 text-xs text-right text-slate-300">' + Utils.fmtMoney(item.rate) + '</td>';
            html += '<td class="p-1 border border-slate-700 text-xs text-right text-white font-bold">' + Utils.fmtMoney(item.lineTotal) + '</td>';
            html += '<td class="p-1 border border-slate-700 text-xs text-right font-bold text-blue-300 bg-blue-900/20">' + Utils.fmtPct(item.incidencePct) + '</td>';
            html += '<td class="p-1 border border-slate-700 text-center w-10"><button type="button" onclick="' + removeFnName + '(\'' + key + '\',' + i + ')" class="text-red-500 hover:text-red-300 font-bold">X</button></td>';
            html += '</tr>';
        }
        return html;
    }
};

const PDFEngine = {
    exportBudget: function(budgetId, includeDetails) {
        try {
            const jsPDF = window.jspdf.jsPDF;
            const doc = new jsPDF();
            const budgets = DataManager.get(DB_KEYS.BUDGETS);
            const resources = DataManager.get(DB_KEYS.RESOURCES);
            const settings = DataManager.getSettings();
            
            let b = null;
            for (let i = 0; i < budgets.length; i++) {
                if (budgets[i].id === budgetId) b = budgets[i];
            }
            if (b === null) { alert("Error: Presupuesto no encontrado."); return; }

            const safeCompName = String(settings.companyName || "COMPANY").toUpperCase();
            const safeCompAddr = String(settings.companyAddress || "");
            const safeCompCont = String(settings.companyContact || "");
            const safeClientName = String(b.clientName || "-");
            const safeClientCont = String(b.clientContact || "-");
            const safeProjName = String(b.name || "-");
            const safeProjAddr = String(b.siteAddress || "-");
            
            let dateObj = new Date(); if (b.created) dateObj = new Date(b.created);
            const safeDate = dateObj.toLocaleDateString();
            let safeId = "00000000"; if (b.id) safeId = String(b.id).substring(4, 12);

            let y = 15;
            doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text(safeCompName, 14, y); y = y + 6;
            doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(80); doc.text(safeCompAddr, 14, y); y = y + 5; doc.text(safeCompCont, 14, y);
            y = 15; doc.setFontSize(22); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0); doc.text("QUOTE", 195, y, { align: "right" }); y = y + 10;
            doc.setFontSize(10); doc.setTextColor(80); doc.text("Date: " + safeDate, 195, y, { align: "right" }); y = y + 5; doc.text("Quote #: " + safeId, 195, y, { align: "right" });
            y = y + 15; doc.setDrawColor(200); doc.line(14, y, 196, y); y = y + 8;
            doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0); doc.text("PREPARED FOR:", 14, y); doc.setFont("helvetica", "normal"); doc.text(safeClientName, 14, y + 5); doc.text(safeClientCont, 14, y + 10);
            doc.setFont("helvetica", "bold"); doc.text("PROJECT DETAILS:", 110, y); doc.setFont("helvetica", "normal"); doc.text(safeProjName, 110, y + 5); doc.text(safeProjAddr, 110, y + 10); y = y + 20;

            const tableBody = []; let sectionTotal = 0; let grandTotal = 0; let hasStartedSection = false;
            
            for (let i = 0; i < b.items.length; i++) {
                let item = b.items[i];
                if (item.type === 'SECTION') {
                    if (hasStartedSection === true) { 
                        tableBody.push([{ content: 'SUBTOTAL SECTION', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', textColor: [100, 100, 100] } }, { content: Utils.fmtMoney(sectionTotal), styles: { fontStyle: 'bold', halign: 'right' } }]); 
                        sectionTotal = 0; 
                    }
                    let sName = ""; if (item.desc) sName = String(item.desc).toUpperCase();
                    tableBody.push([{ content: sName, colSpan: 5, styles: { fillColor: [240, 240, 240], fontStyle: 'bold', textColor: [0, 0, 0] } }]); 
                    hasStartedSection = true;
                } else {
                    const calc = MathEngine.calculateAPU(item, resources);
                    const disp = MathEngine.getDisplayValues(calc, item.pricingFormat, item.qty);
                    sectionTotal += disp.total; grandTotal += disp.total;
                    let u = ""; if (item.unit) u = String(item.unit);
                    if (item.pricingFormat === 'HOURLY') u = 'Hr'; if (item.pricingFormat === 'LUMP_SUM') u = 'LS';
                    let iName = ""; if (item.desc) iName = String(item.desc);
                    let iQty = "0"; if (item.qty) iQty = String(item.qty);
                    tableBody.push([iName, { content: u, styles: { halign: 'center' } }, { content: iQty, styles: { halign: 'center' } }, { content: Utils.fmtMoney(disp.rate), styles: { halign: 'right' } }, { content: Utils.fmtMoney(disp.total), styles: { halign: 'right' } }]);
                }
            }
            if (hasStartedSection === true) { tableBody.push([{ content: 'SUBTOTAL SECTION', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', textColor: [100, 100, 100] } }, { content: Utils.fmtMoney(sectionTotal), styles: { fontStyle: 'bold', halign: 'right' } }]); }
            tableBody.push([{ content: 'GRAND TOTAL (Excl. GST)', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [40, 40, 40], textColor: [255, 255, 255] } }, { content: Utils.fmtMoney(grandTotal), styles: { halign: 'right', fontStyle: 'bold', fillColor: [40, 40, 40], textColor: [255, 255, 255] } }]);

            doc.autoTable({ startY: y, head: [['Description', 'Unit', 'Qty', 'Rate', 'Total']], body: tableBody, theme: 'plain', headStyles: { fillColor: [50, 50, 60], textColor: [255, 255, 255], fontStyle: 'bold' }, styles: { fontSize: 9, cellPadding: 3, lineColor: [220, 220, 220], lineWidth: 0.1 }, columnStyles: { 0: { cellWidth: 'auto' }, 4: { cellWidth: 30 } } });
            
            let finalY = 15; if (doc.lastAutoTable && doc.lastAutoTable.finalY) finalY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(9); doc.setTextColor(100); let days = 30; if (b.validityDays) days = b.validityDays;
            doc.text("* This quote is valid for " + days + " days from the date of issue. All prices exclude GST unless otherwise stated.", 14, finalY);

            if (includeDetails === true) {
                for (let idx = 0; idx < b.items.length; idx++) {
                    let item = b.items[idx];
                    if (item.type !== 'SECTION') {
                        doc.addPage();
                        const calc = MathEngine.calculateAPU(item, resources);
                        let currY = 15;
                        let iDesc = ""; if (item.desc) iDesc = String(item.desc);
                        doc.setFontSize(14); doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.text("Rate Analysis: " + iDesc, 14, currY); currY += 7;
                        doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(80); 
                        let iUnit = ""; if (item.unit) iUnit = String(item.unit);
                        let outStr = 1; if (item.output) outStr = item.output;
                        doc.text("Unit: " + iUnit + " | Output: " + outStr + " / Day", 14, currY); currY += 10;
                        
                        if (calc.matList && calc.matList.length > 0) {
                            doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 180, 140); doc.text("Materials", 14, currY); currY += 2;
                            const mRows = [];
                            for (let m = 0; m < calc.matList.length; m++) {
                                let r = calc.matList[m];
                                mRows.push([String(r.code || ""), String(r.desc || ""), String(r.unit || ""), String(r.qty || 0), Utils.fmtMoney(r.rate), Utils.fmtMoney(r.lineTotal)]);
                            }
                            mRows.push([{ content: 'Total Material Cost', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [30, 180, 140], textColor: [255,255,255] } }, { content: Utils.fmtMoney(calc.matTotal), styles: { fontStyle: 'bold', fillColor: [30, 180, 140], textColor: [255,255,255] } }]);
                            doc.autoTable({ startY: currY, head: [['Code', 'Description', 'Unit', 'Qty', 'Rate', 'Total']], body: mRows, theme: 'grid', headStyles: { fillColor: [30, 180, 140], textColor: [255,255,255] }, styles: { fontSize: 8, cellPadding: 2 }, margin: { left: 14, right: 14 } });
                            if (doc.lastAutoTable && doc.lastAutoTable.finalY) currY = doc.lastAutoTable.finalY + 10;
                        }

                        if (calc.plantList && calc.plantList.length > 0) {
                            doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 180, 140); doc.text("Plant & Equipment", 14, currY); currY += 2;
                            const pRows = [];
                            for (let p = 0; p < calc.plantList.length; p++) {
                                let r = calc.plantList[p];
                                pRows.push([String(r.code || ""), String(r.desc || ""), String(r.unit || ""), String(r.qty || 0), Utils.fmtMoney(r.rate), Utils.fmtMoney(r.lineTotal)]);
                            }
                            pRows.push([{ content: 'Total Plant Daily Cost', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [30, 180, 140], textColor: [255,255,255] } }, { content: Utils.fmtMoney(calc.plantDaily), styles: { fontStyle: 'bold', fillColor: [30, 180, 140], textColor: [255,255,255] } }]);
                            doc.autoTable({ startY: currY, head: [['Code', 'Description', 'Unit', 'Qty', 'Rate', 'Total']], body: pRows, theme: 'grid', headStyles: { fillColor: [30, 180, 140], textColor: [255,255,255] }, styles: { fontSize: 8, cellPadding: 2 }, margin: { left: 14, right: 14 } });
                            if (doc.lastAutoTable && doc.lastAutoTable.finalY) currY = doc.lastAutoTable.finalY + 1;
                            doc.autoTable({ startY: currY, body: [['Total Plant Unit Rate', Utils.fmtMoney(calc.plantUnitCost)]], theme: 'plain', styles: { halign: 'right', fontSize: 9, fontStyle: 'bold' }, columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 30 } }, margin: { left: 14, right: 14 } });
                            if (doc.lastAutoTable && doc.lastAutoTable.finalY) currY = doc.lastAutoTable.finalY + 10;
                        }

                        if (calc.laborList && calc.laborList.length > 0) {
                            doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 180, 140); doc.text("Labour", 14, currY); currY += 2;
                            const lRows = [];
                            for (let l = 0; l < calc.laborList.length; l++) {
                                let r = calc.laborList[l];
                                lRows.push([String(r.code || ""), String(r.desc || ""), String(r.unit || ""), String(r.qty || 0), Utils.fmtMoney(r.rate), Utils.fmtMoney(r.lineTotal)]);
                            }
                            doc.autoTable({ startY: currY, head: [['Code', 'Description', 'Unit', 'Qty', 'Rate', 'Total']], body: lRows, theme: 'grid', headStyles: { fillColor: [30, 180, 140], textColor: [255,255,255] }, styles: { fontSize: 8, cellPadding: 2 }, margin: { left: 14, right: 14 } });
                            if (doc.lastAutoTable && doc.lastAutoTable.finalY) currY = doc.lastAutoTable.finalY + 1;
                            let benP = 50; if (item.benefitsPerc !== undefined) benP = item.benefitsPerc;
                            doc.autoTable({ startY: currY, body: [['Subtotal Labour', Utils.fmtMoney(calc.laborBaseDaily)], ['Benefits (' + benP + '%)', Utils.fmtMoney(calc.benefitsVal)], ['Total Labour Daily', Utils.fmtMoney(calc.laborTotalDaily)], ['Total Labour Unit Rate', Utils.fmtMoney(calc.laborUnitCost)]], theme: 'plain', styles: { halign: 'right', fontSize: 9, fontStyle: 'bold' }, columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 30 } }, margin: { left: 14, right: 14 } });
                            if (doc.lastAutoTable && doc.lastAutoTable.finalY) currY = doc.lastAutoTable.finalY + 10;
                        }

                        if (currY + 50 > doc.internal.pageSize.height) { doc.addPage(); currY = 15; }
                        doc.setDrawColor(0); doc.setFillColor(240, 240, 240); doc.rect(120, currY, 75, 45, 'FD'); doc.setFontSize(10); doc.setTextColor(0);
                        doc.text("Direct Cost:", 125, currY + 8); doc.text(Utils.fmtMoney(calc.directCost), 190, currY + 8, { align: "right" });
                        let ovP = 0; if (item.overheadPerc) ovP = item.overheadPerc;
                        doc.text("Overheads (" + ovP + "%):", 125, currY + 16); doc.text(Utils.fmtMoney(calc.overheadVal), 190, currY + 16, { align: "right" });
                        let prP = 0; if (item.profitPerc) prP = item.profitPerc;
                        doc.text("Profit (" + prP + "%):", 125, currY + 24); doc.text(Utils.fmtMoney(calc.profitVal), 190, currY + 24, { align: "right" });
                        doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("UNIT RATE:", 125, currY + 38); doc.text(Utils.fmtMoney(calc.finalUnitRate), 190, currY + 38, { align: "right" });
                    }
                }
            }

            let defaultName = "Presupuesto"; if (b.name) defaultName = String(b.name);
            const cleanName = defaultName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            doc.autoPrint();
            try {
                const blob = doc.output('blob'); const url = URL.createObjectURL(blob); const win = window.open(url, '_blank');
                if (!win) doc.save("Quote_" + cleanName + ".pdf");
            } catch (e) {
                doc.save("Quote_" + cleanName + ".pdf");
            }

        } catch (error) {
            console.error("PDF Error: ", error);
            alert("Error en el PDF: " + error.message);
        }
    }
};

DataManager.init();
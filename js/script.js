        // --- DATA STATE & CONFIGURATION ---
        const branchNames = {
            "D660": "LAMPUNG A. YANI",
            "D661": "LAMPUNG S. HATTA",
            "D662": "BANDAR JAYA",
            "D663": "LAMPUNG UTARA",
            "D664": "LAMPUNG TIMUR"
        };

        let assets = [];
        let historyLogs = [];
        let activeOpnameAsset = null;
        let activeOpnameMethod = 'Scan';
        let activeEvidencePhoto = null;
        let toastTimeout = null;
        let pendingConfirmCallback = null;
        let currentPage = 1;
        let html5QrCodeScanner = null;
        let isAutoSaveMode = false;
        let googleSheetsWebhookUrl = localStorage.getItem('app_sheets_url') || '';
        let currentMasterStatusFilter = 'ALL';
        let activeDashboardFilterType = 'SCANNED';
        let activeConditionFilter = null; // 'Baik', 'Rusak Ringan', 'Rusak Berat', 'Hilang', dll
        let activeStatusType = 'aset'; // 'aset' (untuk status fisik aset) atau 'label' (untuk status label barcode)
        

        const itemsPerPage = 15;
        // API Backend Proxy URL
        const PROXY_API_URL = "/api/proxy";

       // --- FUNGSI NAVIGASI KLIK KARTU KPI DASHBOARD ---
        function filterMasterFromDashboard(statusType) {
            if (statusType === 'ALL') {
                // Jika kartu "Total Aset Terdaftar" diklik -> Buka halaman Daftar Master Aset
                currentMasterStatusFilter = 'ALL';
                switchView('masterdata');
            } else {
                // Jika kartu "Aset Terscan" ('SCANNED') atau "Belum Di-scan" ('PENDING') diklik -> Buka halaman khusus tabel dinamis
                activeDashboardFilterType = statusType; 
                switchView('scannedAssetView');
            }
        }

        // Handler khusus untuk foto barcode kamera HP dengan metode 'Scan'
        function handleNativeCameraScanWithMethod(event, methodType = 'Scan') {
            const file = event.target.files[0];
            if (!file) return;
        
            showToast('Memindai Foto', 'Mendeteksi barcode dari foto kamera HP...', 'info');
        
            const html5QrCode = new Html5Qrcode("cameraReader");
            
            html5QrCode.scanFile(file, true)
                .then(decodedText => {
                    html5QrCode.clear();
                    let rawText = decodedText.trim();
                    if (rawText.length < 8) {
                        showToast('Tidak Valid', 'Barcode terlalu pendek atau tidak terbaca.', 'warning');
                        return;
                    }
        
                    playBeepSound('success');
                    const inputEl = document.getElementById('mainBarcodeInput');
                    if (inputEl) inputEl.value = rawText;
        
                    let cleanedText = rawText.replace(/[-_]/g, " ");
                    let parts = cleanedText.split(/\s+/);
                    let scannedId = parts[0].trim().toLowerCase();
                    let scannedSub = (parts[1] || "0").trim().toLowerCase();
        
                    let foundAsset = assets.find(a => {
                        let dbId = String(a.id || a["ID Asset"] || "").trim().toLowerCase();
                        let dbSub = String(a.subNumber !== undefined ? a.subNumber : (a["Sub-Number"] !== undefined ? a["Sub-Number"] : "0")).trim().toLowerCase();
                        return dbId === scannedId && dbSub === scannedSub;
                    }) || assets.find(a => {
                        let dbId = String(a.id || a["ID Asset"] || "").trim().toLowerCase();
                        return dbId === scannedId;
                    });
        
                    if (!foundAsset) {
                        playBeepSound('error');
                        showToast('Tidak Terdaftar', `Nomor Aset "${rawText}" tidak ada di Master Data.`, 'warning');
                        return;
                    }
        
                    const todayStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
                    const alreadyScannedToday = historyLogs.some(h => {
                        let hId = String(h.assetId || "").trim().toLowerCase();
                        let hSub = String(h.subNumber || "0").trim().toLowerCase();
                        let hDate = String(h.tanggalScan || "").trim();
                        return hId === String(foundAsset.id).trim().toLowerCase() && 
                               hSub === String(foundAsset.subNumber || "0").trim().toLowerCase() && 
                               hDate === todayStr;
                    });
        
                    if (alreadyScannedToday) {
                        playBeepSound('error');
                        showToast('Aset Sudah Terscan', `Aset ${foundAsset.id} sudah pernah dipindai hari ini.`, 'warning');
                        return;
                    }
        
                    // Buka modal dengan parameter methodType ('Scan')
                    openOpnameModal(foundAsset, methodType);
                })
                .catch(err => {
                    html5QrCode.clear();
                    playBeepSound('error');
                    showToast('Barcode Tidak Terbaca', 'Pastikan foto stiker barcode jelas dan fokus.', 'warning');
                });
        }
        
        // --- FUNGSI Klik KARTU KONDISI (MEMBAWA STATUS PERSPEKTIF AKTIF) ---
        function filterMasterFromCondition(conditionName) {
            activeDashboardFilterType = 'CONDITION'; 
            activeConditionFilter = conditionName;
            // activeStatusType sudah bernilai 'aset' atau 'label' sesuai tombol switch yang sedang aktif di dashboard!
            switchView('scannedAssetView');
        }

        // Fungsi tombol switch kategori (Status Aset vs Status Label)
        function setDamageCategory(statusType) {
            activeStatusType = statusType; // 'aset' atau 'label'
            
            const btnAset = document.getElementById('btnSwitchAset');
            const btnLabel = document.getElementById('btnSwitchLabel');
            
            if (statusType === 'aset') {
                if (btnAset) btnAset.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-daihatsu-600 text-white shadow-xs";
                if (btnLabel) btnLabel.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-slate-200 text-slate-700 hover:bg-slate-300";
            } else {
                if (btnLabel) btnLabel.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-daihatsu-600 text-white shadow-xs";
                if (btnAset) btnAset.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-slate-200 text-slate-700 hover:bg-slate-300";
            }
            
            renderDynamicFilteredTable();
        }

        // --- RENDER TABEL RINCIAN DENGAN JUDUL & LABEL DINAMIS YANG SESUAI ---
        function renderDynamicFilteredTable() {
            const searchVal = safeGetValue('filterSearchInput').toLowerCase().trim();
            const branchVal = safeGetValue('branchSelector', 'ALL');
            const tbody = document.getElementById('filterTableBody');
            const thead = document.getElementById('filterTableHead');
            const banner = document.getElementById('filterViewBanner');
            const badge = document.getElementById('filterViewBadge');
            const titleEl = document.getElementById('filterViewTitle');
            const descEl = document.getElementById('filterViewDesc');
        
            if (!tbody || !thead) return;
            tbody.innerHTML = '';
        
            const scopedMasterAssets = branchVal === 'ALL' ? assets : assets.filter(a => a.cabang.startsWith(branchVal) || branchVal.startsWith(a.cabang));
            const scopedLogs = branchVal === 'ALL' ? historyLogs : historyLogs.filter(h => h.cabang.startsWith(branchVal) || branchVal.startsWith(h.cabang));
            const scannedAssetIds = new Set(scopedLogs.map(h => String(h.assetId).trim().toLowerCase()));
        
            let targetData = [];
        
            // Definisikan style warna gelap yang konsisten untuk banner rincian di semua menu
            const darkBannerStyle = "bg-gradient-to-r from-slate-900 via-astra-900 to-slate-950 text-white rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all border border-slate-700/60";
        
            if (activeDashboardFilterType === 'SCANNED') {
                targetData = scopedLogs.filter(item => {
                    const searchTarget = `${item.assetId} ${item.subNumber} ${item.deskripsi} ${item.lokasiSap} ${item.lokasiOpname} ${item.keterangan || ''}`.toLowerCase();
                    return searchTarget.includes(searchVal);
                });
        
                if (banner) banner.className = darkBannerStyle;
                if (badge) {
                    badge.className = "text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-300 bg-emerald-950/90 px-3 py-1 rounded-full inline-flex items-center gap-1.5 border border-emerald-500/40 shadow-xs";
                    badge.innerHTML = `<i class="fa-solid fa-circle-check text-[10px]"></i> Verified Asset Log`;
                }
                if (titleEl) titleEl.innerText = "Daftar Aset yang Sudah Terscan";
                if (descEl) descEl.innerText = "Rekapitulasi unit aset yang telah berhasil diverifikasi fisiknya di lapangan.";
        
                thead.innerHTML = `
                    <tr>
                        <th class="py-3 px-3 text-center w-12">NO</th>
                        <th class="py-3 px-3">Tanggal Scan</th>
                        <th class="py-3 px-3">Nomor Aset + Sub</th>
                        <th class="py-3 px-3">Business Area</th>
                        <th class="py-3 px-3">Deskripsi Aset</th>
                        <th class="py-3 px-3">Lokasi (SAP)</th>
                        <th class="py-3 px-3">Lokasi (Opname)</th>
                        <th class="py-3 px-3">Waktu Scan</th>
                        <th class="py-3 px-3">Status Aset</th>
                        <th class="py-3 px-3">Status Label</th>
                        <th class="py-3 px-3 text-center">Foto Temuan</th>
                        <th class="py-3 px-3">Keterangan</th>
                    </tr>
                `;
        
            } else if (activeDashboardFilterType === 'PENDING') {
                const pendingAssets = scopedMasterAssets.filter(a => !scannedAssetIds.has(String(a.id).trim().toLowerCase()));
                targetData = pendingAssets.filter(item => {
                    const searchTarget = `${item.id} ${item.subNumber} ${item.deskripsi} ${item.lokasi}`.toLowerCase();
                    return searchTarget.includes(searchVal);
                });
        
                if (banner) banner.className = darkBannerStyle;
                if (badge) {
                    badge.className = "text-[10px] sm:text-xs font-bold uppercase tracking-wider text-daihatsu-300 bg-daihatsu-950/90 px-3 py-1 rounded-full inline-flex items-center gap-1.5 border border-daihatsu-500/40 shadow-xs";
                    badge.innerHTML = `<i class="fa-solid fa-hourglass-half text-[10px]"></i> Pending Verification`;
                }
                if (titleEl) titleEl.innerText = "Daftar Aset yang Belum Di-scan";
                if (descEl) descEl.innerText = "Daftar unit sisa target opname yang belum dipindai fisiknya di cabang ini.";
        
                thead.innerHTML = `
                    <tr>
                        <th class="py-3 px-3 text-center w-12">NO</th>
                        <th class="py-3 px-3">Asset ID</th>
                        <th class="py-3 px-3">Sub-Number</th>
                        <th class="py-3 px-3">Business Area</th>
                        <th class="py-3 px-3">Asset Description</th>
                        <th class="py-3 px-3">Capitalized On</th>
                        <th class="py-3 px-3">Room (Lokasi SAP)</th>
                        <th class="py-3 px-3 text-center">Aksi Cepat</th>
                    </tr>
                `;
        
            } else if (activeDashboardFilterType === 'CONDITION') {
                targetData = scopedLogs.filter(item => {
                    const targetVal = activeStatusType === 'aset' ? (item.statusAset || "") : (item.statusLabel || "");
                    const itemVal = String(targetVal).trim().toLowerCase();
                    const filterVal = String(activeConditionFilter).trim().toLowerCase();
            
                    let matchCondition = false;
                    
                    if (filterVal.includes('berat')) {
                        matchCondition = itemVal.includes('berat');
                    } else if (filterVal.includes('ringan') || filterVal.includes('rusak')) {
                        // Mengakomodasi 'statusAset' (Rusak Ringan) maupun 'statusLabel' (Rusak / Sobek)
                        if (activeStatusType === 'label') {
                            matchCondition = itemVal.includes('rusak') || itemVal.includes('sobek') || itemVal.includes('tidak');
                        } else {
                            matchCondition = itemVal.includes('ringan') || (itemVal.includes('rusak') && !itemVal.includes('berat'));
                        }
                    } else if (filterVal.includes('baik')) {
                        matchCondition = itemVal.includes('baik');
                    } else if (filterVal.includes('hilang') || filterVal.includes('tidak')) {
                        matchCondition = itemVal.includes('hilang') || itemVal.includes('tidak');
                    } else {
                        matchCondition = itemVal === filterVal || itemVal.includes(filterVal);
                    }
            
                    const searchTarget = `${item.assetId} ${item.subNumber} ${item.deskripsi} ${item.lokasiSap} ${item.keterangan || ''}`.toLowerCase();
                    return matchCondition && searchTarget.includes(searchVal);
                });
        
                // Label teks dinamis untuk banner rincian (Menampilkan apakah ini Aset atau Label)
                const perspectiveLabel = activeStatusType === 'aset' ? 'Status Fisik Aset' : 'Status Label Barcode';
        
                if (banner) banner.className = darkBannerStyle;
                if (badge) {
                    badge.className = "text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-300 bg-amber-950/90 px-3 py-1 rounded-full inline-flex items-center gap-1.5 border border-amber-500/50 shadow-xs";
                    badge.innerHTML = `<i class="fa-solid fa-chart-pie text-[10px]"></i> Condition Breakdown (${activeStatusType.toUpperCase()})`;
                }
                if (titleEl) titleEl.innerText = `Rincian - ${perspectiveLabel}: ${activeConditionFilter}`;
                if (descEl) descEl.innerText = `Menampilkan daftar unit berdasarkan kriteria ${perspectiveLabel.toLowerCase()} yang dipilih dari dashboard.`;
                
                thead.innerHTML = `
                    <tr>
                        <th class="py-3 px-3 text-center w-12">NO</th>
                        <th class="py-3 px-3">Tanggal Scan</th>
                        <th class="py-3 px-3">Nomor Aset + Sub</th>
                        <th class="py-3 px-3">Business Area</th>
                        <th class="py-3 px-3">Deskripsi Aset</th>
                        <th class="py-3 px-3">Lokasi (SAP)</th>
                        <th class="py-3 px-3">Lokasi (Opname)</th>
                        <th class="py-3 px-3">Waktu Scan</th>
                        <th class="py-3 px-3">Status Aset</th>
                        <th class="py-3 px-3">Status Label</th>
                        <th class="py-3 px-3 text-center">Foto Temuan</th>
                        <th class="py-3 px-3">Keterangan</th>
                    </tr>
                `;
            }
        
            safeSetText('filterViewTotalCount', `${targetData.length} Unit`);
        
            if (targetData.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="12" class="text-center py-8 text-slate-400">
                            <i class="fa-solid fa-box-open text-2xl mb-1 block"></i>
                            Tidak ada data aset ditemukan untuk filter ini.
                        </td>
                    </tr>`;
            } else {
                targetData.forEach((item, index) => {
                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-50 transition border-b border-slate-100 text-xs";
        
                    if (activeDashboardFilterType === 'PENDING') {
                        tr.innerHTML = `
                            <td class="py-2.5 px-3 text-center font-mono text-slate-400 font-bold">${index + 1}</td>
                            <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${item.id}</td>
                            <td class="py-2.5 px-3 font-mono text-slate-600">${item.subNumber || '0'}</td>
                            <td class="py-2.5 px-3 font-semibold text-slate-700">${item.cabang}</td>
                            <td class="py-2.5 px-3 font-semibold text-slate-800">${item.deskripsi}</td>
                            <td class="py-2.5 px-3 font-mono text-slate-500 text-[11px]">${item.capitalizedOn || '-'}</td>
                            <td class="py-2.5 px-3"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono text-[11px]">${item.lokasi}</span></td>
                            <td class="py-2.5 px-3 text-center">
                                <button onclick='openOpnameModal({"id": "${item.id}", "subNumber": "${item.subNumber || '0'}", "cabang": "${item.cabang}", "deskripsi": "${item.deskripsi.replace(/'/g, "\\'")}", "lokasi": "${item.lokasi}"}, "Manual")' class="bg-daihatsu-50 hover:bg-daihatsu-100 text-daihatsu-700 border border-daihatsu-200 px-2.5 py-1 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-2xs">
                                    <i class="fa-solid fa-clipboard-check"></i>
                                    <span>Opname</span>
                                </button>
                            </td>
                        `;
                    } else {
                        const isAsetBaik = item.statusAset === 'Baik';
                        const asetBadge = isAsetBaik
                            ? `<span class="bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full text-[10px]">${item.statusAset}</span>`
                            : `<span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full text-[10px]">${item.statusAset}</span>`;
        
                        const isLabelBaik = item.statusLabel === 'Baik';
                        const labelBadge = isLabelBaik
                            ? `<span class="bg-emerald-50 text-emerald-700 font-medium px-2 py-0.5 rounded text-[10px]">Baik</span>`
                            : `<span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px]">${item.statusLabel}</span>`;
        
                        let fotoHtml = `<span class="text-slate-400 italic">-</span>`;
                        if (item.asetTemuan) {
                            if (item.asetTemuan.startsWith("http")) {
                                fotoHtml = `<a href="${item.asetTemuan}" target="_blank" class="px-2 py-1 bg-astra-50 text-astra-700 border border-astra-200 rounded font-bold text-[10px]">Drive</a>`;
                            } else {
                                fotoHtml = `<button onclick="viewPhotoDetail('${item.asetTemuan}')" class="p-0.5 rounded border border-rose-300 bg-white"><img src="${item.asetTemuan}" class="w-8 h-8 object-cover rounded"></button>`;
                            }
                        }
        
                        tr.innerHTML = `
                            <td class="py-2.5 px-3 text-center font-mono text-slate-400 font-bold">${index + 1}</td>
                            <td class="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">${formatDisplayDate(item.tanggalScan)}</td>
                            <td class="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">${item.assetId} ${item.subNumber || '0'}</td>
                            <td class="py-2.5 px-3 font-semibold text-slate-700">${item.cabang}</td>
                            <td class="py-2.5 px-3 font-semibold text-slate-800">${item.deskripsi}</td>
                            <td class="py-2.5 px-3 font-mono text-slate-600">${item.lokasiSap || '-'}</td>
                            <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${item.lokasiOpname || '-'}</td>
                            <td class="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">${formatDisplayTime(item.waktuScan)}</td>
                            <td class="py-2.5 px-3 whitespace-nowrap">${asetBadge}</td>
                            <td class="py-2.5 px-3 whitespace-nowrap">${labelBadge}</td>
                            <td class="py-2.5 px-3 text-center whitespace-nowrap">${fotoHtml}</td>
                            <td class="py-2.5 px-3 text-slate-600 max-w-xs truncate">${item.keterangan || '-'}</td>
                        `;
                    }
                    tbody.appendChild(tr);
                });
            }
            safeSetText('filterTableCountSummary', `Menampilkan ${targetData.length} unit`);
        }
        
        // --- FUNGSI EXPORT EXCEL SESUAI DATA RINCIAN YANG TAMPIL ---
        function exportFilterViewToExcel() {
            try {
                const searchVal = safeGetValue('filterSearchInput').toLowerCase().trim();
                const branchVal = safeGetValue('branchSelector', 'ALL');
                
                const scopedMasterAssets = branchVal === 'ALL' 
                    ? assets 
                    : assets.filter(a => a.cabang.startsWith(branchVal) || branchVal.startsWith(a.cabang));
        
                const scopedLogs = branchVal === 'ALL' 
                    ? historyLogs 
                    : historyLogs.filter(h => h.cabang.startsWith(branchVal) || branchVal.startsWith(h.cabang));
        
                const scannedAssetIds = new Set(scopedLogs.map(h => String(h.assetId).trim().toLowerCase()));
        
                let exportData = [];
                let filename = "";
        
                if (activeDashboardFilterType === 'SCANNED') {
                    const targetData = scopedLogs.filter(item => {
                        const searchTarget = `${item.assetId} ${item.subNumber} ${item.deskripsi} ${item.lokasiSap} ${item.lokasiOpname} ${item.keterangan || ''}`.toLowerCase();
                        return searchTarget.includes(searchVal);
                    });
        
                    exportData = targetData.map((h, i) => ({
                        "NO": i + 1,
                        "Tanggal Scan": formatDisplayDate(h.tanggalScan),
                        "ID Asset": h.assetId,
                        "Sub-Number": h.subNumber || '0',
                        "Business Area": h.cabang,
                        "Asset Description": h.deskripsi,
                        "Lokasi (SAP)": h.lokasiSap,
                        "Lokasi (Opname)": h.lokasiOpname,
                        "Waktu Scan": h.waktuScan,
                        "Status Aset": h.statusAset,
                        "Status Label": h.statusLabel,
                        "Keterangan": h.keterangan || "-"
                    }));
                    filename = `Aset_Terscan_${branchVal}_${new Date().toISOString().slice(0,10)}.xlsx`;
        
                } else if (activeDashboardFilterType === 'PENDING') {
                    const pendingAssets = scopedMasterAssets.filter(a => !scannedAssetIds.has(String(a.id).trim().toLowerCase()));
                    const targetData = pendingAssets.filter(item => {
                        const searchTarget = `${item.id} ${item.subNumber} ${item.deskripsi} ${item.lokasi}`.toLowerCase();
                        return searchTarget.includes(searchVal);
                    });
        
                    exportData = targetData.map((a, i) => ({
                        "NO": i + 1,
                        "ID Asset": a.id,
                        "Sub-Number": a.subNumber || '0',
                        "Business Area": a.cabang,
                        "Asset Description": a.deskripsi,
                        "Capitalized On": a.capitalizedOn || '-',
                        "Room (Lokasi SAP)": a.lokasi,
                        "Status": "Belum Di-scan"
                    }));
                    filename = `Aset_Belum_Discan_${branchVal}_${new Date().toISOString().slice(0,10)}.xlsx`;
        
                } else if (activeDashboardFilterType === 'CONDITION') {
                    // SINKRONISASI LOGIKA FILTER EKSPOR DENGAN TABEL RINCIAN
                    const targetData = scopedLogs.filter(item => {
                        const targetVal = activeStatusType === 'aset' ? (item.statusAset || "") : (item.statusLabel || "");
                        const itemVal = String(targetVal).trim().toLowerCase();
                        const filterVal = String(activeConditionFilter).trim().toLowerCase();
        
                        let matchCondition = false;
                        if (filterVal.includes('baik')) {
                            matchCondition = itemVal.includes('baik');
                        } else if (filterVal.includes('ringan') || filterVal.includes('rusak')) {
                            matchCondition = itemVal.includes('ringan') || itemVal.includes('rusak');
                        } else if (filterVal.includes('berat')) {
                            matchCondition = itemVal.includes('berat');
                        } else if (filterVal.includes('hilang') || filterVal.includes('tidak')) {
                            matchCondition = itemVal.includes('hilang') || itemVal.includes('tidak');
                        } else {
                            matchCondition = itemVal === filterVal || itemVal.includes(filterVal);
                        }
        
                        const searchTarget = `${item.assetId} ${item.subNumber} ${item.deskripsi} ${item.lokasiSap} ${item.keterangan || ''}`.toLowerCase();
                        return matchCondition && searchTarget.includes(searchVal);
                    });
        
                    exportData = targetData.map((h, i) => ({
                        "NO": i + 1,
                        "Tanggal Scan": formatDisplayDate(h.tanggalScan),
                        "ID Asset": h.assetId,
                        "Sub-Number": h.subNumber || '0',
                        "Business Area": h.cabang,
                        "Asset Description": h.deskripsi,
                        "Lokasi (SAP)": h.lokasiSap,
                        "Lokasi (Opname)": h.lokasiOpname,
                        "Waktu Scan": h.waktuScan,
                        "Status Aset": h.statusAset,
                        "Status Label": h.statusLabel,
                        "Keterangan": h.keterangan || "-"
                    }));
                    filename = `Rincian_${activeStatusType}_${activeConditionFilter}_${branchVal}_${new Date().toISOString().slice(0,10)}.xlsx`;
                }
        
                if (exportData.length === 0) {
                    showToast('Tidak Ada Data', 'Tidak ada data pada tabel rincian ini untuk diexport.', 'warning');
                    return;
                }
        
                const worksheet = XLSX.utils.json_to_sheet(exportData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Rincian_Filtered");
                XLSX.writeFile(workbook, filename);
                showToast('Export Berhasil', 'File Excel rincian berhasil diunduh.', 'success');
            } catch (err) {
                console.error(err);
                showToast('Gagal Export', 'Terjadi kesalahan saat memproses file Excel.', 'warning');
            }
        }
                
        function safeSetText(id, text) {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        }
    
        function safeGetValue(id, fallback = '') {
            const el = document.getElementById(id);
            return el ? el.value : fallback;
        }

        function handleLogout() {
            askConfirm(
                'Konfirmasi Keluar',
                'Fitur autentikasi login penuh akan diaktifkan di tahap akhir. Untuk saat ini, sesi tetap terbuka.',
                () => {
                    showToast('Informasi', 'Sesi saat ini aktif dalam mode operasional bebas.', 'info');
                }
            );
        }

        function loadLogsFromServer() {
            fetch(`${PROXY_API_URL}?action=getLogs`)
                .then(res => res.json())
                .then(res => {
                    if (res.status === "success" && Array.isArray(res.data)) {
                        historyLogs = res.data;
                        renderKPIs();
                        renderHistoryTable();
                        renderRecapView();
                    }
                })
                .catch(err => {
                    console.log("Background sync error:", err);
                });
        }

        // --- BACKEND DATABASE INTEGRATION ---
        function fetchDataFromBackend() {
            showToast('Sinkronisasi', 'Mengambil data dari server...', 'info');
        
            // 1. Ambil Data Master Aset
            fetch(`${PROXY_API_URL}?action=getAssets`)
                .then(res => {
                    // Cek apakah response dari server berupa JSON valid atau error HTTP
                    if (!res.ok) {
                        throw new Error(`HTTP error! status: ${res.status}`);
                    }
                    return res.text(); // Ambil sebagai teks dulu untuk antisipasi HTML error
                })
                .then(text => {
                    try {
                        const res = JSON.parse(text);
                        if (res.status === "success" && Array.isArray(res.data)) {
                            assets = res.data;
                            populateRoomFilterDropdown(); 
                            renderKPIs();
                            renderTable();
                            renderHistoryTable();
                            renderRecapView();
                            showToast('Sukses', 'Data master berhasil dimuat dari server.', 'success');
                        } else {
                            showToast('Informasi', res.message || 'Server merespons tetapi data kosong.', 'info');
                        }
                    } catch (e) {
                        console.error("Format JSON tidak valid:", text);
                        showToast('Kesalahan Format', 'Server mengembalikan respons non-JSON (HTML/Error). Periksa rute /api/proxy di Vercel.', 'warning');
                    }
                })
                .catch(err => {
                    console.error("Backend Error:", err);
                    showToast('Koneksi Server', 'Gagal terhubung ke backend API Vercel.', 'warning');
                });
        
            // 2. Ambil Data Log Riwayat
            fetch(`${PROXY_API_URL}?action=getLogs`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    return res.text();
                })
                .then(text => {
                    try {
                        const res = JSON.parse(text);
                        if (res.status === "success" && Array.isArray(res.data)) {
                            historyLogs = res.data;
                            renderKPIs();
                            renderHistoryTable();
                            renderRecapView();
                        }
                    } catch (e) {
                        console.error("Format JSON Log tidak valid:", text);
                    }
                })
                .catch(err => console.error("Error getLogs:", err));
        }
        function sendLogToServer(logData) {
            // Mengirim data menggunakan jalur Proxy Vercel yang aman dan terintegrasi token
            return fetch(PROXY_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: "addLog", data: logData })
            })
            .then(res => res.json())
            .then(res => {
                if (res.status === "success") {
                    console.log("Log berhasil masuk database Google Spreadsheet.");
                    return true;
                } else {
                    console.warn("Database menolak:", res.message);
                    return false;
                }
            })
            .catch(err => {
                console.error("Proxy sync error:", err);
                return false;
            });
        }
        
        function deleteSingleLog(assetId, subNumber) {
            askConfirm(
                'Hapus Log Riwayat',
                `Apakah Anda yakin ingin menghapus log untuk Aset ID ${assetId}? Data akan dihapus permanen dari Google Spreadsheet.`,
                () => {
                    showToast('Menghapus...', 'Menghapus data dari database...', 'info');

                    fetch(PROXY_API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: "deleteLog",
                            assetId: assetId,
                            subNumber: subNumber
                        })
                    })
                    .then(res => res.json())
                    .then(res => {
                        if (res.status === "success") {
                            historyLogs = historyLogs.filter(h => !(String(h.assetId) === String(assetId) && String(h.subNumber || '0') === String(subNumber || '0')));
                            renderHistoryTable();
                            renderKPIs();
                            renderRecapView();
                            
                            // NOTIFIKASI SUKSES DATA DIHAPUS
                            showToast('Berhasil Dihapus!', `Log aset ${assetId} telah berhasil dihapus dari database Google Spreadsheet.`, 'success');
                        } else {
                            showToast('Gagal Hapus', res.message || 'Server gagal menghapus data.', 'warning');
                        }
                    })
                    .catch(err => {
                        console.error("Delete Error:", err);
                        showToast('Koneksi Gagal', 'Tidak dapat terhubung ke server untuk menghapus data.', 'warning');
                    });
                }
            );
        }

        function requestClearAllHistory() {
            askConfirm(
                'Hapus Semua Riwayat Stock Opname',
                'Apakah Anda yakin ingin membersihkan seluruh log riwayat? Data di Google Spreadsheet akan ikut terhapus permanen.',
                () => {
                    showToast('Membersihkan...', 'Mengosongkan seluruh data dari database...', 'info');

                    fetch(PROXY_API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: "clearAllLogs" })
                    })
                    .then(res => res.json())
                    .then(res => {
                        if (res.status === "success") {
                            historyLogs = [];
                            renderHistoryTable();
                            renderKPIs();
                            renderRecapView();
                            
                            // NOTIFIKASI SUKSES SEMUA DATA DIHAPUS
                            showToast('Database Bersih!', 'Seluruh riwayat pemindaian telah berhasil dikosongkan dari Google Spreadsheet.', 'success');
                        } else {
                            showToast('Gagal', res.message || 'Gagal membersihkan log.', 'warning');
                        }
                    })
                    .catch(err => {
                        console.error("Clear All Error:", err);
                        showToast('Koneksi Gagal', 'Gagal terhubung ke server.', 'warning');
                    });
                }
            );
        }
        
        // --- AUDIO FEEDBACK ---
        function playBeepSound(type = 'success') {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.connect(gain);
                gain.connect(ctx.destination);

                if (type === 'success') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(880, ctx.currentTime);
                    gain.gain.setValueAtTime(0.15, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.15);
                } else {
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(300, ctx.currentTime);
                    gain.gain.setValueAtTime(0.2, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.3);
                }
            } catch (e) {}
        }

        function saveSheetsUrl(url) {
            googleSheetsWebhookUrl = url.trim();
            localStorage.setItem('app_sheets_url', googleSheetsWebhookUrl);
            if (googleSheetsWebhookUrl) {
                showToast('URL Google Sheets Tersimpan', 'Sistem akan mengirimkan data scan ke URL ini.', 'success');
            }
        }

        function updateAuditorName(name) {
            safeSetText('sidebarAuditorName', name || 'Petugas Audit');
        }

        // --- OPNAME LOOKUP & SCAN HANDLERS ---
        function triggerOpnameLookup(method = 'Scan') {
            const inputEl = document.getElementById('mainBarcodeInput');
            if (!inputEl) return;
        
            const barcodeText = inputEl.value.trim();
            if (!barcodeText) {
                playBeepSound('error');
                showToast('Input Kosong', 'Harap masukkan ID Asset barcode terlebih dahulu.', 'warning');
                return;
            }
        
            let cleanedText = barcodeText.replace(/[-_]/g, " ");
            let parts = cleanedText.split(/\s+/);
            let scannedId = parts[0].trim().toLowerCase();
            let scannedSub = (parts[1] || "0").trim().toLowerCase();
        
            let foundAsset = assets.find(a => {
                let dbId = String(a.id || a["ID Asset"] || "").trim().toLowerCase();
                let dbSub = String(a.subNumber !== undefined ? a.subNumber : (a["Sub-Number"] !== undefined ? a["Sub-Number"] : "0")).trim().toLowerCase();
                return dbId === scannedId && dbSub === scannedSub;
            }) || assets.find(a => {
                let dbId = String(a.id || a["ID Asset"] || "").trim().toLowerCase();
                return dbId === scannedId;
            });
        
            if (!foundAsset) {
                playBeepSound('error');
                showToast('Aset Tidak Ditemukan', `Nomor Barcode "${barcodeText}" tidak terdaftar di Master Aset.`, 'warning');
                return;
            }
        
            // Meneruskan parameter method secara tegas ('Scan' atau 'Manual')
            openOpnameModal(foundAsset, method);
        }
        // --- UI UTILITIES & TOASTS ---
        function showToast(title, message, type = 'success') {
            const toastBox = document.getElementById('toastBox');
            if (!toastBox) return;

            safeSetText('toastTitle', title);
            safeSetText('toastMessage', message);

            const iconEl = document.getElementById('toastIcon');
            if (iconEl) {
                if (type === 'success') {
                    iconEl.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
                } else if (type === 'warning') {
                    iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i>';
                } else {
                    iconEl.innerHTML = '<i class="fa-solid fa-circle-info text-astra-400"></i>';
                }
            }

            clearTimeout(toastTimeout);
            toastBox.classList.remove('-translate-y-32');
            toastBox.classList.add('translate-y-0');

            toastTimeout = setTimeout(() => { hideToast(); }, 3500);
        }

        function hideToast() {
            const toastBox = document.getElementById('toastBox');
            if (toastBox) {
                toastBox.classList.remove('translate-y-0');
                toastBox.classList.add('-translate-y-32');
            }
        }

        function closeInfoModal() {
            const modal = document.getElementById('infoModal');
            if (modal) modal.classList.add('hidden');
        }

        function askConfirm(title, message, callback) {
            safeSetText('confirmModalTitle', title);
            safeSetText('confirmModalMessage', message);
            pendingConfirmCallback = callback;
            const modal = document.getElementById('confirmModal');
            if (modal) modal.classList.remove('hidden');
        }

        function closeConfirmModal(accepted) {
            const modal = document.getElementById('confirmModal');
            if (modal) modal.classList.add('hidden');
        }

        function executePendingConfirmAction() {
            closeConfirmModal(true);
            if (typeof pendingConfirmCallback === 'function') {
                pendingConfirmCallback();
                pendingConfirmCallback = null;
            }
        }

        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (!sidebar || !overlay) return;

            const isClosed = sidebar.classList.contains('-translate-x-full');
            if (isClosed) {
                sidebar.classList.remove('-translate-x-full');
                overlay.classList.remove('hidden');
            } else {
                sidebar.classList.add('-translate-x-full');
                overlay.classList.add('hidden');
            }
        }

        function switchView(viewName) {
            const views = {
                dashboard: document.getElementById('dashboardView'),
                masterdata: document.getElementById('masterDataView'),
                history: document.getElementById('auditHistoryView'),
                recap: document.getElementById('recapView'),
                settings: document.getElementById('settingsView'),
                scannedAssetView: document.getElementById('scannedAssetView') // ID wadah halaman khusus
            };

            const desktopBtns = {
                dashboard: document.getElementById('navBtnDashboard'),
                masterdata: document.getElementById('navBtnMasterData'),
                history: document.getElementById('navBtnHistory'),
                recap: document.getElementById('navBtnRecap'),
                settings: document.getElementById('navBtnSettings')
            };

            const mobileBtns = {
                dashboard: document.getElementById('mobileNavDashboard'),
                masterdata: document.getElementById('mobileNavMasterData'),
                history: document.getElementById('mobileNavHistory'),
                recap: document.getElementById('mobileNavRecap')
            };

            Object.keys(views).forEach(key => {
                if (views[key]) {
                    if (key === viewName) views[key].classList.remove('hidden');
                    else views[key].classList.add('hidden');
                }
            });

            Object.keys(desktopBtns).forEach(key => {
                if (desktopBtns[key]) {
                    if (key === viewName) {
                        desktopBtns[key].className = "w-full flex items-center space-x-3 px-3 py-3 sm:py-2.5 rounded-xl sm:rounded-lg bg-daihatsu-600 text-white font-medium text-sm transition text-left";
                    } else {
                        desktopBtns[key].className = "w-full flex items-center space-x-3 px-3 py-3 sm:py-2.5 rounded-xl sm:rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 font-medium text-sm transition text-left";
                    }
                }
            });

            Object.keys(mobileBtns).forEach(key => {
                if (mobileBtns[key]) {
                    if (key === viewName) {
                        mobileBtns[key].className = "flex flex-col items-center justify-center py-1 px-2 text-daihatsu-600 font-bold transition";
                    } else {
                        mobileBtns[key].className = "flex flex-col items-center justify-center py-1 px-2 text-slate-400 font-medium transition";
                    }
                }
            });

            const titleMap = {
                dashboard: "Stock Opname",
                masterdata: "Daftar Aset ",
                history: "Riwayat Scan ",
                recap: "Rekap Aset & Ruangan",
                settings: "Pengaturan"
            };
            safeSetText('headerViewTitle', titleMap[viewName] || "Stock Opname");

            const sidebar = document.getElementById('sidebar');
            if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
                toggleSidebar();
            }

            if (viewName === 'dashboard') renderKPIs();
            if (viewName === 'masterdata') {
                // Jika masuk lewat sidebar secara manual, reset filter status ke ALL
                // Tapi jika diklik dari kartu dashboard, biarkan status filternya sesuai pilihan kartu
                renderTable();
            }
            if (viewName === 'history') renderHistoryTable();
            if (viewName === 'recap') renderRecapView();
            if (viewName === 'scannedAssetView') renderDynamicFilteredTable();
        }

        function onBranchChange() {
            currentPage = 1;
            renderKPIs();
            renderTable();
            renderHistoryTable();
            renderRecapView();
        }

        // --- OPNAME MODAL ACTIONS ---
        function openOpnameModal(assetObj, method) {
            const activeUser = localStorage.getItem('asv_active_user');
            if (!activeUser) {
                showToast('Login Diperlukan', 'Silakan masuk/login terlebih dahulu untuk melakukan verifikasi aset.', 'warning');
                openLoginModal();
                return;
            }

            activeOpnameAsset = assetObj;
            
            let detectedMethod = method || (window.isLastOpnameManual ? 'Manual' : 'Scan');
            activeOpnameMethod = String(detectedMethod).trim();
            activeEvidencePhoto = null;
        
            safeSetText('opnameModalDeskripsi', assetObj.deskripsi);
            safeSetText('opnameModalNomorSub', `${assetObj.id} ${assetObj.subNumber || '0'}`);
            safeSetText('opnameModalCabang', `${assetObj.cabang} - ${branchNames[assetObj.cabang] || ''}`);
            safeSetText('opnameModalLokasiSAP', assetObj.lokasi);
        
            const lokasiInput = document.getElementById('opnameInputLokasiActual');
            if (lokasiInput) lokasiInput.value = assetObj.lokasi;
        
            const isManual = activeOpnameMethod.toLowerCase().includes('manual');
            const finalMethodText = isManual ? 'Manual' : 'Scan';
        
            // Set nilai ke ID yang baru
            const metodeInput = document.getElementById('opnameModalInputMetodeFinal');
            if (metodeInput) {
                metodeInput.value = finalMethodText;
            }
        
            window.isLastOpnameManual = false;
        
            clearEvidencePhoto();
            toggleAttachmentHighlight();
        
            const modal = document.getElementById('opnameModal');
            if (modal) {
                modal.classList.remove('hidden');
            }
        }
        
        function closeOpnameModal() {
            const modal = document.getElementById('opnameModal');
            if (modal) modal.classList.add('hidden');
            activeOpnameAsset = null;
        }

        function toggleAttachmentHighlight() {
            const statusAset = safeGetValue('opnameInputStatusAset');
            const statusLabel = safeGetValue('opnameInputStatusLabel');
            const box = document.getElementById('temuanAttachmentBox');
            const badge = document.getElementById('temuanBadge');
        
            // Foto wajib HANYA jika status aset rusak atau label rusak. 
            // Jika "Hilang / Tidak Ditemukan" atau "Tidak Ada" label, foto bersifat opsional karena fisiknya tidak ada.
            const isAsetRusak = (statusAset === 'Rusak Ringan' || statusAset === 'Rusak Berat');
            const isLabelRusak = (statusLabel === 'Rusak'); // Sesuai pilihan "Rusak / Sobek / Pudar"
            const isWajibFoto = isAsetRusak || isLabelRusak;
        
            if (box && badge) {
                if (isWajibFoto) {
                    box.className = "border-2 border-dashed border-rose-300 rounded-xl p-3 sm:p-4 bg-rose-50/60 transition space-y-2";
                    badge.innerText = "Wajib Dilampirkan";
                    badge.className = "text-[9px] font-bold text-rose-700 bg-rose-200 px-2 py-0.5 rounded-full";
                } else {
                    box.className = "border border-dashed border-slate-300 rounded-xl p-3 sm:p-4 bg-slate-50 transition space-y-2";
                    badge.innerText = "Opsional";
                    badge.className = "text-[9px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full";
                }
            }
        }
        
        function handleNativeCameraScan(event) {
            const file = event.target.files[0];
            if (!file) return;

            showToast('Memindai Foto', 'Mendeteksi barcode dari foto kamera HP...', 'info');

            const html5QrCode = new Html5Qrcode("cameraReader");
            
            html5QrCode.scanFile(file, true)
                .then(decodedText => {
                    html5QrCode.clear();
                    let rawText = decodedText.trim();
                    if (rawText.length < 8) {
                        showToast('Tidak Valid', 'Barcode terlalu pendek atau tidak terbaca.', 'warning');
                        return;
                    }

                    playBeepSound('success');
                    const inputEl = document.getElementById('mainBarcodeInput');
                    if (inputEl) inputEl.value = rawText;

                    let cleanedText = rawText.replace(/[-_]/g, " ");
                    let parts = cleanedText.split(/\s+/);
                    let scannedId = parts[0].trim().toLowerCase();
                    let scannedSub = (parts[1] || "0").trim().toLowerCase();

                    // Cari aset di master data
                    let foundAsset = assets.find(a => {
                        let dbId = String(a.id || a["ID Asset"] || "").trim().toLowerCase();
                        let dbSub = String(a.subNumber !== undefined ? a.subNumber : (a["Sub-Number"] !== undefined ? a["Sub-Number"] : "0")).trim().toLowerCase();
                        return dbId === scannedId && dbSub === scannedSub;
                    }) || assets.find(a => {
                        let dbId = String(a.id || a["ID Asset"] || "").trim().toLowerCase();
                        return dbId === scannedId;
                    });

                    if (!foundAsset) {
                        playBeepSound('error');
                        showToast('Tidak Terdaftar', `Nomor Aset "${rawText}" tidak ada di Master Data.`, 'warning');
                        return;
                    }

                    // Cek duplikat harian
                    const todayStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
                    const alreadyScannedToday = historyLogs.some(h => {
                        let hId = String(h.assetId || "").trim().toLowerCase();
                        let hSub = String(h.subNumber || "0").trim().toLowerCase();
                        let hDate = String(h.tanggalScan || "").trim();
                        return hId === String(foundAsset.id).trim().toLowerCase() && 
                               hSub === String(foundAsset.subNumber || "0").trim().toLowerCase() && 
                               hDate === todayStr;
                    });

                    if (alreadyScannedToday) {
                        playBeepSound('error');
                        showToast('Aset Sudah Terscan', `Aset ${foundAsset.id} sudah pernah dipindai hari ini.`, 'warning');
                        return;
                    }

                    // PENTING: Buka modal verifikasi agar petugas bisa klik tombol "Simpan Log Opname"
                    openOpnameModal(foundAsset, 'Scan');
                })
                .catch(err => {
                    html5QrCode.clear();
                    playBeepSound('error');
                    showToast('Barcode Tidak Terbaca', 'Pastikan foto stiker barcode jelas dan fokus.', 'warning');
                });
        }

        function handleEvidencePhoto(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                activeEvidencePhoto = e.target.result;
                const previewImg = document.getElementById('temuanPreviewImg');
                const previewContainer = document.getElementById('temuanPreviewContainer');
                const btnRemove = document.getElementById('btnRemoveFoto');

                if (previewImg) previewImg.src = activeEvidencePhoto;
                if (previewContainer) previewContainer.classList.remove('hidden');
                if (btnRemove) btnRemove.classList.remove('hidden');

                showToast('Foto Terlampir', 'Foto bukti temuan berhasil dimuat.', 'success');
            };
            reader.readAsDataURL(file);
        }

        function clearEvidencePhoto() {
            activeEvidencePhoto = null;
            const fileInput = document.getElementById('opnameFotoInput');
            if (fileInput) fileInput.value = "";
            const previewContainer = document.getElementById('temuanPreviewContainer');
            if (previewContainer) previewContainer.classList.add('hidden');
            const btnRemove = document.getElementById('btnRemoveFoto');
            if (btnRemove) btnRemove.classList.add('hidden');
        }

        function viewPhotoDetail(src) {
            if (!src) return;
            const modal = document.getElementById('photoViewModal');
            const img = document.getElementById('photoViewImg');
            const downloadBtn = document.getElementById('downloadPhotoBtn');
            
            if (modal && img) {
                img.src = src;
                if (downloadBtn) {
                    downloadBtn.href = src; // Mengatur link sumber download sesuai gambar aktif
                    // Berikan nama file otomatis berdasarkan waktu agar unik
                    downloadBtn.download = `Temuan_Aset_${new Date().getTime()}.jpg`;
                }
                modal.classList.remove('hidden');
            }
        }

        function closePhotoDetail() {
            const modal = document.getElementById('photoViewModal');
            if (modal) modal.classList.add('hidden');
        }

        function saveOpnameVerification() {
            if (!activeOpnameAsset) {
                showToast('Gagal Simpan', 'Data aset tidak valid atau belum dipilih.', 'error');
                return;
            }
        
            const currentAssetId = String(activeOpnameAsset.id || activeOpnameAsset["ID Asset"] || "").trim();
            const currentSubNumber = String(activeOpnameAsset.subNumber || activeOpnameAsset["Sub-Number"] || "0").trim();
        
            const statusAset = safeGetValue('opnameInputStatusAset', 'Baik');
            const statusLabel = safeGetValue('opnameInputStatusLabel', 'Baik');
            const keterangan = safeGetValue('opnameInputKeterangan', '').trim();
        
            const isAsetRusak = (statusAset === 'Rusak Ringan' || statusAset === 'Rusak Berat');
            const isLabelRusak = (statusLabel === 'Rusak'); 
            const isWajibFoto = isAsetRusak || isLabelRusak;
        
            if (isWajibFoto) {
                if (!activeEvidencePhoto && !keterangan) {
                    playBeepSound('error');
                    showToast('Foto & Keterangan Wajib!', 'Kondisi aset atau label rusak. Harap lampirkan foto dan keterangan.', 'warning');
                    return;
                }
                if (!activeEvidencePhoto) {
                    playBeepSound('error');
                    showToast('Foto Bukti Wajib!', 'Silakan ambil foto bukti kerusakan terlebih dahulu.', 'warning');
                    return;
                }
                if (!keterangan) {
                    playBeepSound('error');
                    showToast('Keterangan Wajib!', 'Harap isi kolom keterangan tambahan.', 'warning');
                    document.getElementById('opnameInputKeterangan').focus();
                    return;
                }
            }
        
            const alreadyScanned = historyLogs.some(h => {
                let hId = String(h.assetId || "").trim();
                let hSub = String(h.subNumber || "0").trim();
                return hId.toLowerCase() === currentAssetId.toLowerCase() && hSub.toLowerCase() === currentSubNumber.toLowerCase();
            });
        
            if (alreadyScanned) {
                closeOpnameModal();
                showToast('Aset Sudah Discan!', `Aset ID ${currentAssetId} sudah tercatat dalam riwayat.`, 'warning');
                playBeepSound('error');
                return;
            }
        
            const saveBtn = document.querySelector('button[onclick="saveOpnameVerification()"]');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-1"></i> Menyimpan ke Database...`;
            }
        
            showToast('Menyimpan...', 'Mengirim data ke database...', 'info');
        
            const now = new Date();
            const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
            const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
            const lokasiActual = safeGetValue('opnameInputLokasiActual', activeOpnameAsset.lokasi).trim();
            
            // Perbaikan: Ambil dari ID yang benar (opnameModalInputMetodeFinal)
            const metodeInputEl = document.getElementById('opnameModalInputMetodeFinal');
            let metode = (metodeInputEl && metodeInputEl.value.trim()) ? metodeInputEl.value.trim() : (activeOpnameMethod || 'Scan');
            metode = metode.toLowerCase().includes('manual') ? 'Manual' : 'Scan';
        
            const newHistoryLog = {
                tanggalScan: dateStr,
                assetId: currentAssetId,
                subNumber: currentSubNumber,
                cabang: activeOpnameAsset.cabang || "",
                deskripsi: activeOpnameAsset.deskripsi || "",
                lokasiSap: activeOpnameAsset.lokasi || "",
                lokasiOpname: lokasiActual,
                waktuScan: timeStr,
                statusAset: statusAset,
                statusLabel: statusLabel,
                metodeOpname: metode,
                asetTemuan: activeEvidencePhoto || null,
                keterangan: keterangan || "-"
            };
        
            // Aman tanpa hardcode token di frontend
            fetch(PROXY_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: "addLog", 
                    data: newHistoryLog 
                })
            })
            .then(res => res.json())
            .then(res => {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = `<i class="fa-solid fa-check mr-1"></i> Simpan Log Opname`;
                }
        
                closeOpnameModal();
                showToast('Berhasil Disimpan!', `Data opname aset ${currentAssetId} berhasil tersimpan.`, 'success');
                playBeepSound('success');
        
                historyLogs.unshift(newHistoryLog);
                renderKPIs();
                renderHistoryTable();
                renderRecapView();
                if (typeof loadLogsFromServer === 'function') {
                    loadLogsFromServer(true);
                }
            })
            .catch(err => {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = `<i class="fa-solid fa-check mr-1"></i> Simpan Log Opname`;
                }
                closeOpnameModal();
                historyLogs.unshift(newHistoryLog);
                renderKPIs();
                renderHistoryTable();
                renderRecapView();
                showToast('Tersimpan Lokal', `Data dicatat di perangkat.`, 'info');
            });
        }
        
        function fillBarcodeInput(assetId) {
            const inputEl = document.getElementById('mainBarcodeInput');
            if (inputEl) inputEl.value = assetId;
        }

        // --- DASHBOARD KPIS & CONDITION COUNTER ---
        function renderKPIs() {
            const branchVal = safeGetValue('branchSelector', 'ALL');
            
            // Filter aset berdasarkan cabang aktif
            const scopedAssets = branchVal === 'ALL' ? assets : assets.filter(a => a.cabang.startsWith(branchVal) || branchVal.startsWith(a.cabang));
            
            // Filter log riwayat berdasarkan cabang aktif
            const scopedLogs = branchVal === 'ALL' ? historyLogs : historyLogs.filter(h => h.cabang.startsWith(branchVal) || branchVal.startsWith(h.cabang));
        
            const totalAsset = scopedAssets.length;
            
            // Hitung unik aset yang sudah terscan
            const scannedAssetIds = new Set(scopedLogs.map(h => String(h.assetId).trim().toLowerCase()));
            const totalScanned = scopedAssets.filter(a => scannedAssetIds.has(String(a.id).trim().toLowerCase())).length;
            const totalPending = Math.max(0, totalAsset - totalScanned);
        
            let scannedPct = totalAsset > 0 ? Math.round((totalScanned / totalAsset) * 100) : 0;
            if (totalScanned > 0 && scannedPct === 0) {
                scannedPct = Number(((totalScanned / totalAsset) * 100).toFixed(1)); // Menghasilkan angka desimal misal: 0.2
            }
            
            // SINKRONISASI PERSENTASE PENDING: Jika ada desimal, hitung sisa akurat dari 100%
            let pendingPct = totalAsset > 0 ? Math.round((totalPending / totalAsset) * 100) : 0;
            if (totalScanned > 0 && typeof scannedPct === 'number' && !Number.isInteger(scannedPct)) {
                pendingPct = (100 - scannedPct).toFixed(1); // Menghasilkan 99.8%
            } else if (totalScanned > 0 && totalPending === totalAsset) {
                pendingPct = 100;
            } else if (totalScanned === totalAsset) {
                pendingPct = 0;
            }
        
            // 1. Update Teks Kartu KPI Utama
            safeSetText('cardTotalAsset', totalAsset);
            safeSetText('cardScannedAsset', totalScanned);
            safeSetText('cardPendingAsset', totalPending);
            safeSetText('cardScannedPct', `${scannedPct}%`);
            safeSetText('cardPendingPct', `${pendingPct}%`);
        
            // 2. Update Welcome Banner Badge Ring & Teks Progres
            safeSetText('dashOverallRing', `${scannedPct}%`);
            safeSetText('dashOverallText', `${totalScanned} dari ${totalAsset} Aset Selesai`);
            
            const descLabel = branchVal === 'ALL' ? 'Master Data Internal' : `Business Area: ${branchVal}`;
            safeSetText('labelFilterDesc', descLabel);
        
            // 3. Hitung Kondisi Berdasarkan Perspektif Aktif (Aset vs Label)
            let countGood = 0;
            let countLight = 0;
            let countHeavy = 0;
            let countLost = 0;
        
            scopedLogs.forEach(h => {
                const targetVal = activeStatusType === 'aset' ? (h.statusAset || "") : (h.statusLabel || "");
                const st = String(targetVal).trim().toLowerCase();
        
                // Urutan pengecekan wajib dari yang spesifik ke umum
                if (st.includes('baik')) {
                    countGood++;
                } else if (st.includes('berat')) {
                    countHeavy++; // Rusak Berat dicek duluan
                } else if (st.includes('ringan') || (st.includes('rusak') && !st.includes('berat'))) {
                    countLight++; // Rusak Ringan
                } else if (st.includes('hilang') || st.includes('tidak')) {
                    countLost++;
                }
            });
        
            // Update Angka di Grid Kondisi & Legenda Grafik
            safeSetText('insightGood', countGood);
            safeSetText('insightLight', countLight);
            safeSetText('insightHeavy', countHeavy);
            safeSetText('insightLost', countLost);
        
            safeSetText('legGood', countGood);
            safeSetText('legLight', countLight);
            safeSetText('legHeavy', countHeavy);
            safeSetText('legLost', countLost);
            safeSetText('chartTotalScannedLabel', `${scopedLogs.length} Unit Verifikasi`);
        
            // 4. Render Visual Multi-Color Progress Bar Chart
            const progressBarEl = document.getElementById('multiColorProgressBar');
            if (progressBarEl) {
                const totalScannedLogs = scopedLogs.length;
                if (totalScannedLogs === 0) {
                    progressBarEl.innerHTML = `<div style="width: 100%" class="bg-slate-200 rounded-full transition-all duration-500" title="Belum ada data scan"></div>`;
                } else {
                    const pGood = (countGood / totalScannedLogs) * 100;
                    const pLight = (countLight / totalScannedLogs) * 100;
                    const pHeavy = (countHeavy / totalScannedLogs) * 100;
                    const pLost = (countLost / totalScannedLogs) * 100;
        
                    progressBarEl.innerHTML = `
                        <div style="width: ${pGood}%" class="bg-emerald-500 h-full rounded-l-full transition-all duration-500" title="Kondisi Baik: ${countGood}"></div>
                        <div style="width: ${pLight}%" class="bg-amber-500 h-full transition-all duration-500" title="Rusak Ringan: ${countLight}"></div>
                        <div style="width: ${pHeavy}%" class="bg-rose-500 h-full transition-all duration-500" title="Rusak Berat: ${countHeavy}"></div>
                        <div style="width: ${pLost}%" class="bg-slate-700 h-full rounded-r-full transition-all duration-500" title="Hilang: ${countLost}"></div>
                    `;
                }
            }
        
            // 5. Render Live Activity Feed (3 Scan Terakhir)
            const feedContainer = document.getElementById('liveActivityFeed');
            if (feedContainer) {
                if (scopedLogs.length === 0) {
                    feedContainer.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs">Belum ada aktivitas scan untuk cabang ini.</div>`;
                } else {
                    const latestLogs = [...scopedLogs].reverse().slice(0, 3);
                    let feedHtml = '';
                    
                    latestLogs.forEach(log => {
                        let rawTime = String(log.waktuScan || "").trim();
                        let displayTime = rawTime;
                        if (rawTime.includes("GMT") || rawTime.includes("T") || rawTime.length > 10) {
                            let d = new Date(rawTime);
                            if (!isNaN(d.getTime())) {
                                let h = String(d.getHours()).padStart(2, '0');
                                let m = String(d.getMinutes()).padStart(2, '0');
                                let s = String(d.getSeconds()).padStart(2, '0');
                                displayTime = `${h}:${m}:${s}`;
                            } else {
                                displayTime = "Baru saja";
                            }
                        } else {
                            displayTime = rawTime.replace(/[.]/g, ':');
                        }
        
                        feedHtml += `
                            <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs">
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2">
                                        <p class="font-bold text-slate-900 truncate font-mono text-xs">${log.assetId}</p>
                                        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 shrink-0">${log.subNumber || '0'}</span>
                                    </div>
                                    <p class="text-[11px] text-slate-500 truncate mt-0.5">${log.deskripsi || '-'}</p>
                                </div>
                                <div class="text-right shrink-0">
                                    <span class="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded font-mono block">${displayTime}</span>
                                    <span class="text-[10px] text-slate-400 font-semibold mt-1 block">${log.lokasiOpname || log.lokasiSap || '-'}</span>
                                </div>
                            </div>
                        `;
                    });
                    feedContainer.innerHTML = feedHtml;
                }
            }
        }

        // --- TABLE 1 RENDERING ---
        function renderTable() {
            const searchVal = safeGetValue('tableSearchInput').toLowerCase().trim();
            const branchVal = safeGetValue('branchSelector', 'ALL');
            const roomVal = safeGetValue('roomFilter', 'ALL');
            const tbody = document.getElementById('assetTableBody');

            if (!tbody) return;
            tbody.innerHTML = '';

            // Ambil ID aset yang sudah terscan berdasarkan cabang aktif di header
            const scopedLogs = branchVal === 'ALL' ? historyLogs : historyLogs.filter(h => h.cabang.startsWith(branchVal) || branchVal.startsWith(h.cabang));
            const scannedAssetIds = new Set(scopedLogs.map(h => String(h.assetId).trim().toLowerCase()));

            const filtered = assets.filter(item => {
                const itemId = String(item.id || item["ID Asset"] || "").trim().toLowerCase();
                const matchSearch = item.id.toLowerCase().includes(searchVal) ||
                                    (item.subNumber && item.subNumber.toLowerCase().includes(searchVal)) ||
                                    item.deskripsi.toLowerCase().includes(searchVal) ||
                                    item.lokasi.toLowerCase().includes(searchVal);
                const matchBranch = branchVal === 'ALL' || item.cabang.startsWith(branchVal) || branchVal.startsWith(item.cabang);
                const matchRoom = roomVal === 'ALL' || item.lokasi === roomVal;

                // Filter status berdasarkan kartu KPI dashboard yang diklik
                const isScanned = scannedAssetIds.has(itemId);
                let matchStatus = true;
                if (currentMasterStatusFilter === 'SCANNED') {
                    matchStatus = isScanned;
                } else if (currentMasterStatusFilter === 'PENDING') {
                    matchStatus = !isScanned;
                }

                return matchSearch && matchBranch && matchRoom;
            });

            const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
            if (currentPage > totalPages) currentPage = totalPages;
            if (currentPage < 1) currentPage = 1;

            const startIndex = (currentPage - 1) * itemsPerPage;
            const paginatedItems = filtered.slice(startIndex, startIndex + itemsPerPage);

            if (filtered.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center py-8 text-slate-400">
                            <i class="fa-solid fa-box-open text-2xl mb-1 block"></i>
                            Tidak ada data aset ditemukan dari database.
                        </td>
                    </tr>`;
            } else {
                paginatedItems.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-50 transition border-b border-slate-100 text-xs";
                    tr.innerHTML = `
                        <td class="py-3 px-3 sm:px-4 font-mono font-bold text-slate-900">${item.id}</td>
                        <td class="py-3 px-3 sm:px-4 font-mono text-slate-600">${item.subNumber || '0'}</td>
                        <td class="py-3 px-3 sm:px-4 text-slate-700 font-semibold">${item.cabang}</td>
                        <td class="py-3 px-3 sm:px-4 font-semibold text-slate-800">${item.deskripsi}</td>
                        <td class="py-3 px-3 sm:px-4 text-slate-500 font-mono text-[11px]">${item.capitalizedOn || '-'}</td>
                        <td class="py-3 px-3 sm:px-4"><span class="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded font-mono text-[11px]">${item.lokasi}</span></td>
                        <td class="py-3 px-3 sm:px-4 text-center">
                            <div class="flex items-center justify-center gap-1.5">
                                <!-- Tombol Opname Asli -->
                                <button onclick='openOpnameModal({"id": "${item.id}", "subNumber": "${item.subNumber || '0'}", "cabang": "${item.cabang}", "deskripsi": "${item.deskripsi.replace(/'/g, "\\'")}", "lokasi": "${item.lokasi}"}, "Manual")' class="bg-daihatsu-50 hover:bg-daihatsu-100 text-daihatsu-700 border border-daihatsu-200 px-2.5 py-1 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-2xs">
                                    <i class="fa-solid fa-clipboard-check"></i>
                                    <span>Opname</span>
                                </button>
                                
                                <!-- Tombol Hapus Aset dari Master & Database -->
                                <button onclick="deleteMasterAsset('${item.id}', '${item.subNumber || '0'}')" class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold transition flex items-center justify-center" title="Hapus Aset">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            const startCount = filtered.length === 0 ? 0 : startIndex + 1;
            const endCount = Math.min(startIndex + itemsPerPage, filtered.length);
            safeSetText('tableCountSummary', `Menampilkan ${startCount}-${endCount} dari total ${filtered.length} aset`);

            renderPaginationControls(totalPages);
        }

        function renderPaginationControls(totalPages) {
            const container = document.getElementById('paginationControls');
            if (!container) return;

            if (totalPages <= 1) {
                container.innerHTML = '';
                return;
            }

            let html = `
                <button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} class="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-semibold transition">
                    <i class="fa-solid fa-chevron-left text-[10px]"></i>
                </button>
            `;

            let startPage = Math.max(1, currentPage - 1);
            let endPage = Math.min(totalPages, startPage + 2);
            if (endPage - startPage < 2) startPage = Math.max(1, endPage - 2);

            for (let p = startPage; p <= endPage; p++) {
                if (p === currentPage) {
                    html += `<button class="px-2.5 py-1 text-xs rounded-lg bg-astra-600 text-white font-bold transition">${p}</button>`;
                } else {
                    html += `<button onclick="changePage(${p})" class="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold transition">${p}</button>`;
                }
            }

            html += `
                <button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} class="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-semibold transition">
                    <i class="fa-solid fa-chevron-right text-[10px]"></i>
                </button>
            `;

            container.innerHTML = html;
        }

        function deleteMasterAsset(assetId, subNumber) {
            askConfirm(
                'Hapus Aset dari Database',
                `Apakah Anda yakin ingin menghapus Aset ID ${assetId} (Sub: ${subNumber})? Data akan terhapus permanen dari Google Spreadsheet.`,
                () => {
                    showToast('Menghapus...', 'Menghapus aset dari database...', 'info');

                    // Kirim request POST ke Proxy Vercel
                    fetch(PROXY_API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: "deleteMasterAsset",
                            assetId: assetId,
                            subNumber: subNumber
                        })
                    })
                    .then(res => res.json())
                    .then(res => {
                        if (res.status === "success") {
                            // Hapus dari array lokal setelah database sukses menghapusnya
                            assets = assets.filter(a => {
                                let idMatch = String(a.id || a["ID Asset"] || "").trim() === String(assetId).trim();
                                let subMatch = String(a.subNumber !== undefined ? a.subNumber : (a["Sub-Number"] !== undefined ? a["Sub-Number"] : "0")).trim() === String(subNumber || "0").trim();
                                return !(idMatch && subMatch);
                            });

                            renderTable();
                            renderKPIs();
                            
                            showToast('Berhasil Dihapus!', `Aset ${assetId} telah dihapus permanen dari Google Spreadsheet.`, 'success');
                        } else {
                            showToast('Gagal Hapus', res.message || 'Server gagal menghapus data dari database.', 'warning');
                        }
                    })
                    .catch(err => {
                        console.error("Delete Master Error:", err);
                        showToast('Koneksi Gagal', 'Tidak dapat terhubung ke server untuk menghapus aset.', 'warning');
                    });
                }
            );
        }

        function changePage(page) {
            currentPage = page;
            renderTable();
        }

        function resetPageAndRender() {
            currentPage = 1;
            renderTable();
        }

        // Format Tanggal Display (Konversi mm/dd/yyyy dari Spreadsheet menjadi dd.mm.yyyy)
        function formatDisplayDate(dateInput) {
            if (!dateInput) return "-";
            let str = String(dateInput).trim();
            
            // Jika ada waktu GMT / 00:00:00, potong ambil tanggalnya saja
            if (str.includes("GMT") || str.includes("00:00:00")) {
                str = str.split("00:00:00")[0].trim();
            }

            // Jika formatnya sudah Date object atau string tanggal standar
            let d = new Date(str);
            if (!isNaN(d.getTime())) {
                let day = String(d.getDate()).padStart(2, '0');
                let month = String(d.getMonth() + 1).padStart(2, '0');
                let year = d.getFullYear();
                return `${day}.${month}.${year}`;
            }
            
            return str.replace(/\//g, '.');
        }

        // --- JAVASCRIPT MODAL & AUTENTIKASI LOGIN ---
        
        // Buka Modal Login & Auto-fill jika "Ingat Saya" aktif
        function openLoginModal() {
            const modal = document.getElementById('loginModal');
            if (modal) modal.classList.remove('hidden');
        
            const savedUser = localStorage.getItem('asv_remember_user');
            const savedPass = localStorage.getItem('asv_remember_pass');
            
            const rememberCheckbox = document.getElementById('rememberMe');
            const usernameInput = document.getElementById('loginUsername');
            const passwordInput = document.getElementById('loginPassword');
        
            if (savedUser && usernameInput) usernameInput.value = savedUser;
            if (savedPass && passwordInput) passwordInput.value = savedPass;
            if ((savedUser || savedPass) && rememberCheckbox) rememberCheckbox.checked = true;

            setTimeout(() => {
                if (usernameInput && !usernameInput.value) {
                    usernameInput.focus();
                } else if (passwordInput && !passwordInput.value) {
                    passwordInput.focus();
                }
            }, 100);
        }
        
        function closeLoginModal(force = false) {
            const activeUser = localStorage.getItem('asv_active_user');
            // Jika belum login dan bukan dipanggil setelah autentikasi sukses (force), modal tidak boleh ditutup
            if (!activeUser && !force) {
                showToast('Login Diperlukan', 'Harap masukkan NPK dan Kata Sandi untuk mengakses sistem.', 'warning');
                return;
            }
            const modal = document.getElementById('loginModal');
            if (modal) modal.classList.add('hidden');
        }
        
        // Toggle Lihat / Sembunyikan Password
        function togglePasswordVisibility() {
            const pwdInput = document.getElementById('loginPassword');
            const icon = document.getElementById('togglePasswordIcon') || document.getElementById('passwordToggleIcon');
            if (!pwdInput || !icon) return;
        
            if (pwdInput.type === 'password') {
                pwdInput.type = 'text';
                icon.className = 'fa-solid fa-eye-slash';
            } else {
                pwdInput.type = 'password';
                icon.className = 'fa-solid fa-eye';
            }
        }
        
        function handleLoginSubmit(e) {
            e.preventDefault();
        
            const username = safeGetValue('loginUsername').trim();
            const password = safeGetValue('loginPassword').trim();
            const rememberMe = document.getElementById('rememberMe')?.checked;
            const submitBtn = document.getElementById('btnLoginSubmit');
        
            if (!username || !password) {
                showToast('Gagal Masuk', 'Harap isi NPK dan Kata Sandi.', 'warning');
                return;
            }
        
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-1"></i> Memverifikasi...`;
            }
        
            fetch(PROXY_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: "checkLogin",
                    username: username,
                    password: password
                })
            })
            .then(res => res.json())
            .then(response => {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> <span>Masuk ke Sistem</span>`;
                }
        
                if (response && response.success) {
                    // Logika "Ingat Saya": Simpan atau Hapus dari localStorage
                    if (rememberMe) {
                        localStorage.setItem('asv_remember_user', username);
                        localStorage.setItem('asv_remember_pass', password);
                    } else {
                        localStorage.removeItem('asv_remember_user');
                        localStorage.removeItem('asv_remember_pass');
                    }
        
                    const currentUser = {
                        name: response.user.nama,
                        npk: response.user.npk,
                        loginTime: new Date().toISOString()
                    };
        
                    localStorage.setItem('asv_active_user', JSON.stringify(currentUser));
                    updateActiveUserUI(currentUser);
        
                    closeLoginModal(true);
                    if (typeof playBeepSound === 'function') playBeepSound('success');
                    showToast('Berhasil Masuk', `Selamat datang, ${response.user.nama}!`, 'success');
        
                } else {
                    if (typeof playBeepSound === 'function') playBeepSound('error');
                    showToast('Akses Ditolak', response ? response.message : 'NPK atau Kata Sandi salah.', 'error');
                }
            })
            .catch(err => {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> <span>Masuk ke Sistem</span>`;
                }
                showToast('Kesalahan Sistem', 'Gagal terhubung ke database server.', 'error');
            });
        }
        
        function updateActiveUserUI(userData) {
            const sidebarNameEl = document.getElementById('sidebarAuditorName');
            const sidebarRoleEl = document.getElementById('sidebarAuditorRole');
            const sidebarAuthBtn = document.getElementById('sidebarAuthBtn');
            const sidebarAvatar = document.getElementById('sidebarUserAvatar');
            const profileNameEl = document.getElementById('profileNameDisplay');
            const profileRoleEl = document.getElementById('profileRoleDisplay');
            const profileBranchEl = document.getElementById('profileBranchDisplay');
            const sessionStatusBadge = document.getElementById('sessionStatusBadge');
            const settingsAuthBtn = document.getElementById('settingsAuthBtn');
            const settingsProfileAvatar = document.getElementById('settingsProfileAvatar');

            if (!userData || !userData.name) {
                // Tampilan saat Belum Login
                if (sidebarNameEl) sidebarNameEl.textContent = 'Belum Login';
                if (sidebarRoleEl) sidebarRoleEl.textContent = 'Silakan Masuk';
                if (sidebarAvatar) {
                    sidebarAvatar.textContent = '--';
                    sidebarAvatar.className = 'w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-xs';
                }
                if (sidebarAuthBtn) {
                    sidebarAuthBtn.className = 'mt-1.5 text-emerald-400 hover:text-emerald-300 font-semibold text-[11px] flex items-center gap-1 transition';
                    sidebarAuthBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket text-[10px]"></i> <span>Masuk / Login</span>';
                }

                if (profileNameEl) profileNameEl.textContent = 'Belum Login';
                if (profileRoleEl) profileRoleEl.textContent = 'Akses Belum Terautentikasi';
                if (profileBranchEl) {
                    profileBranchEl.textContent = 'Sesi Tidak Aktif';
                    profileBranchEl.className = 'inline-block mt-1 text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-mono font-medium';
                }
                if (sessionStatusBadge) {
                    sessionStatusBadge.className = 'inline-flex items-center gap-1.5 text-[11px] bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 rounded-full font-semibold';
                    sessionStatusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Belum Login';
                }
                if (settingsAuthBtn) {
                    settingsAuthBtn.className = 'px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs shrink-0';
                    settingsAuthBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> <span>Masuk / Login</span>';
                }
                if (settingsProfileAvatar) {
                    settingsProfileAvatar.className = 'w-12 h-12 rounded-2xl bg-slate-700 text-white flex items-center justify-center font-black text-lg shadow-md shrink-0';
                    settingsProfileAvatar.innerHTML = '<i class="fa-solid fa-user-slash"></i>';
                }
                return;
            }

            // Tampilan saat Berhasil Login
            if (sidebarNameEl) sidebarNameEl.textContent = userData.name;
            if (sidebarRoleEl) sidebarRoleEl.textContent = userData.npk ? `NPK: ${userData.npk}` : 'Petugas Internal Audit';

            const initials = userData.name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'AD';
            if (sidebarAvatar) {
                sidebarAvatar.textContent = initials;
                sidebarAvatar.className = 'w-9 h-9 rounded-xl bg-astra-600 flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-xs';
            }
            if (sidebarAuthBtn) {
                sidebarAuthBtn.className = 'mt-1.5 text-rose-400 hover:text-rose-300 font-semibold text-[11px] flex items-center gap-1 transition';
                sidebarAuthBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket text-[10px]"></i> <span>Keluar / Logout</span>';
            }

            if (profileNameEl) profileNameEl.textContent = userData.name;
            if (profileRoleEl) profileRoleEl.textContent = userData.npk ? `Petugas Internal Audit (NPK: ${userData.npk})` : 'Petugas Internal Audit / Control';
            if (profileBranchEl) {
                profileBranchEl.textContent = 'Akses Terverifikasi';
                profileBranchEl.className = 'inline-block mt-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-mono font-medium';
            }
            if (sessionStatusBadge) {
                sessionStatusBadge.className = 'inline-flex items-center gap-1.5 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold';
                sessionStatusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Sesi Aktif';
            }
            if (settingsAuthBtn) {
                settingsAuthBtn.className = 'px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs shrink-0';
                settingsAuthBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> <span>Keluar / Logout</span>';
            }
            if (settingsProfileAvatar) {
                settingsProfileAvatar.className = 'w-12 h-12 rounded-2xl bg-gradient-to-br from-astra-600 to-daihatsu-700 text-white flex items-center justify-center font-black text-lg shadow-md shrink-0';
                settingsProfileAvatar.innerHTML = '<i class="fa-solid fa-user-tie"></i>';
            }
        }
        
        function handleAuthAction() {
            const savedUser = localStorage.getItem('asv_active_user');
            if (savedUser) {
                handleLogout();
            } else {
                openLoginModal();
            }
        }

        // Fungsi Logout
        function handleLogout() {
            if (typeof askConfirm === 'function') {
                askConfirm(
                    'Konfirmasi Keluar',
                    'Apakah Anda yakin ingin mengakhiri sesi petugas saat ini?',
                    function () {
                        // Hapus sesi user aktif dari browser
                        localStorage.removeItem('asv_active_user');
                        updateActiveUserUI(null);
                        showToast('Sesi Berakhir', 'Anda telah keluar. Silakan login kembali.', 'info');
                        openLoginModal();
                    }
                );
            } else if (confirm('Apakah Anda yakin ingin keluar?')) {
                localStorage.removeItem('asv_active_user');
                updateActiveUserUI(null);
                openLoginModal();
            }
        }
        
        // Fungsi khusus untuk menangani Waktu Scan agar tidak berubah jadi tahun
        function formatDisplayTime(timeInput) {
            if (!timeInput) return "-";
            let str = String(timeInput).trim();
            
            // Jika waktu dari spreadsheet berupa format ISO / Date object aneh
            if (str.includes("GMT") || str.includes("T") || str.length > 10) {
                let d = new Date(str);
                if (!isNaN(d.getTime())) {
                    let hours = String(d.getHours()).padStart(2, '0');
                    let mins = String(d.getMinutes()).padStart(2, '0');
                    let secs = String(d.getSeconds()).padStart(2, '0');
                    return `${hours}:${mins}:${secs}`;
                }
            }
            
            // Jika sudah berbentuk string jam (contoh: 14.54.57 atau 14:54:57), rapikan pemisahnya jadi titik dua
            return str.replace(/[.]/g, ':');
        }
        
        // --- TABLE 2 HISTORY RENDERING ---
        function renderHistoryTable() {
            const searchVal = safeGetValue('historySearchInput').toLowerCase().trim();
            const methodVal = safeGetValue('historyMethodFilter', 'ALL');
            const branchVal = safeGetValue('branchSelector', 'ALL');
            const tbody = document.getElementById('historyTableBody');

            if (!tbody) return;
            tbody.innerHTML = '';

            const filtered = historyLogs.filter(item => {
                const searchTarget = `${item.assetId} ${item.subNumber} ${item.deskripsi} ${item.lokasiSap} ${item.lokasiOpname} ${item.keterangan || ''}`.toLowerCase();
                const matchSearch = searchTarget.includes(searchVal);
                const matchMethod = methodVal === 'ALL' || item.metodeOpname === methodVal;
                const matchBranch = branchVal === 'ALL' || item.cabang.startsWith(branchVal) || branchVal.startsWith(item.cabang);

                return matchSearch && matchMethod && matchBranch;
            });

            safeSetText('histStatTotal', historyLogs.length);
            safeSetText('histStatValid', historyLogs.filter(h => h.statusAset === 'Baik').length);
            safeSetText('histStatDamaged', historyLogs.filter(h => h.statusAset !== 'Baik' || h.asetTemuan).length);
            safeSetText('histStatLabelIssue', historyLogs.filter(h => h.statusLabel !== 'Baik').length);

            if (filtered.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="14" class="text-center py-8 text-slate-400">
                            <i class="fa-solid fa-clock-rotate-left text-2xl mb-1 block"></i>
                            Belum ada riwayat stock opname tercatat.
                        </td>
                    </tr>`;
            } else {
                filtered.forEach((item, index) => {
                    const isAsetBaik = item.statusAset === 'Baik';
                    const asetBadge = isAsetBaik
                        ? `<span class="bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full text-[10px]"><i class="fa-solid fa-circle-check text-[9px] mr-1"></i>${item.statusAset}</span>`
                        : `<span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full text-[10px]"><i class="fa-solid fa-circle-exclamation text-[9px] mr-1"></i>${item.statusAset}</span>`;

                    const isLabelBaik = item.statusLabel === 'Baik';
                    const labelBadge = isLabelBaik
                        ? `<span class="bg-emerald-50 text-emerald-700 font-medium px-2 py-0.5 rounded text-[10px] border border-emerald-200">Baik</span>`
                        : `<span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px] border border-amber-300">${item.statusLabel}</span>`;

                    const metodeBadge = item.metodeOpname === 'Scan'
                        ? `<span class="font-medium text-astra-700 bg-astra-50 px-2 py-0.5 rounded border border-astra-200"><i class="fa-solid fa-barcode text-[9px] mr-1"></i>Scan</span>`
                        : `<span class="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200"><i class="fa-solid fa-keyboard text-[9px] mr-1"></i>Manual</span>`;

                    // Di dalam fungsi renderHistoryTable()
                    let fotoHtml = `<span class="text-slate-400 italic text-[11px]">-</span>`;
                    if (item.asetTemuan) {
                        let imgSrc = item.asetTemuan;
                        
                        if (imgSrc.startsWith("http")) {
                            // Jika berupa link Google Drive
                            fotoHtml = `
                                <div class="flex items-center justify-center">
                                    <a href="${imgSrc}" target="_blank" title="Buka foto di Google Drive" class="px-2.5 py-1 bg-astra-50 hover:bg-astra-100 text-astra-700 border border-astra-200 rounded-lg text-[11px] font-bold transition flex items-center gap-1">
                                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Lihat Drive
                                    </a>
                                </div>
                            `;
                        } else {
                            // Jika berupa Base64 lama
                            fotoHtml = `
                                <div class="flex items-center justify-center">
                                    <button onclick="viewPhotoDetail('${imgSrc}')" class="p-0.5 rounded-lg border border-rose-300 bg-white">
                                        <img src="${imgSrc}" alt="Temuan" class="w-9 h-9 object-cover rounded">
                                    </button>
                                </div>
                            `;
                        }
                    }

                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-50 transition border-b border-slate-100 text-xs";
                    tr.innerHTML = `
                        <td class="py-2.5 px-3 text-center font-mono text-slate-400 text-[11px] font-bold">${index + 1}</td>
                        <td class="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">${formatDisplayDate(item.tanggalScan)}</td>
                        <td class="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">${item.assetId} ${item.subNumber || '0'}</td>
                        <td class="py-2.5 px-3 font-semibold text-slate-700">${item.cabang}</td>
                        <td class="py-2.5 px-3 font-semibold text-slate-800">${item.deskripsi}</td>
                        <td class="py-2.5 px-3 font-mono text-slate-600 bg-slate-50/60">${item.lokasiSap}</td>
                        <td class="py-2.5 px-3 font-mono font-bold ${item.lokasiSap !== item.lokasiOpname ? 'text-amber-700 bg-amber-50' : 'text-slate-800'}">${item.lokasiOpname}</td>
                        <td class="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">${formatDisplayTime(item.waktuScan)}</td>
                        <td class="py-2.5 px-3 whitespace-nowrap">${asetBadge}</td>
                        <td class="py-2.5 px-3 whitespace-nowrap">${labelBadge}</td>
                        <td class="py-2.5 px-3 whitespace-nowrap">${metodeBadge}</td>
                        <td class="py-2.5 px-3 text-center whitespace-nowrap">${fotoHtml}</td> <!-- Kolom Foto Temuan yang pas -->
                        <td class="py-2.5 px-3 text-slate-600 max-w-xs truncate" title="${item.keterangan || '-'}">${item.keterangan || '-'}</td> <!-- Kolom Keterangan yang pas -->
                        <td class="py-2.5 px-3 text-center whitespace-nowrap">
                            <button onclick="deleteSingleLog('${item.assetId}', '${item.subNumber || '0'}')" class="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition" title="Hapus log ini">
                                <i class="fa-solid fa-trash-can text-xs"></i>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            safeSetText('historyTableCountSummary', `Menampilkan ${filtered.length} dari total ${historyLogs.length} riwayat log pemindaian`);
        }

        function exportHistoryToExcel() {
            try {
                const searchVal = safeGetValue('historySearchInput').toLowerCase().trim();
                const methodVal = safeGetValue('historyMethodFilter', 'ALL');
                const branchVal = safeGetValue('branchSelector', 'ALL');
        
                // Filter data sesuai apa yang sedang tampil di tabel riwayat saat ini
                const filtered = historyLogs.filter(item => {
                    const searchTarget = `${item.assetId} ${item.subNumber} ${item.deskripsi} ${item.lokasiSap} ${item.lokasiOpname} ${item.keterangan || ''}`.toLowerCase();
                    const matchSearch = searchTarget.includes(searchVal);
                    const matchMethod = methodVal === 'ALL' || item.metodeOpname === methodVal;
                    const matchBranch = branchVal === 'ALL' || item.cabang.startsWith(branchVal) || branchVal.startsWith(item.cabang);
        
                    return matchSearch && matchMethod && matchBranch;
                });
        
                if (filtered.length === 0) {
                    showToast('Tidak Ada Data', 'Tidak ada data riwayat yang sesuai dengan filter saat ini untuk diexport.', 'warning');
                    return;
                }
        
                const exportData = filtered.map((h, i) => ({
                    "NO": i + 1,
                    "Tanggal Scan": formatDisplayDate(h.tanggalScan),
                    "ID Asset": h.assetId,
                    "Sub-Number": h.subNumber || '0',
                    "Nomor Aset + Sub": `${h.assetId} ${h.subNumber || '0'}`,
                    "Business Area": h.cabang,
                    "Asset Description": h.deskripsi,
                    "Lokasi (SAP)": h.lokasiSap,
                    "Lokasi (Opname)": h.lokasiOpname,
                    "Waktu Scan": h.waktuScan,
                    "Status Aset": h.statusAset,
                    "Status Label": h.statusLabel,
                    "Metode Opname": h.metodeOpname,
                    "Aset Temuan": h.asetTemuan ? "Ada Foto Temuan Terlampir" : "-",
                    "Keterangan": h.keterangan || "-"
                }));
        
                const worksheet = XLSX.utils.json_to_sheet(exportData);
                
                // Penambahan border rapi
                const range = XLSX.utils.decode_range(worksheet['!ref']);
                const thinBorder = {
                    top: { style: "thin", color: { rgb: "CCCCCC" } },
                    bottom: { style: "thin", color: { rgb: "CCCCCC" } },
                    left: { style: "thin", color: { rgb: "CCCCCC" } },
                    right: { style: "thin", color: { rgb: "CCCCCC" } }
                };
        
                for (let R = range.s.r; R <= range.e.r; ++R) {
                    for (let C = range.s.c; C <= range.e.c; ++C) {
                        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                        if (!worksheet[cellAddress]) continue;
                        
                        if (R === 0) {
                            worksheet[cellAddress].s = {
                                font: { bold: true, color: { rgb: "FFFFFF" } },
                                fill: { fgColor: { rgb: "1E293B" } },
                                border: thinBorder,
                                alignment: { horizontal: "center", vertical: "center" }
                            };
                        } else {
                            worksheet[cellAddress].s = {
                                border: thinBorder,
                                alignment: { vertical: "center" }
                            };
                        }
                    }
                }
        
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Riwayat_Opname_Filtered");
        
                const filename = `Riwayat_Scan_${branchVal !== 'ALL' ? branchVal : 'Semua_Cabang'}_${new Date().toISOString().slice(0,10)}.xlsx`;
                XLSX.writeFile(workbook, filename);
        
                showToast('Export Berhasil', `File log (${filename}) berhasil diunduh sesuai filter aktif.`, 'success');
            } catch (err) {
                console.error(err);
                showToast('Export Gagal', 'Gagal memproses file Excel.', 'warning');
            }
        }

        function openAddAssetModal() {
            const modal = document.getElementById('addAssetModal');
            if (modal) modal.classList.remove('hidden');
        }

        function closeAddAssetModal() {
            const modal = document.getElementById('addAssetModal');
            if (modal) modal.classList.add('hidden');
        }

        function saveNewAsset(e) {
            e.preventDefault();
            const id = safeGetValue('newAssetId').trim();
            const sub = safeGetValue('newAssetSubNumber', '0').trim();
            const cabang = safeGetValue('newAssetCabang').trim();
            const desc = safeGetValue('newAssetDesc').trim();
            const cap = safeGetValue('newAssetCapitalized').trim();
            const room = safeGetValue('newAssetRoom').trim().toUpperCase();

            if (!id || !desc || !room) {
                showToast('Input Tidak Lengkap', 'ID Asset, Deskripsi, dan Room wajib diisi.', 'warning');
                return;
            }

            showToast('Menyimpan...', 'Menambahkan aset baru ke database...', 'info');

            const newAsset = {
                id: id,
                subNumber: sub || '0',
                cabang: cabang,
                deskripsi: desc,
                capitalizedOn: cap || '-',
                lokasi: room
            };

            // Kirim ke database lewat Proxy Vercel
            fetch(PROXY_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: "addMasterAsset",
                    data: newAsset
                })
            })
            .then(res => res.json())
            .then(res => {
                if (res.status === "success") {
                    // Hapus duplikat dari array lokal jika sempat tersisa, lalu tambahkan yang baru
                    assets = assets.filter(a => !(String(a.id) === String(id) && String(a.subNumber || '0') === String(sub || '0')));
                    assets.unshift(newAsset);
                    
                    closeAddAssetModal();
                    showToast('Berhasil Ditambahkan!', `Aset ${id} berhasil tersimpan ke Google Spreadsheet.`, 'success');

                    renderKPIs();
                    renderTable();
                    renderRecapView();

                    document.getElementById('newAssetId').value = '';
                    document.getElementById('newAssetDesc').value = '';
                    document.getElementById('newAssetRoom').value = '';
                } else {
                    showToast('Gagal Simpan', res.message || 'Server gagal menambahkan aset.', 'warning');
                }
            })
            .catch(err => {
                console.error("Add Asset Error:", err);
                showToast('Koneksi Gagal', 'Tidak dapat terhubung ke server.', 'warning');
            });
        }
        
        // --- CAMERA STREAM & SCANNER ---
        let scannedPreviewAsset = null;
        let scannedRawBarcode = "";
        let isBarcodeDetected = false;

        function openCameraModal() {
            scannedPreviewAsset = null;
            scannedRawBarcode = "";
            isBarcodeDetected = false;

            safeSetText('previewScanCode', '-');
            const contentBox = document.getElementById('previewAssetContent');
            if (contentBox) contentBox.innerHTML = 'Belum ada barcode yang terpindai. Arahkan kamera ke stiker...';
            
            const badgeText = document.getElementById('scannerStatusText');
            const badgeDot = document.getElementById('scannerStatusDot');
            const laser = document.getElementById('laserLine');
            if (badgeText) badgeText.innerText = "Kamera Standby - Arahkan ke Barcode";
            if (badgeDot) badgeDot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
            if (laser) laser.style.display = "block";

            const actionBtn = document.getElementById('btnProcessCameraPreview');
            if (actionBtn) {
                actionBtn.disabled = true;
                actionBtn.className = "flex-1 px-4 py-2.5 bg-slate-300 text-slate-500 text-xs font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-not-allowed";
            }

            const modal = document.getElementById('cameraModal');
            if (modal) modal.classList.remove('hidden');
            initCameraStream();
        }

        async function stopActiveScanner() {
            if (html5QrCodeScanner) {
                try { 
                    if (html5QrCodeScanner.isScanning) {
                        await html5QrCodeScanner.stop(); 
                    }
                } catch (e) {}
                try { html5QrCodeScanner.clear(); } catch (e) {}
                html5QrCodeScanner = null;
            }
        }

        async function resetActiveScanner() {
            isBarcodeDetected = false;
            scannedPreviewAsset = null;
            scannedRawBarcode = "";

            safeSetText('previewScanCode', '-');
            const contentBox = document.getElementById('previewAssetContent');
            if (contentBox) contentBox.innerHTML = 'Melanjutkan pemindaian... Arahkan kamera ke barcode.';

            const badgeText = document.getElementById('scannerStatusText');
            const badgeDot = document.getElementById('scannerStatusDot');
            const laser = document.getElementById('laserLine');
            if (badgeText) badgeText.innerText = "Kamera Standby - Arahkan ke Barcode";
            if (badgeDot) badgeDot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
            if (laser) laser.style.display = "block";

            const btnRescan = document.getElementById('btnRescanCamera');
            const actionBtn = document.getElementById('btnProcessCameraPreview');
            if (btnRescan) btnRescan.classList.add('hidden');
            if (actionBtn) {
                actionBtn.disabled = true;
                actionBtn.className = "flex-1 px-4 py-2.5 bg-slate-300 text-slate-500 text-xs font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-not-allowed";
            }

            if (html5QrCodeScanner) {
                try {
                    await html5QrCodeScanner.resume();
                } catch (e) {}
            }
        }

        async function initCameraStream() {
            const overlay = document.getElementById('cameraStatusOverlay');
            if (overlay) {
                overlay.classList.remove('hidden');
                overlay.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-2xl text-astra-400 mb-2"></i><p class="text-xs">Menginisialisasi Kamera...</p>';
            }
        
            await stopActiveScanner();
        
            try {
                html5QrCodeScanner = new Html5Qrcode("cameraReader");
                const config = { fps: 15, qrbox: { width: 250, height: 120 } };
        
                const qrCodeSuccessCallback = async (decodedText) => {
                    if (isBarcodeDetected) return;
        
                    let rawText = decodedText.trim();
                    if (rawText.length < 8) return; 
        
                    let cleanedText = rawText.replace(/[-_]/g, " ");
                    let parts = cleanedText.split(/\s+/);
                    let scannedId = parts[0].trim().toLowerCase();
                    let scannedSub = (parts[1] || "0").trim().toLowerCase();
        
                    let foundAsset = assets.find(a => {
                        let dbId = String(a.id || a["ID Asset"] || "").trim().toLowerCase();
                        let dbSub = String(a.subNumber !== undefined ? a.subNumber : (a["Sub-Number"] !== undefined ? a["Sub-Number"] : "0")).trim().toLowerCase();
                        return dbId === scannedId && dbSub === scannedSub;
                    }) || assets.find(a => {
                        let dbId = String(a.id || a["ID Asset"] || "").trim().toLowerCase();
                        return dbId === scannedId;
                    });
        
                    if (!foundAsset) {
                        playBeepSound('error');
                        showToast('Tidak Terdaftar', `Barcode ${scannedId} tidak ditemukan di database.`, 'warning');
                        return;
                    }
        
                    isBarcodeDetected = true; 
                    playBeepSound('success');
                    scannedRawBarcode = rawText;
        
                    try {
                        if (html5QrCodeScanner && html5QrCodeScanner.isScanning) {
                            await html5QrCodeScanner.pause(true); 
                        }
                    } catch (e) {}
        
                    const badgeText = document.getElementById('scannerStatusText');
                    const badgeDot = document.getElementById('scannerStatusDot');
                    const laser = document.getElementById('laserLine');
                    if (badgeText) badgeText.innerText = "Aset Ditemukan & Dikunci!";
                    if (badgeDot) badgeDot.className = "w-2 h-2 rounded-full bg-emerald-500";
                    if (laser) laser.style.display = "none";
        
                    const inputEl = document.getElementById('mainBarcodeInput');
                    if (inputEl) inputEl.value = rawText;
        
                    scannedPreviewAsset = foundAsset;
                    safeSetText('previewScanCode', rawText);
        
                    const contentBox = document.getElementById('previewAssetContent');
                    const actionBtn = document.getElementById('btnProcessCameraPreview');
                    const btnRescan = document.getElementById('btnRescanCamera');
        
                    if (contentBox) {
                        contentBox.innerHTML = `
                            <div class="text-emerald-700 font-bold flex items-center gap-1 mb-0.5">
                                <i class="fa-solid fa-circle-check"></i> Aset Ditemukan di Database!
                            </div>
                            <p class="font-bold text-slate-900">${foundAsset.deskripsi}</p>
                            <p class="text-[11px] text-slate-500 font-mono">Cabang: ${foundAsset.cabang} | Ruangan: ${foundAsset.lokasi}</p>
                        `;
                    }
        
                    if (btnRescan) btnRescan.classList.remove('hidden');
                    if (actionBtn) {
                        actionBtn.disabled = false;
                        actionBtn.className = "flex-1 px-4 py-2.5 bg-daihatsu-600 hover:bg-daihatsu-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer animate-bounce";
                    }
                };
        
                await html5QrCodeScanner.start(
                    { facingMode: "environment" },
                    config,
                    qrCodeSuccessCallback,
                    (errorMessage) => {}
                );
        
                if (overlay) overlay.classList.add('hidden');
            } catch (err) {
                if (overlay) {
                    overlay.innerHTML = `
                        <div class="text-center p-3 text-rose-400 space-y-1">
                            <i class="fa-solid fa-triangle-exclamation text-xl mb-1"></i>
                            <p class="text-xs font-bold">Gagal Mengakses Kamera</p>
                            <p class="text-[10px] text-slate-300">Pastikan izin kamera di browser sudah diaktifkan.</p>
                        </div>
                    `;
                }
            }
        }

        async function closeCameraModal() {
            isBarcodeDetected = false;
            if (typeof html5QrCodeScanner !== 'undefined' && html5QrCodeScanner) {
                try {
                    if (html5QrCodeScanner.isScanning) {
                        await html5QrCodeScanner.stop();
                    }
                    html5QrCodeScanner.clear();
                } catch (e) {}
                html5QrCodeScanner = null;
            }
        
            const modal = document.getElementById('cameraModal');
            if (modal) modal.classList.add('hidden');
        }

        function processScanFromCameraModal() {
            if (!scannedPreviewAsset) {
                showToast('Belum Ada Barcode', 'Arahkan kamera ke barcode terlebih dahulu.', 'warning');
                return;
            }

            closeCameraModal();

            const todayStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
            const alreadyScannedToday = historyLogs.some(h => {
                let hId = String(h.assetId || "").trim().toLowerCase();
                let hSub = String(h.subNumber || "0").trim().toLowerCase();
                let hDate = String(h.tanggalScan || "").trim();
                
                return hId === String(scannedPreviewAsset.id).trim().toLowerCase() && 
                       hSub === String(scannedPreviewAsset.subNumber || "0").trim().toLowerCase() && 
                       hDate === todayStr;
            });

            if (alreadyScannedToday) {
                playBeepSound('error');
                showToast('Aset Sudah Terscan', `Aset ${scannedPreviewAsset.id} sudah pernah dipindai hari ini.`, 'warning');
                return;
            }

            openOpnameModal(scannedPreviewAsset, 'Scan');
        }

        function handleFileScan(event) {
            const file = event.target.files[0];
            if (!file) return;

            const html5QrCode = new Html5Qrcode("cameraReader");
            html5QrCode.scanFile(file, true)
                .then(decodedText => {
                    const inputEl = document.getElementById('mainBarcodeInput');
                    if (inputEl) inputEl.value = decodedText;
                    triggerOpnameLookup('Scan');
                })
                .catch(() => {
                    showToast('Barcode Tidak Terbaca', 'Pastikan foto barcode terlihat jelas dan fokus.', 'warning');
                });
        }

        // --- RECAP VIEW RENDERING ---
        function renderRecapView() {
            const container = document.getElementById('recapBranchCards');
            const summaryBar = document.getElementById('recapSummaryBar');
            const roomSelect = document.getElementById('recapRoomFilter');
            if (!container) return;

            const selectedBranch = safeGetValue('branchSelector', 'ALL');
            
            if (roomSelect) {
                const currentRoomVal = roomSelect.value;
                const scopedForRooms = selectedBranch === 'ALL' ? assets : assets.filter(a => a.cabang.startsWith(selectedBranch) || selectedBranch.startsWith(a.cabang));
                const uniqueRooms = [...new Set(scopedForRooms.map(a => String(a.lokasi || "").trim().toUpperCase()))].filter(Boolean);
                uniqueRooms.sort();

                let roomOptionsHtml = '<option value="ALL">Semua Ruangan</option>';
                uniqueRooms.forEach(r => {
                    roomOptionsHtml += `<option value="${r}">${r}</option>`;
                });
                roomSelect.innerHTML = roomOptionsHtml;
                if (uniqueRooms.includes(currentRoomVal)) {
                    roomSelect.value = currentRoomVal;
                }
            }

            const selectedRoom = safeGetValue('recapRoomFilter', 'ALL');

            const scopedAssets = assets.filter(a => {
                const matchBranch = selectedBranch === 'ALL' || a.cabang.startsWith(selectedBranch) || selectedBranch.startsWith(a.cabang);
                const matchRoom = selectedRoom === 'ALL' || String(a.lokasi || "").trim().toUpperCase() === selectedRoom;
                return matchBranch && matchRoom;
            });

            const scopedLogs = selectedBranch === 'ALL' ? historyLogs : historyLogs.filter(h => h.cabang.startsWith(selectedBranch) || selectedBranch.startsWith(h.cabang));

            const scannedAssetIds = new Set(scopedLogs.map(h => h.assetId));
            const totalAssets = scopedAssets.length;
            const totalScanned = scopedAssets.filter(a => scannedAssetIds.has(a.id)).length;
            const totalPending = Math.max(0, totalAssets - totalScanned);
            const uniqueRoomsCount = [...new Set(scopedAssets.map(a => a.lokasi || 'LAINNYA'))].length;

            if (summaryBar) {
                summaryBar.innerHTML = `
                    <div class="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
                        <p class="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Aset (Filter)</p>
                        <h4 class="text-xl sm:text-2xl font-black text-slate-900 mt-1">${totalAssets} <span class="text-xs font-normal text-slate-500">Unit</span></h4>
                    </div>
                    <div class="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
                        <p class="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Ruangan</p>
                        <h4 class="text-xl sm:text-2xl font-black text-astra-600 mt-1">${uniqueRoomsCount} <span class="text-xs font-normal text-slate-500">Lokasi</span></h4>
                    </div>
                    <div class="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
                        <p class="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Terscan Opname</p>
                        <h4 class="text-xl sm:text-2xl font-black text-emerald-600 mt-1">${totalScanned} <span class="text-xs font-normal text-slate-500">Unit</span></h4>
                    </div>
                    <div class="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
                        <p class="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Belum Scan</p>
                        <h4 class="text-xl sm:text-2xl font-black text-daihatsu-600 mt-1">${totalPending} <span class="text-xs font-normal text-slate-500">Unit</span></h4>
                    </div>
                `;
            }

            container.innerHTML = '';
            const branches = selectedBranch === 'ALL' ? ["D660", "D661", "D662", "D663", "D664"] : [selectedBranch];

            branches.forEach(b => {
                const branchLabel = branchNames[b] || b;
                const bAssets = scopedAssets.filter(a => a.cabang.startsWith(b) || b.startsWith(a.cabang));
                if (bAssets.length === 0) return;

                const branchTotal = bAssets.length;
                const branchScanned = bAssets.filter(a => scannedAssetIds.has(a.id)).length;
                const branchPending = Math.max(0, branchTotal - branchScanned);
                const pct = branchTotal > 0 ? Math.round((branchScanned / branchTotal) * 100) : 0;

                const roomGroups = {};
                bAssets.forEach(item => {
                    const roomKey = item.lokasi || 'LAINNYA';
                    if (!roomGroups[roomKey]) roomGroups[roomKey] = [];
                    roomGroups[roomKey].push(item);
                });

                const card = document.createElement('div');
                card.className = "bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden";

                let roomsHtml = '';
                Object.keys(roomGroups).forEach(roomName => {
                    const roomItems = roomGroups[roomName];
                    const rScanned = roomItems.filter(i => scannedAssetIds.has(i.id)).length;
                    const rPending = roomItems.length - rScanned;

                    let rowsHtml = '';
                    roomItems.forEach(item => {
                        const isScanned = scannedAssetIds.has(item.id);
                        const statusTag = isScanned
                            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Terscan</span>`
                            : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-daihatsu-100 text-daihatsu-800">Belum</span>`;

                        rowsHtml += `
                            <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                                <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${item.id}</td>
                                <td class="py-2.5 px-3 font-mono text-slate-600">${item.subNumber || '0'}</td>
                                <td class="py-2.5 px-3 font-semibold text-slate-800">${item.deskripsi}</td>
                                <td class="py-2.5 px-3 text-slate-500 font-mono text-[11px]">${item.capitalizedOn || '-'}</td>
                                <td class="py-2.5 px-3">${statusTag}</td>
                            </tr>
                        `;
                    });

                    roomsHtml += `
                        <div class="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 space-y-2">
                            <div class="bg-slate-100 px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 gap-1.5">
                                <div class="flex items-center space-x-2">
                                    <i class="fa-solid fa-door-open text-astra-600 text-sm"></i>
                                    <h4 class="font-bold text-slate-800 text-xs sm:text-sm">Ruangan: ${roomName}</h4>
                                    <span class="bg-astra-100 text-astra-800 text-[10px] font-bold px-2 py-0.5 rounded-full">${roomItems.length} Unit</span>
                                </div>
                                <div class="flex items-center space-x-2 text-[10px] sm:text-[11px]">
                                    <span class="text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Terscan: ${rScanned}</span>
                                    <span class="text-daihatsu-700 font-medium bg-daihatsu-50 px-2 py-0.5 rounded border border-daihatsu-200">Belum: ${rPending}</span>
                                </div>
                            </div>
                            <div class="overflow-x-auto px-2 pb-2 custom-scrollbar">
                                <table class="w-full text-left text-xs bg-white rounded-lg border border-slate-200 overflow-hidden min-w-[500px]">
                                    <thead class="bg-slate-100 text-slate-500 font-semibold uppercase text-[10px]">
                                        <tr>
                                            <th class="py-2 px-3">Asset ID</th>
                                            <th class="py-2 px-3">Sub</th>
                                            <th class="py-2 px-3">Asset Description</th>
                                            <th class="py-2 px-3">Capitalized On</th>
                                            <th class="py-2 px-3">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-100">
                                        ${rowsHtml}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                });

                card.innerHTML = `
                    <div class="p-4 sm:p-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
                        <div>
                            <div class="flex items-center space-x-2">
                                <span class="bg-daihatsu-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">${b}</span>
                                <h3 class="font-bold text-sm sm:text-base text-white">${branchLabel}</h3>
                            </div>
                            <p class="text-xs text-slate-400 mt-0.5">Total: ${branchTotal} Asset | Terscan: ${branchScanned} | Belum: ${branchPending}</p>
                        </div>
                        <div class="flex items-center space-x-3">
                            <div class="w-28 sm:w-32 bg-slate-800 h-2.5 rounded-full overflow-hidden">
                                <div class="bg-gradient-to-r from-astra-500 to-emerald-400 h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                            </div>
                            <span class="text-xs sm:text-sm font-black text-emerald-400 min-w-[35px] text-right">${pct}%</span>
                        </div>
                    </div>
                    <div class="p-3 sm:p-4 space-y-3 sm:space-y-4">
                        ${roomsHtml}
                    </div>
                `;
                container.appendChild(card);
            });
        }
        
        function exportRecapToExcel() {
            try {
                const selectedBranch = safeGetValue('branchSelector', 'ALL');
                const selectedRoom = safeGetValue('recapRoomFilter', 'ALL');
        
                // Filter aset berdasarkan Cabang dan Ruangan yang sedang aktif dipilih
                const scopedAssets = assets.filter(a => {
                    const matchBranch = selectedBranch === 'ALL' || a.cabang.startsWith(selectedBranch) || selectedBranch.startsWith(a.cabang);
                    const matchRoom = selectedRoom === 'ALL' || String(a.lokasi || "").trim().toUpperCase() === selectedRoom;
                    return matchBranch && matchRoom;
                });
        
                if (scopedAssets.length === 0) {
                    showToast('Tidak Ada Data', 'Tidak ada data aset rekap yang sesuai dengan filter saat ini.', 'warning');
                    return;
                }
        
                const exportRows = [];
                scopedAssets.forEach(a => {
                    const isScanned = historyLogs.some(h => h.assetId === a.id);
                    exportRows.push({
                        "Business Area": a.cabang,
                        "Nama Cabang": branchNames[a.cabang] || a.cabang,
                        "Room (Lokasi SAP)": a.lokasi,
                        "Asset ID": a.id,
                        "Sub-Number": a.subNumber || '0',
                        "Asset Description": a.deskripsi,
                        "Capitalized On": a.capitalizedOn || '-',
                        "Status Opname": isScanned ? "Sudah Di-Scan" : "Belum Di-Scan"
                    });
                });
        
                const worksheet = XLSX.utils.json_to_sheet(exportRows);
        
                // Penambahan border rapi
                const range = XLSX.utils.decode_range(worksheet['!ref']);
                const thinBorder = {
                    top: { style: "thin", color: { rgb: "CCCCCC" } },
                    bottom: { style: "thin", color: { rgb: "CCCCCC" } },
                    left: { style: "thin", color: { rgb: "CCCCCC" } },
                    right: { style: "thin", color: { rgb: "CCCCCC" } }
                };
        
                for (let R = range.s.r; R <= range.e.r; ++R) {
                    for (let C = range.s.c; C <= range.e.c; ++C) {
                        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                        if (!worksheet[cellAddress]) continue;
                        
                        if (R === 0) {
                            worksheet[cellAddress].s = {
                                font: { bold: true, color: { rgb: "FFFFFF" } },
                                fill: { fgColor: { rgb: "1E293B" } },
                                border: thinBorder,
                                alignment: { horizontal: "center", vertical: "center" }
                            };
                        } else {
                            worksheet[cellAddress].s = {
                                border: thinBorder,
                                alignment: { vertical: "center" }
                            };
                        }
                    }
                }
        
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap_Filtered");
        
                const filename = `Rekap_${selectedBranch !== 'ALL' ? selectedBranch : 'Semua_Cabang'}_${selectedRoom !== 'ALL' ? selectedRoom : 'Semua_Ruangan'}_${new Date().toISOString().slice(0,10)}.xlsx`;
                XLSX.writeFile(workbook, filename);
                showToast('Export Berhasil', `File rekap (${filename}) berhasil diunduh sesuai filter.`, 'success');
            } catch (err) {
                console.error(err);
                showToast('Export Gagal', 'Gagal memproses file Excel rekap.', 'warning');
            }
        }
        
        function populateRoomFilterDropdown() {
            const selectEl = document.getElementById('roomFilter');
            if (!selectEl) return;
        
            const currentSelected = selectEl.value;
            const uniqueRooms = [...new Set(assets.map(a => String(a.lokasi || "").trim().toUpperCase()))].filter(Boolean);
            uniqueRooms.sort();
        
            let html = '<option value="ALL">Semua Ruangan</option>';
            uniqueRooms.forEach(room => {
                html += `<option value="${room}">${room}</option>`;
            });
        
            selectEl.innerHTML = html;
        
            if (uniqueRooms.includes(currentSelected)) {
                selectEl.value = currentSelected;
            }
        }

        function handleCompressedPhoto(event) {
            const file = event.target.files[0];
            if (!file) return;

            showToast('Memproses Foto', 'Mengompres ukuran foto agar hemat Google Drive...', 'info');

            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.src = e.target.result;
                img.onload = function () {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    const MAX_WIDTH = 600;
                    const MAX_HEIGHT = 600;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
                    activeEvidencePhoto = compressedBase64;
                    const sizeInKb = Math.round((compressedBase64.length * 3) / 4 / 1024);

                    const previewImg = document.getElementById('temuanPreviewImg');
                    const previewContainer = document.getElementById('temuanPreviewContainer');
                    const btnRemove = document.getElementById('btnRemoveFoto');
                    const sizeInfo = document.getElementById('photoSizeInfo');

                    if (previewImg) previewImg.src = compressedBase64;
                    if (previewContainer) previewContainer.classList.remove('hidden');
                    if (btnRemove) btnRemove.classList.remove('hidden');
                    if (sizeInfo) sizeInfo.innerText = `Ukuran: ~${sizeInKb} KB (Sangat Hemat)`;

                    showToast('Berhasil', `Foto berhasil dikompres (~${sizeInKb} KB).`, 'success');
                };
            };
            reader.readAsDataURL(file);
        }

        function openScanMethodModal() {
            const modal = document.getElementById('scanMethodModal');
            if (modal) modal.classList.remove('hidden');
        }

        function closeScanMethodModal() {
            const modal = document.getElementById('scanMethodModal');
            if (modal) modal.classList.add('hidden');
        }

        function selectLiveCameraScan() {
            closeScanMethodModal();
            openCameraModal();
        }

        function handleChangePasswordSubmit(e) {
            e.preventDefault();
        
            const oldPassword = safeGetValue('oldPasswordInput').trim();
            const newPassword = safeGetValue('newPasswordInput').trim();
            const submitBtn = document.getElementById('btnUpdatePass');
        
            const activeUserStr = localStorage.getItem('asv_active_user');
            if (!activeUserStr) {
                showToast('Gagal', 'Sesi login tidak ditemukan. Silakan login ulang.', 'error');
                return;
            }
            const currentUser = JSON.parse(activeUserStr);
        
            if (!oldPassword || !newPassword) {
                showToast('Input Kosong', 'Harap isi sandi lama dan sandi baru.', 'warning');
                return;
            }
        
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin mr-1"></i> Menyimpan...`;
            }
        
            fetch(PROXY_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: "updatePassword",
                    npk: currentUser.npk,
                    oldPassword: oldPassword,
                    newPassword: newPassword
                })
            })
            .then(res => res.json())
            .then(res => {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Simpan Kata Sandi Baru</span>`;
                }
        
                if (res && res.success) {
                    showToast('Berhasil!', res.message, 'success');
                    playBeepSound('success');
                    document.getElementById('oldPasswordInput').value = '';
                    document.getElementById('newPasswordInput').value = '';
                } else {
                    showToast('Gagal Ubah Sandi', res.message || 'Sandi lama tidak sesuai.', 'error');
                    playBeepSound('error');
                }
            })
            .catch(err => {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Simpan Kata Sandi Baru</span>`;
                }
                showToast('Koneksi Gagal', 'Tidak dapat terhubung ke server.', 'warning');
            });
        }
        
        function toggleCustomPasswordVisibility(inputId, iconId) {
            const inputField = document.getElementById(inputId);
            const iconEl = document.getElementById(iconId);
            if (!inputField || !iconEl) return;
        
            if (inputField.type === 'password') {
                inputField.type = 'text';
                iconEl.className = 'fa-solid fa-eye-slash text-xs';
            } else {
                inputField.type = 'password';
                iconEl.className = 'fa-solid fa-eye text-xs';
            }
        }

        function updateDashboardStats() {
            const selectedBranch = safeGetValue('branchSelector', 'ALL');
        
            // Filter aset berdasarkan cabang aktif
            const scopedAssets = selectedBranch === 'ALL' 
                ? assets 
                : assets.filter(a => a.cabang.startsWith(selectedBranch) || selectedBranch.startsWith(a.cabang));
        
            // Filter log riwayat berdasarkan cabang aktif
            const scopedLogs = selectedBranch === 'ALL'
                ? historyLogs
                : historyLogs.filter(h => h.cabang.startsWith(selectedBranch) || selectedBranch.startsWith(h.cabang));
        
            const totalAsset = scopedAssets.length;
        
            // Hitung unik aset yang sudah terscan
            const scannedAssetIds = new Set(scopedLogs.map(h => String(h.assetId).trim().toLowerCase()));
            const totalScanned = scopedAssets.filter(a => scannedAssetIds.has(String(a.id).trim().toLowerCase())).length;
            const totalPending = Math.max(0, totalAsset - totalScanned);
        
            const scannedPct = totalAsset > 0 ? Math.round((totalScanned / totalAsset) * 100) : 0;
            const pendingPct = totalAsset > 0 ? Math.round((totalPending / totalAsset) * 100) : 0;
        
            // Update Teks Kartu KPI
            safeSetText('cardTotalAsset', totalAsset);
            safeSetText('cardScannedAsset', totalScanned);
            safeSetText('cardPendingAsset', totalPending);
            safeSetText('cardScannedPct', `${scannedPct}%`);
            safeSetText('cardPendingPct', `${pendingPct}%`);
        
            // Update Welcome Banner Badge Ring
            safeSetText('dashOverallRing', `${scannedPct}%`);
            safeSetText('dashOverallText', `${totalScanned} dari ${totalAsset} Aset Selesai`);
        
            const descLabel = selectedBranch === 'ALL' ? 'Semua Cabang Terdaftar' : `Business Area: ${selectedBranch}`;
            safeSetText('labelFilterDesc', descLabel);
        
            // --- HITUNG KONDISI FISIK DARI LOG (DIURUTKAN DARI YANG SPESIFIK) ---
            let countGood = 0;
            let countLight = 0;
            let countHeavy = 0;
            let countLost = 0;
        
            scopedLogs.forEach(h => {
                const targetVal = activeStatusType === 'aset' ? (h.statusAset || "") : (h.statusLabel || "");
                const st = String(targetVal).trim().toLowerCase();
        
                if (st.includes('baik')) {
                    countGood++;
                } else if (st.includes('berat')) {
                    countHeavy++; // Cek 'berat' terlebih dahulu agar tidak tertukar
                } else if (st.includes('ringan') || (st.includes('rusak') && !st.includes('berat'))) {
                    countLight++;
                } else if (st.includes('hilang') || st.includes('tidak')) {
                    countLost++;
                }
            });
        
            safeSetText('insightGood', countGood);
            safeSetText('insightLight', countLight);
            safeSetText('insightHeavy', countHeavy);
            safeSetText('insightLost', countLost);
        
            // Update Angka di Legenda Grafik
            safeSetText('legGood', countGood);
            safeSetText('legLight', countLight);
            safeSetText('legHeavy', countHeavy);
            safeSetText('legLost', countLost);
            safeSetText('chartTotalScannedLabel', `${scopedLogs.length} Unit Verifikasi`);
        
            // --- RENDER VISUAL MULTI-COLOR PROGRESS BAR CHART ---
            const progressBarEl = document.getElementById('multiColorProgressBar');
            if (progressBarEl) {
                const totalScannedLogs = scopedLogs.length;
                if (totalScannedLogs === 0) {
                    progressBarEl.innerHTML = `<div style="width: 100%" class="bg-slate-200 rounded-full transition-all duration-500" title="Belum ada data scan"></div>`;
                } else {
                    const pGood = (countGood / totalScannedLogs) * 100;
                    const pLight = (countLight / totalScannedLogs) * 100;
                    const pHeavy = (countHeavy / totalScannedLogs) * 100;
                    const pLost = (countLost / totalScannedLogs) * 100;
        
                    progressBarEl.innerHTML = `
                        <div style="width: ${pGood}%" class="bg-emerald-500 h-full rounded-l-full transition-all duration-500" title="Kondisi Baik: ${countGood}"></div>
                        <div style="width: ${pLight}%" class="bg-amber-500 h-full transition-all duration-500" title="Rusak Ringan: ${countLight}"></div>
                        <div style="width: ${pHeavy}%" class="bg-rose-500 h-full transition-all duration-500" title="Rusak Berat: ${countHeavy}"></div>
                        <div style="width: ${pLost}%" class="bg-slate-700 h-full rounded-r-full transition-all duration-500" title="Hilang: ${countLost}"></div>
                    `;
                }
            }
        }

        // Fungsi untuk mengubah sudut pandang analisis di dashboard (Aset vs Label)
        function setDashboardPerspective(perspectiveType) {
            activeStatusType = perspectiveType; // 'aset' atau 'label'
        
            const btnAset = document.getElementById('dashBtnAset');
            const btnLabel = document.getElementById('dashBtnLabel');
        
            if (perspectiveType === 'aset') {
                if (btnAset) btnAset.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-daihatsu-600 text-white shadow-xs";
                if (btnLabel) btnLabel.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-600 hover:text-slate-900";
            } else {
                if (btnLabel) btnLabel.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-daihatsu-600 text-white shadow-xs";
                if (btnAset) btnAset.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-600 hover:text-slate-900";
            }
        
            // Perbarui perhitungan grafik dan angka di kartu kondisi secara real-time
            renderKPIs();
        }

        // --- MODAL INPUT MANUAL KODE ASET ---

        // 1. Membuka modal custom input manual
        function openManualInputPrompt() {
            closeScanMethodModal();
            const modal = document.getElementById('manualInputModal');
            const inputField = document.getElementById('manualAssetCodeInput');
            
            if (modal && inputField) {
                inputField.value = '';
                modal.classList.remove('hidden');
                setTimeout(() => inputField.focus(), 100); // Otomatis fokus ke kotak teks saat modal terbuka
            }
        }
        
        // 2. Menutup modal custom input manual
        function closeManualInputModal() {
            const modal = document.getElementById('manualInputModal');
            if (modal) modal.classList.add('hidden');
        }
        
       function submitManualAssetCode() {
            const manualId = safeGetValue('manualAssetCodeInput').trim();
            if (!manualId) {
                showToast('Input Kosong', 'Harap masukkan ID Asset terlebih dahulu.', 'warning');
                return;
            }
        
            const queryId = manualId.toLowerCase();
        
            let foundAsset = assets.find(a => {
                let dbId = String(a.id || a["ID Asset"] || "").trim().toLowerCase();
                return dbId === queryId;
            });
        
            if (!foundAsset) {
                playBeepSound('error');
                showToast('Aset Tidak Ditemukan', `ID Asset "${manualId}" tidak terdaftar di Master Aset.`, 'warning');
                return;
            }
        
            closeManualInputModal();
            playBeepSound('success');
            
            // Kirim secara eksplisit 'Manual' sebagai metode opname
            openOpnameModal(foundAsset, 'Manual');
        }

        function handleImageBarcodeUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            closeScanMethodModal();
            showToast('Memindai Gambar', 'Membaca barcode dari foto...', 'info');

            const html5QrCode = new Html5Qrcode("cameraReader");
            html5QrCode.scanFile(file, true)
                .then(decodedText => {
                    html5QrCode.clear();
                    const inputEl = document.getElementById('mainBarcodeInput');
                    if (inputEl) inputEl.value = decodedText;
                    playBeepSound('success');
                    triggerOpnameLookup('Scan');
                })
                .catch(err => {
                    html5QrCode.clear();
                    playBeepSound('error');
                    showToast('Gagal Membaca', 'Barcode tidak ditemukan pada foto yang diambil. Coba ulangi.', 'error');
                });
        }

        
        // --- INITIALIZATION ---
        window.onload = function () {
            // Jalankan sinkronisasi otomatis setiap 8 detik di semua device
            setInterval(() => {
                // Pastikan tidak sedang dalam proses input/scan agar tidak mengganggu user
                if (typeof loadLogsFromServer === 'function') {
                    loadLogsFromServer(true); // Parameter true agar berjalan silent tanpa memunculkan toast berlebihan
                }
            }, 10000); // 10000 ms = 10 detik

            // Cek Sesi Petugas yang Tersimpan
            const savedUser = localStorage.getItem('asv_active_user');
            if (savedUser) {
                try {
                    updateActiveUserUI(JSON.parse(savedUser));
                    closeLoginModal(true);
                } catch (e) {
                    localStorage.removeItem('asv_active_user');
                    updateActiveUserUI(null);
                    openLoginModal();
                }
            } else {
                updateActiveUserUI(null);
                openLoginModal(); // Buka modal login otomatis jika belum ada sesi
            }

            // Cegah tombol Escape menutup modal login jika belum autentikasi
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    const activeUser = localStorage.getItem('asv_active_user');
                    const loginModal = document.getElementById('loginModal');
                    if (loginModal && !loginModal.classList.contains('hidden') && !activeUser) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }
            });

            fetchDataFromBackend();
            
            renderKPIs();
            renderTable();
            renderHistoryTable();

            const inputEl = document.getElementById('mainBarcodeInput');
            if (inputEl) {
                inputEl.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        triggerOpnameLookup('Manual');
                    }
                });
            }
        };

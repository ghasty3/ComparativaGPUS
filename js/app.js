function switchTab(tab) {
    currentTab = tab;
    const hierarchyView = document.getElementById('hierarchyView');
    const priceCompareView = document.getElementById('priceCompareView');
    const tabHierarchy = document.getElementById('tabHierarchy');
    const tabPriceCompare = document.getElementById('tabPriceCompare');
    const footerText = document.getElementById('footerText');

    if (tab === 'hierarchy') {
        hierarchyView.classList.remove('hidden');
        priceCompareView.classList.add('hidden');
        tabHierarchy.classList.add('active');
        tabPriceCompare.classList.remove('active');
        footerText.textContent = 'Haz clic en cualquier GPU para establecerla como referencia (100%)';
    } else {
        hierarchyView.classList.add('hidden');
        priceCompareView.classList.remove('hidden');
        tabHierarchy.classList.remove('active');
        tabPriceCompare.classList.add('active');
        footerText.textContent = 'Añade GPUs con sus precios para comparar el rendimiento por euro';
        updatePriceCompareDropdown();
    }
}

function setReferenceGPU(gpuName) {
    if (currentTab !== 'hierarchy') return;
    referenceGPU = gpuData.find(g => g.name === gpuName);

    if (referenceGPU) {
        document.getElementById('refBanner').classList.remove('hidden');
        document.getElementById('refName').textContent = referenceGPU.name;
    }

    renderTable();
}

function clearReference() {
    referenceGPU = null;
    document.getElementById('refBanner').classList.add('hidden');
    renderTable();
}

function processCSV(csvText) {
    Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            gpuData = results.data.map(gpu => ({
                ...gpu,
                score: calculateScore(gpu)
            }));

            updateArchFilter();
            renderTable();
        },
        error: function(error) {
            alert('Error al procesar CSV: ' + error.message);
        }
    });
}

function loadDemoData() {
    processCSV(DEMO_CSV);
}

async function loadGPUDataFromCSV() {
    try {
        const baseUrl = window.location.href.replace(/\/[^/]*$/, '');
        const csvUrl = baseUrl + '/gpu_data.csv';
        const response = await fetch(csvUrl, { cache: 'no-cache' });
        if (!response.ok) {
            console.log('No se encontró gpu_data.csv, cargando datos demo...');
            loadDemoData();
            return;
        }
        const csvText = await response.text();
        processCSV(csvText);
    } catch (error) {
        console.log('Error cargando CSV, usando datos demo:', error);
        loadDemoData();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('tabHierarchy').addEventListener('click', () => switchTab('hierarchy'));
    document.getElementById('tabPriceCompare').addEventListener('click', () => switchTab('priceCompare'));

    document.getElementById('csvInput').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    gpuData = results.data.map(gpu => ({
                        ...gpu,
                        score: calculateScore(gpu)
                    }));

                    updateArchFilter();
                    renderTable();
                },
                error: function(error) {
                    alert('Error al procesar CSV: ' + error.message);
                }
            });
        }
    });

    document.getElementById('loadDemoBtn').addEventListener('click', loadDemoData);
    document.getElementById('clearRefBtn').addEventListener('click', clearReference);

    document.getElementById('searchInput').addEventListener('input', function(e) {
        filters.search = e.target.value;
        renderTable();
    });

    document.getElementById('vendorFilter').addEventListener('change', function(e) {
        filters.vendor = e.target.value;
        renderTable();
    });

    document.getElementById('typeFilter').addEventListener('change', function(e) {
        filters.type = e.target.value;
        renderTable();
    });

    document.getElementById('archFilter').addEventListener('change', function(e) {
        filters.architecture = e.target.value;
        renderTable();
    });

    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', function() {
            const column = this.dataset.sort;
            handleSort(column);
        });
    });

    document.getElementById('addPriceCompareBtn').addEventListener('click', addPriceComparison);
    document.getElementById('clearAllCompareBtn').addEventListener('click', clearAllComparisons);

    // LLM Control listeners
    const modelProfileSelect = document.getElementById('modelProfileSelect');
    const quantizationContainer = document.getElementById('quantizationContainer');
    const quantSelect = document.getElementById('quantSelect');
    const ramTypeContainer = document.getElementById('ramTypeContainer');
    const ramTypeSelect = document.getElementById('ramTypeSelect');
    const pcieGenContainer = document.getElementById('pcieGenContainer');
    const pcieGenSelect = document.getElementById('pcieGenSelect');
    const customModelConfig = document.getElementById('customModelConfig');

    modelProfileSelect.addEventListener('change', function() {
        selectedModel = this.value;
        if (selectedModel === 'none') {
            quantizationContainer.classList.add('hidden');
            ramTypeContainer.classList.add('hidden');
            pcieGenContainer.classList.add('hidden');
            customModelConfig.classList.add('hidden');
        } else if (selectedModel === 'custom') {
            quantizationContainer.classList.add('hidden');
            ramTypeContainer.classList.add('hidden');
            pcieGenContainer.classList.add('hidden');
            customModelConfig.classList.remove('hidden');
        } else {
            quantizationContainer.classList.remove('hidden');
            ramTypeContainer.classList.remove('hidden');
            pcieGenContainer.classList.remove('hidden');
            customModelConfig.classList.add('hidden');
        }
        renderTable();
        renderPriceComparison();
    });

    quantSelect.addEventListener('change', function() {
        selectedQuant = this.value;
        renderTable();
        renderPriceComparison();
    });

    ramTypeSelect.addEventListener('change', function() {
        sysRamBwGbps = this.value === 'ddr4' ? 40.0 : 60.0;
        renderTable();
        renderPriceComparison();
    });

    pcieGenSelect.addEventListener('change', function() {
        sysPcieGen = parseInt(this.value) || 4;
        renderTable();
        renderPriceComparison();
    });

    document.getElementById('customTotalParams').addEventListener('input', function() {
        customModelParams.totalParams = parseFloat(this.value) || 0;
        renderTable();
        renderPriceComparison();
    });

    document.getElementById('customActiveParams').addEventListener('input', function() {
        customModelParams.activeParams = parseFloat(this.value) || 0;
        renderTable();
        renderPriceComparison();
    });

    document.getElementById('customQuantBits').addEventListener('input', function() {
        customModelParams.quantBits = parseFloat(this.value) || 0;
        renderTable();
        renderPriceComparison();
    });

    document.getElementById('customSysRamBw').addEventListener('input', function() {
        customModelParams.sysRamBw = parseFloat(this.value) || 0;
        renderTable();
        renderPriceComparison();
    });

    loadGPUDataFromCSV();
});

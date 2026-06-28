function updatePriceCompareDropdown() {
    const select = document.getElementById('priceCompareGPU');
    select.innerHTML = '<option value="">-- Selecciona una GPU --</option>' +
        gpuData.map(gpu => `<option value="${gpu.name}">${gpu.name}</option>`).join('');
}

function addPriceComparison() {
    const gpuName = document.getElementById('priceCompareGPU').value;
    const customPrice = parseFloat(document.getElementById('customPrice').value);

    if (!gpuName || !customPrice || customPrice <= 0) {
        alert('Por favor selecciona una GPU y introduce un precio válido');
        return;
    }

    const gpu = gpuData.find(g => g.name === gpuName);
    if (!gpu) return;

    if (priceCompareList.some(item => item.name === gpuName)) {
        alert('Esta GPU ya está en la lista de comparación');
        return;
    }

    const customValue = (gpu.score / customPrice) * 1000;

    priceCompareList.push({
        name: gpu.name,
        score: gpu.score,
        price: customPrice,
        value: customValue,
        vendor: gpu.vendor,
        arquitecture: gpu.arquitecture
    });

    document.getElementById('priceCompareGPU').value = '';
    document.getElementById('customPrice').value = '';

    renderPriceComparison();
}

function removePriceComparison(index) {
    priceCompareList.splice(index, 1);
    renderPriceComparison();
}

function clearAllComparisons() {
    priceCompareList = [];
    renderPriceComparison();
}

function renderPriceComparison() {
    const listContainer = document.getElementById('selectedGPUsList');
    const resultsContainer = document.getElementById('comparisonResults');
    const clearBtn = document.getElementById('clearAllCompareBtn');

    if (priceCompareList.length === 0) {
        listContainer.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No hay GPUs seleccionadas</p>';
        clearBtn.classList.add('hidden');
        resultsContainer.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <svg class="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
                <p>Selecciona GPUs y añade precios para comparar</p>
                <p class="text-sm text-gray-600 mt-2">Descubre cuál ofrece mejor rendimiento por euro</p>
            </div>
        `;
        return;
    }

    clearBtn.classList.remove('hidden');

    listContainer.innerHTML = priceCompareList.map((item, index) => {
        const gpuObj = gpuData.find(g => g.name === item.name);
        const llmRes = gpuObj ? calculateLLMPerformance(gpuObj) : null;
        let infoStr = `€${item.price} - ${item.value.toFixed(2)} pts/€`;
        if (selectedModel !== 'none') {
            if (llmRes) {
                const llmVal = llmRes.generationSpeedTps / item.price;
                infoStr = `€${item.price} - ${llmVal.toFixed(3)} tok/s por €`;
            } else {
                infoStr = `€${item.price} - Req. CUDA`;
            }
        }
        return `
            <div class="flex items-center justify-between p-3 bg-charcoal-700 rounded-lg">
                <div>
                    <p class="text-sm font-medium text-white">${item.name}</p>
                    <p class="text-xs text-gray-400">${infoStr}</p>
                </div>
                <button onclick="removePriceComparison(${index})" class="text-gray-500 hover:text-red-400 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
    }).join('');

    let sorted;
    if (selectedModel !== 'none') {
        sorted = [...priceCompareList].map(item => {
            const gpuObj = gpuData.find(g => g.name === item.name);
            const llmRes = gpuObj ? calculateLLMPerformance(gpuObj) : null;
            const llmGen = llmRes ? llmRes.generationSpeedTps : 0;
            const llmPrefill = llmRes ? llmRes.prefillSpeedTps : 0;
            const llmVal = item.price > 0 ? llmGen / item.price : 0;
            const bottleneck = llmRes ? llmRes.bottleneck : 'Req. CUDA';
            return { ...item, llmGen, llmPrefill, llmVal, bottleneck };
        }).sort((a, b) => b.llmVal - a.llmVal);
    } else {
        sorted = [...priceCompareList].sort((a, b) => b.value - a.value);
    }

    const maxValue = sorted[0] ? sorted[0].value : 0;
    const maxLlmVal = (selectedModel !== 'none' && sorted[0]) ? sorted[0].llmVal : 0;

    resultsContainer.innerHTML = sorted.map((item, index) => {
        let percentage, rankColor, barColor, valBlock, detailsBlock;

        if (selectedModel !== 'none') {
            percentage = maxLlmVal > 0 ? (item.llmVal / maxLlmVal * 100) : 0;
            rankColor = index === 0 ? 'text-indigo-400' : index === 1 ? 'text-purple-400' : index === 2 ? 'text-violet-400' : 'text-gray-400';
            barColor = index === 0 ? 'bg-indigo-500' : index === 1 ? 'bg-purple-500' : index === 2 ? 'bg-violet-500' : 'bg-gray-500';

            const bottleneckBadge = item.bottleneck === 'Req. CUDA' 
                ? `<span class="px-2 py-0.5 rounded text-[10px] bg-red-900/50 text-red-400 border border-red-700/30">Req. CUDA</span>`
                : `<span class="px-2 py-0.5 rounded text-[10px] bg-indigo-900/50 text-indigo-300 border border-indigo-700/30">${item.bottleneck}</span>`;

            valBlock = `
                <p class="text-2xl font-bold ${index === 0 ? 'text-indigo-400' : 'text-white'}">${item.llmVal.toFixed(3)}</p>
                <p class="text-xs text-gray-400">tok/s por €</p>
            `;

            detailsBlock = `
                <div class="text-right text-xs text-gray-400 flex items-center gap-2">
                    <span class="text-emerald-400 font-medium">€${item.price}</span>
                    <span>·</span>
                    <span>Gen: ${item.llmGen.toFixed(1)} tok/s</span>
                    <span>·</span>
                    <span>Prefill: ${item.llmPrefill.toFixed(0)} tok/s</span>
                    <span>·</span>
                    ${bottleneckBadge}
                </div>
            `;
        } else {
            percentage = maxValue > 0 ? (item.value / maxValue * 100) : 0;
            rankColor = index === 0 ? 'text-emerald-400' : index === 1 ? 'text-yellow-400' : index === 2 ? 'text-orange-400' : 'text-gray-400';
            barColor = index === 0 ? 'bg-emerald-500' : index === 1 ? 'bg-yellow-500' : index === 2 ? 'bg-orange-500' : 'bg-gray-500';

            valBlock = `
                <p class="text-2xl font-bold ${getValueColorClass(item.value)}">${item.value.toFixed(2)}</p>
                <p class="text-xs text-gray-400">pts/€</p>
            `;

            detailsBlock = `
                <div class="text-right text-sm">
                    <span class="text-emerald-400 font-medium">€${item.price}</span>
                    <span class="text-gray-500 mx-1">·</span>
                    <span class="text-gray-400">Score: ${item.score.toFixed(1)}</span>
                </div>
            `;
        }

        return `
            <div class="price-card rounded-xl p-4 fade-in" style="animation-delay: ${index * 0.1}s">
                <div class="flex items-center gap-4">
                    <div class="flex-shrink-0 w-10 h-10 rounded-full bg-charcoal-600 flex items-center justify-center">
                        <span class="text-lg font-bold ${rankColor}">#${index + 1}</span>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center justify-between mb-2">
                            <div>
                                <p class="text-lg font-semibold text-white">${item.name}</p>
                                <p class="text-xs text-gray-400">${item.vendor} · ${item.arquitecture}</p>
                            </div>
                            <div class="text-right">
                                ${valBlock}
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="flex-1 bg-charcoal-600 rounded-full h-3 overflow-hidden">
                                <div class="performance-bar ${barColor} h-full rounded-full" style="width: ${percentage}%"></div>
                            </div>
                            ${detailsBlock}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function handleSort(column) {
    if (sortConfig.column === column) {
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortConfig.column = column;
        sortConfig.direction = 'desc';
    }

    document.querySelectorAll('.sortable').forEach(th => {
        th.classList.remove('active');
        const svg = th.querySelector('.sort-icon');
        if (svg) {
            svg.classList.remove('text-emerald-400', 'text-indigo-400');
            svg.classList.add('text-gray-500');
            const up = svg.querySelector('.up-arrow');
            const down = svg.querySelector('.down-arrow');
            if (up) up.style.opacity = '0.5';
            if (down) down.style.opacity = '0.5';
        }
    });

    const activeTh = document.querySelector(`[data-sort="${column}"]`);
    if (activeTh) {
        activeTh.classList.add('active');
        const svg = activeTh.querySelector('.sort-icon');
        if (svg) {
            svg.classList.remove('text-gray-500');
            const highlightColor = (column === 'llm_perf') ? 'text-indigo-400' : 'text-emerald-400';
            svg.classList.add(highlightColor);
            const up = svg.querySelector('.up-arrow');
            const down = svg.querySelector('.down-arrow');
            if (sortConfig.direction === 'asc') {
                if (up) up.style.opacity = '1';
                if (down) down.style.opacity = '0.15';
            } else {
                if (up) up.style.opacity = '0.15';
                if (down) down.style.opacity = '1';
            }
        }
    }

    renderTable();
}

function sortData(data) {
    return [...data].sort((a, b) => {
        let valA, valB;

        switch (sortConfig.column) {
            case 'name':
                valA = a.name || '';
                valB = b.name || '';
                break;
            case 'shaders':
                valA = parseInt(a.shaders) || 0;
                valB = parseInt(b.shaders) || 0;
                break;
            case 'clock':
                valA = parseInt(a.clock) || 0;
                valB = parseInt(b.clock) || 0;
                break;
            case 'vram':
                valA = parseInt(a.vram) || 0;
                valB = parseInt(b.vram) || 0;
                break;
            case 'tdp':
                valA = parseInt(a['TDP (W)']) || 0;
                valB = parseInt(b['TDP (W)']) || 0;
                break;
            case 'price':
                valA = parseFloat(a.buy_price_p10) || 0;
                valB = parseFloat(b.buy_price_p10) || 0;
                break;
            case 'score':
                valA = a.score || 0;
                valB = b.score || 0;
                break;
            case 'llm_perf':
                const resA = calculateLLMPerformance(a);
                const resB = calculateLLMPerformance(b);
                valA = resA ? resA.generationSpeedTps : 0.0;
                valB = resB ? resB.generationSpeedTps : 0.0;
                break;
            case 'value':
                valA = calculateValue(a);
                valB = calculateValue(b);
                break;
            default:
                valA = a.score || 0;
                valB = b.score || 0;
        }

        if (sortConfig.direction === 'asc') {
            return valA > valB ? 1 : -1;
        } else {
            return valA < valB ? 1 : -1;
        }
    });
}

function updateStats(data) {
    document.getElementById('totalGPUs').textContent = data.length;

    if (data.length > 0) {
        const scores = data.map(g => g.score);
        const max = Math.max(...scores);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

        document.getElementById('maxScore').textContent = max.toFixed(1);
        document.getElementById('avgScore').textContent = avg.toFixed(1);

        const values = data.map(g => ({ name: g.name, value: calculateValue(g) }));
        values.sort((a, b) => b.value - a.value);
        const best = values[0];
        document.getElementById('bestValue').textContent = best ? best.value.toFixed(2) : '-';
    } else {
        document.getElementById('maxScore').textContent = '-';
        document.getElementById('avgScore').textContent = '-';
        document.getElementById('bestValue').textContent = '-';
    }
}

function updateArchFilter() {
    const archs = [...new Set(gpuData.map(g => g.arquitecture))].sort();
    const select = document.getElementById('archFilter');
    const currentVal = select.value;

    select.innerHTML = '<option value="">Todas las Arquitecturas</option>' +
        archs.map(arch => `<option value="${arch}">${arch}</option>`).join('');

    select.value = currentVal;
}

function renderTable() {
    const tbody = document.getElementById('gpuTableBody');

    let filtered = gpuData.filter(gpu => {
        const matchesSearch = !filters.search ||
            gpu.name.toLowerCase().includes(filters.search.toLowerCase());
        const matchesVendor = !filters.vendor || gpu.vendor === filters.vendor;
        const matchesType = !filters.type || gpu.gpu_type === filters.type;
        const matchesArch = !filters.architecture || gpu.arquitecture === filters.architecture;
        return matchesSearch && matchesVendor && matchesType && matchesArch;
    });

    filtered = sortData(filtered);

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="px-6 py-12 text-center text-gray-500">
                    No se encontraron GPUs con los filtros seleccionados
                </td>
            </tr>
        `;
        return;
    }

    const maxScore = referenceGPU ? referenceGPU.score : Math.max(...filtered.map(g => g.score));

    // Precalculate max LLM speed for relative percentage bars
    let maxLlmSpeed = 0.1;
    let referenceLlmSpeed = 0.0;
    if (selectedModel !== 'none') {
        filtered.forEach(g => {
            const res = calculateLLMPerformance(g);
            if (res && res.generationSpeedTps > maxLlmSpeed) {
                maxLlmSpeed = res.generationSpeedTps;
            }
        });
        if (referenceGPU) {
            const refRes = calculateLLMPerformance(referenceGPU);
            if (refRes) {
                referenceLlmSpeed = refRes.generationSpeedTps;
            }
        }
    }

    tbody.innerHTML = filtered.map((gpu, index) => {
        const percentage = referenceGPU
            ? (gpu.score / referenceGPU.score * 100)
            : (gpu.score / maxScore * 100);
        const isReference = referenceGPU && gpu.name === referenceGPU.name;
        const barColor = isReference ? 'bg-emerald-500' : getBarColor(percentage);
        const barWidth = Math.max(percentage, 1);
        const value = calculateValue(gpu);
        const price = parseFloat(gpu.buy_price_p10) || 0;

        // LLM performance calculations
        const llm = calculateLLMPerformance(gpu);
        let llmHtml = '';
        if (selectedModel === 'none') {
            llmHtml = `<td class="px-4 py-4 text-sm text-gray-500 text-center font-mono">-</td>`;
        } else if (gpu.vendor !== 'NVIDIA') {
            llmHtml = `
                <td class="px-4 py-4 text-sm text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-950/40 text-red-400 border border-red-900/50">
                        Req. CUDA
                    </span>
                </td>
            `;
        } else if (llm) {
            const refSpeed = referenceLlmSpeed > 0 ? referenceLlmSpeed : maxLlmSpeed;
            const llmPercentage = (llm.generationSpeedTps / refSpeed) * 100;
            const llmBarWidth = Math.max(Math.min(llmPercentage, 100), 1);
            const llmBarColor = isReference ? 'bg-indigo-500' : getLLMBarColor(llmPercentage);
            
            let bottleneckClass = 'text-gray-500';
            if (llm.bottleneck === 'PCIe/RAM (Offload)') {
                bottleneckClass = 'text-amber-400 font-semibold';
            } else if (llm.bottleneck === 'Compute (TFLOPS)') {
                bottleneckClass = 'text-blue-400 font-semibold';
            } else if (llm.bottleneck === 'VRAM Bandwidth') {
                bottleneckClass = 'text-emerald-400 font-semibold';
            }

            llmHtml = `
                <td class="px-4 py-4">
                    <div class="flex flex-col gap-0.5 min-w-[140px]">
                        <div class="flex justify-between text-xs text-gray-300">
                            <span>Prefill:</span>
                            <span class="font-mono text-white font-medium">${llm.prefillSpeedTps} t/s</span>
                        </div>
                        <div class="flex justify-between text-xs text-gray-300">
                            <span>Gen:</span>
                            <span class="font-mono text-indigo-300 font-bold">${llm.generationSpeedTps} t/s</span>
                        </div>
                        <div class="flex items-center gap-2 mt-1">
                            <div class="flex-1 bg-charcoal-600 rounded-full h-1.5 overflow-hidden">
                                <div class="performance-bar ${llmBarColor} h-full rounded-full" style="width: ${llmBarWidth}%"></div>
                            </div>
                            <span class="text-[10px] font-mono ${isReference ? 'text-indigo-400' : 'text-gray-400'} w-8 text-right">${llmPercentage.toFixed(0)}%</span>
                        </div>
                        <div class="flex justify-between items-center text-[9px] text-gray-400 mt-0.5">
                            <span>VRAM: ${llm.vramUtilizationPercent.toFixed(0)}%</span>
                            <span class="${bottleneckClass}">${llm.bottleneck}</span>
                        </div>
                    </div>
                </td>
            `;
        } else {
            llmHtml = `<td class="px-4 py-4 text-sm text-gray-500 text-center font-mono">-</td>`;
        }

        return `
            <tr class="gpu-row ${isReference ? 'active' : ''} cursor-pointer"
                onclick="setReferenceGPU('${gpu.name}')">
                <td class="px-4 py-4">
                    <div class="flex items-center gap-2">
                        ${isReference ? `
                            <div class="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                        ` : '<div class="w-5 flex-shrink-0"></div>'}
                        <div>
                            <p class="text-sm font-semibold text-white">${gpu.name}</p>
                            ${isReference ? '<span class="text-xs text-emerald-400">Ref. 100%</span>' : ''}
                        </div>
                    </div>
                </td>
                <td class="px-4 py-4">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getVendorBadgeClass(gpu.vendor)}">
                        ${gpu.vendor}
                    </span>
                </td>
                <td class="px-4 py-4 text-sm text-gray-300">${gpu.arquitecture}</td>
                <td class="px-4 py-4 text-sm text-gray-300 font-mono">${gpu.vram ? gpu.vram + ' GB' : '-'}</td>
                <td class="px-4 py-4 text-sm text-gray-300">${gpu.gpu_type}</td>
                <td class="px-4 py-4 text-sm text-gray-300 font-mono">${formatNumber(gpu.shaders)}</td>
                <td class="px-4 py-4 text-sm text-gray-300 font-mono">${gpu.clock}</td>
                <td class="px-4 py-4 text-sm text-gray-300">${gpu['TDP (W)']}W</td>
                <td class="px-4 py-4 text-sm text-emerald-400 font-medium">${formatPrice(price)}</td>
                <td class="px-4 py-4">
                    <div class="flex items-center gap-2">
                        <div class="flex-1 bg-charcoal-600 rounded-full h-2 overflow-hidden">
                            <div class="performance-bar ${barColor} h-full rounded-full" style="width: ${barWidth}%"></div>
                        </div>
                        <span class="text-xs font-mono ${isReference ? 'text-emerald-400' : 'text-gray-400'} w-12 text-right">${percentage.toFixed(0)}%</span>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">Score: ${gpu.score.toFixed(1)}</p>
                </td>
                ${llmHtml}
                <td class="px-4 py-4">
                    <div class="flex flex-col">
                        <span class="text-sm font-bold ${getValueColorClass(value)}">${value.toFixed(2)}</span>
                        <span class="text-xs text-gray-500">pts/€</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    updateStats(filtered);
}

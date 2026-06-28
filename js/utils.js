function calculateScore(gpu) {
    const shaders = parseInt(gpu.shaders) || 0;
    const clock = parseInt(gpu.clock) || 0;
    const archMultiplier = ARCH_MULTIPLIERS[gpu.arquitecture] || ARCH_MULTIPLIERS['Unknown'];
    const vendorMultiplier = VENDOR_MULTIPLIERS[gpu.vendor] || 1.00;
    return Math.round(shaders * clock * archMultiplier * vendorMultiplier / 1000000 * 100) / 100;
}

function calculateValue(gpu) {
    const price = parseFloat(gpu.buy_price_p10) || 0;
    if (price === 0 || gpu.score === 0) return 0;
    return Math.round(gpu.score / price * 1000 * 100) / 100;
}

function getBarColor(percentage) {
    if (percentage >= 90) return 'bg-emerald-500';
    if (percentage >= 70) return 'bg-emerald-400';
    if (percentage >= 50) return 'bg-yellow-500';
    if (percentage >= 30) return 'bg-orange-500';
    return 'bg-red-500';
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPrice(price) {
    if (!price || price === 0) return '-';
    return '€' + formatNumber(price);
}

function getValueColorClass(value) {
    if (value >= 40) return 'text-emerald-400';
    if (value >= 30) return 'text-yellow-400';
    if (value >= 20) return 'text-orange-400';
    return 'text-red-400';
}

function getVendorBadgeClass(vendor) {
    const classes = {
        'NVIDIA': 'bg-green-900/50 text-green-400 border border-green-700',
        'AMD': 'bg-red-900/50 text-red-400 border border-red-700',
        'Intel': 'bg-blue-900/50 text-blue-400 border border-blue-700'
    };
    return classes[vendor] || 'bg-gray-800 text-gray-400';
}

const MODEL_PROFILES = {
    'qwen_3_6_moe': { name: 'Qwen 3.6 MoE (35B, A3B)', totalParams: 35.0, activeParams: 3.0 },
    'gemma_4_moe': { name: 'Gemma 4 MoE (26B, A4B)', totalParams: 26.0, activeParams: 4.0 },
    'gemma_4_35b': { name: 'Gemma 4 (35B)', totalParams: 35.0, activeParams: 35.0 },
    'qwen_3_6_27b': { name: 'Qwen 3.6 (27B)', totalParams: 27.0, activeParams: 27.0 },
    'qwen_3_5_9b': { name: 'Qwen 3.5 (9B)', totalParams: 9.0, activeParams: 9.0 }
};

const QUANT_BITS = {
    'q8': 8.5,
    'q6': 6.5,
    'q4': 4.5,
    'q3': 3.5
};

function calculateLLMPerformance(gpu) {
    if (gpu.vendor !== 'NVIDIA') {
        return null;
    }
    if (selectedModel === 'none') {
        return null;
    }

    let totalParams, activeParams, quantBits, sysBw;
    if (selectedModel === 'custom') {
        totalParams = parseFloat(customModelParams.totalParams) || 14.0;
        activeParams = parseFloat(customModelParams.activeParams) || 14.0;
        quantBits = parseFloat(customModelParams.quantBits) || 4.5;
        sysBw = parseFloat(customModelParams.sysRamBw) || 60.0;
    } else {
        const profile = MODEL_PROFILES[selectedModel];
        if (!profile) return null;
        totalParams = profile.totalParams;
        activeParams = profile.activeParams;
        quantBits = QUANT_BITS[selectedQuant] || 4.5;
        sysBw = sysRamBwGbps;
    }

    const gpuVramGb = parseFloat(gpu.vram) || 0.0;
    const gpuBwGbps = parseFloat(gpu.bandwidth_gbps) || 0.0;
    const gpuTflopsFp16 = parseFloat(gpu.ai_tflops) || 0.0;

    const contextVramBufferGb = 1.6;
    const promptTokens = 2048;
    const pcieSyncLatency = sysPcieGen >= 4 ? 0.001 : 0.002;

    // 1. Análisis de Pesos Físicos (Gigabytes)
    const totalWeightGb = (totalParams * quantBits) / 8.0;
    const activeWeightGb = (activeParams * quantBits) / 8.0;
    const isMoe = activeParams < totalParams;

    // 2. Asignación de Memoria (VRAM vs RAM Offload)
    const vramDisponible = Math.max(0.0, gpuVramGb - contextVramBufferGb);
    const ratioVram = Math.min(1.0, vramDisponible / totalWeightGb);
    const ratioRam = 1.0 - ratioVram;

    // Ajuste de Ancho de Banda de RAM según si es MoE o Denso
    const efectiveRamBw = isMoe ? sysBw * 0.6 : sysBw;

    // Eficiencia física del bus de memoria de la GPU (típica de ~50% durante decode GEMV)
    const gpuBwEfficiency = 0.50;
    const efectiveGpuBw = gpuBwGbps * gpuBwEfficiency;

    // Prefill
    const tPrefillReadVram = efectiveGpuBw > 0 ? (totalWeightGb * ratioVram) / efectiveGpuBw : 999.0;
    const tPrefillReadRam = ratioRam > 0 ? (totalWeightGb * ratioRam) / efectiveRamBw : 0.0;

    const gigaflopsPrefill = activeParams * 2.0 * promptTokens;
    const tPrefillCompute = gpuTflopsFp16 > 0 ? gigaflopsPrefill / ((gpuTflopsFp16 / 2.0) * 1000.0) : 999.0;

    const tTotalPrefill = tPrefillReadVram + tPrefillReadRam + tPrefillCompute;
    const prefillSpeed = tTotalPrefill > 0 ? promptTokens / tTotalPrefill : 0.0;

    // Generation
    const tGenVram = efectiveGpuBw > 0 ? (activeWeightGb * ratioVram) / efectiveGpuBw : 99.0;
    const tGenRam = ratioRam > 0 ? (activeWeightGb * ratioRam) / efectiveRamBw : 0.0;
    const tGenSync = ratioRam > 0 ? pcieSyncLatency : 0.0;
    const tGenCompute = gpuTflopsFp16 > 0 ? (activeParams * 2.0) / ((gpuTflopsFp16 / 2.0) * 1000.0) : 0.1;

    const tTotalGen = tGenVram + tGenRam + tGenSync + tGenCompute;
    const generationSpeed = tTotalGen > 0 ? 1.0 / tTotalGen : 0.0;

    const isOffloaded = ratioRam > 0;
    let bottleneck = "VRAM Bandwidth";
    if (isOffloaded) {
        bottleneck = "PCIe/RAM (Offload)";
    } else if (tGenCompute > tGenVram) {
        bottleneck = "Compute (TFLOPS)";
    }

    return {
        isOffloaded,
        vramUtilizationPercent: ratioVram * 100,
        ramOffloadPercent: ratioRam * 100,
        prefillSpeedTps: Math.round(prefillSpeed * 10) / 10,
        generationSpeedTps: Math.round(generationSpeed * 10) / 10,
        bottleneck
    };
}

function getLLMBarColor(percentage) {
    if (percentage >= 90) return 'bg-indigo-500';
    if (percentage >= 70) return 'bg-indigo-400';
    if (percentage >= 50) return 'bg-purple-500';
    if (percentage >= 30) return 'bg-purple-400';
    return 'bg-pink-500';
}


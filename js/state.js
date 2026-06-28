let gpuData = [];
let referenceGPU = null;
let filters = {
    search: '',
    vendor: '',
    type: '',
    architecture: ''
};
let sortConfig = {
    column: 'score',
    direction: 'desc'
};
let priceCompareList = [];
let currentTab = 'hierarchy';

// LLM Performance variables
let selectedModel = 'none';
let selectedQuant = 'q4';
let sysRamBwGbps = 60.0;
let sysPcieGen = 4;
let customModelParams = {
    totalParams: 14.0,
    activeParams: 14.0,
    quantBits: 4.5,
    sysRamBw: 60.0
};


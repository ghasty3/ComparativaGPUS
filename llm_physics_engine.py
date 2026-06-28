"""
Motor de Simulación de Rendimiento LLM (Reference Implementation)
Diseñado para ser traducido e integrado en dashboards de hardware.

LÓGICA CORE:
Implementa el modelo "Roofline" separando la fase de Prefill (Compute Bound) 
de la fase de Generación (Memory Bound). Incluye optimizaciones modernas de 
offload (como --n-cpu-moe de llama.cpp) donde el bus PCIe solo transmite 
el Hidden State (microsegundos) y la CPU calcula In-Place en la RAM.
"""

from typing import Dict, Union

class LLMPerformanceSimulator:
    def __init__(self, 
                 sys_ram_bw_gbps: float = 60.0,  # DDR5 por defecto
                 sys_pcie_gen: int = 4):         # PCIe 4.0 por defecto
        
        self.sys_ram_bw = sys_ram_bw_gbps
        self.pcie_sync_latency = 0.001 if sys_pcie_gen >= 4 else 0.002

    def calculate_performance(self, 
                              gpu_vram_gb: float, 
                              gpu_bw_gbps: float, 
                              gpu_tflops_fp16: float, 
                              model_total_params_b: float, 
                              model_active_params_b: float, 
                              quantization_bits: float = 4.5, 
                              prompt_tokens: int = 2048,
                              context_vram_buffer_gb: float = 1.0) -> Dict[str, Union[float, str]]:
        
        # 1. Análisis de Pesos Físicos (Gigabytes)
        total_weight_gb = (model_total_params_b * quantization_bits) / 8.0
        active_weight_gb = (model_active_params_b * quantization_bits) / 8.0
        is_moe = model_active_params_b < model_total_params_b

        # 2. Asignación de Memoria (VRAM vs RAM Offload)
        vram_disponible = max(0.0, gpu_vram_gb - context_vram_buffer_gb)
        ratio_vram = min(1.0, vram_disponible / total_weight_gb)
        ratio_ram = 1.0 - ratio_vram

        # Ajuste de Ancho de Banda de RAM según si es MoE o Denso
        # Modelos Densos leen secuencial (rápido). MoE lee aleatorio (penalizado, pero optimizado in-place).
        efective_ram_bw = self.sys_ram_bw * 0.6 if is_moe else self.sys_ram_bw
        gpu_bw_efficiency = 0.50
        efective_gpu_bw = gpu_bw_gbps * gpu_bw_efficiency

        # ==========================================
        # FASE 1: PREFILL (Procesamiento del Prompt)
        # Cuello de botella: TFLOPS (Matemáticas)
        # ==========================================
        
        # Se lee el modelo 1 vez de la memoria
        t_prefill_read_vram = (total_weight_gb * ratio_vram) / efective_gpu_bw if efective_gpu_bw > 0 else 999.0
        t_prefill_read_ram = (total_weight_gb * ratio_ram) / efective_ram_bw if ratio_ram > 0 else 0.0
        
        # Se calcula masivamente: 2 FLOPs * Params Activos * Tokens
        gigaflops_prefill = model_active_params_b * 2.0 * prompt_tokens
        t_prefill_compute = gigaflops_prefill / (gpu_tflops_fp16 * 1000.0) if gpu_tflops_fp16 > 0 else 999.0
        
        t_total_prefill = t_prefill_read_vram + t_prefill_read_ram + t_prefill_compute
        prefill_speed = prompt_tokens / t_total_prefill if t_total_prefill > 0 else 0

        # ==========================================
        # FASE 2: GENERACIÓN (Token a Token)
        # Cuello de botella: Ancho de Banda (GB/s)
        # ==========================================
        
        # La GPU lee su parte In-Place
        t_gen_vram = (active_weight_gb * ratio_vram) / efective_gpu_bw if efective_gpu_bw > 0 else 99.0
        
        # La CPU lee su parte In-Place (simulando --n-cpu-moe)
        t_gen_ram = (active_weight_gb * ratio_ram) / efective_ram_bw if ratio_ram > 0 else 0.0
        
        # Viaje del Hidden State por el bus (microsegundos)
        t_gen_sync = self.pcie_sync_latency if ratio_ram > 0 else 0.0
        
        # Cómputo matemático por token (Casi nulo frente al tiempo de lectura)
        t_gen_compute = (model_active_params_b * 2.0) / (gpu_tflops_fp16 * 1000.0) if gpu_tflops_fp16 > 0 else 0.1
        
        t_total_gen = t_gen_vram + t_gen_ram + t_gen_sync + t_gen_compute
        generation_speed = 1.0 / t_total_gen if t_total_gen > 0 else 0

        return {
            "is_offloaded": ratio_ram > 0,
            "vram_utilization_percent": ratio_vram * 100,
            "ram_offload_percent": ratio_ram * 100,
            "prefill_speed_tps": round(prefill_speed, 1),
            "generation_speed_tps": round(generation_speed, 1),
            "bottleneck": "Compute (TFLOPS)" if ratio_ram == 0 and t_gen_compute > t_gen_vram else 
                          "PCIe/RAM (Offload)" if ratio_ram > 0 else "VRAM Bandwidth"
        }

# Ejemplo de uso (Test para el Agente):
if __name__ == "__main__":
    sim = LLMPerformanceSimulator()
    # Test MoE: RTX 5060 Ti con Qwen 3.6 35B (3B activos) en Q4
    resultado_moe = sim.calculate_performance(
        gpu_vram_gb=16.0, gpu_bw_gbps=448.0, gpu_tflops_fp16=59.0,
        model_total_params_b=35.0, model_active_params_b=3.0
    )
    print("Test MoE RTX 5060 Ti:", resultado_moe)

    # Test Dense: RTX 5060 Ti con Gemma 4 (35B, 35B activos) en Q4
    resultado_dense = sim.calculate_performance(
        gpu_vram_gb=16.0, gpu_bw_gbps=448.0, gpu_tflops_fp16=59.0,
        model_total_params_b=35.0, model_active_params_b=35.0
    )
    print("Test Dense RTX 5060 Ti (offloaded):", resultado_dense)

    # Test Qwen 27B Q3: RTX 5060 Ti con Qwen 3.6 27B (27B activos) en Q3
    resultado_qwen = sim.calculate_performance(
        gpu_vram_gb=16.0, gpu_bw_gbps=448.0, gpu_tflops_fp16=94.81,
        model_total_params_b=27.0, model_active_params_b=27.0,
        quantization_bits=3.5
    )
    print("Test Qwen 27B Q3 RTX 5060 Ti (VRAM-only):", resultado_qwen)
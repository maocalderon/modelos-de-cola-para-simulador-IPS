"""
Cálculos Matemáticos de Teoría de Colas - Modelo M/M/s y Extensiones con Prioridad.
Implementa las fórmulas analíticas de Erlang-C y Colas de Prioridad (Cobham)
para comparar los resultados teóricos contra la simulación SimPy.
"""

import math
from typing import Dict, Any


def calculate_mms_theory(
    arrival_rate: float,      # lambda (pacientes por hora)
    service_rate: float,      # mu (pacientes atendidos por ventanilla por hora)
    num_servers: int,         # s (número de servidores/ventanillas)
    priority_ratio: float = 0.25 # proporción de pacientes prioritarios
) -> Dict[str, Any]:
    """
    Calcula los indicadores teóricos para un sistema M/M/s con cola única y servidores paralelos.
    También desglosa el tiempo de espera por clases de prioridad (Cobham non-preemptive).
    
    Retorna diccionario con métricas en minutos y unidades estándar.
    """
    s = num_servers
    lam = float(arrival_rate)
    mu = float(service_rate)
    
    if s <= 0 or mu <= 0:
        return {"error": "Servidores y tasa de servicio deben ser mayores a 0"}
        
    c = lam / mu  # Ofrecimiento de tráfico (Erlangs)
    rho = lam / (s * mu) # Factor de utilización
    
    is_stable = rho < 1.0
    
    # 1. Probabilidad de que el sistema esté vacío (P0)
    sum_terms = sum((c ** n) / math.factorial(n) for n in range(s))
    
    if rho < 1.0:
        last_term = (c ** s) / (math.factorial(s) * (1.0 - rho))
        p0 = 1.0 / (sum_terms + last_term)
        
        # 2. Fórmula de Erlang-C (Probabilidad de que un paciente deba esperar en cola)
        erlang_c = last_term * p0
        
        # 3. Número promedio de pacientes en cola (Lq)
        lq = (erlang_c * rho) / (1.0 - rho)
        
        # 4. Tiempo promedio de espera en cola (Wq) en horas y en minutos
        wq_hours = lq / lam if lam > 0 else 0.0
        wq_minutes = wq_hours * 60.0
        
        # 5. Tiempo total promedio en el sistema (W) = Wq + 1/mu
        w_hours = wq_hours + (1.0 / mu)
        w_minutes = w_hours * 60.0
        
        # 6. Número promedio de pacientes en el sistema (L)
        l = lam * w_hours
        
        # 7. Modelo de Prioridades no apropiativo (Cobham para M/M/s)
        # Clase 1: Prioritarios (Adulto Mayor, Discapacidad, etc.)
        # Clase 2: Regulares
        lam_1 = lam * priority_ratio
        lam_2 = lam * (1.0 - priority_ratio)
        rho_1 = lam_1 / (s * mu)
        
        # W0 es el tiempo medio restante de servicio experimentado por una llegada
        w0_hours = erlang_c / (s * mu)
        
        if rho_1 < 1.0:
            wq1_hours = w0_hours / (1.0 - rho_1)
            wq1_minutes = wq1_hours * 60.0
        else:
            wq1_minutes = float("inf")
            
        if rho < 1.0 and rho_1 < 1.0:
            wq2_hours = w0_hours / ((1.0 - rho_1) * (1.0 - rho))
            wq2_minutes = wq2_hours * 60.0
        else:
            wq2_minutes = float("inf")
            
    else:
        # Sistema inestable o saturado (rho >= 1)
        p0 = 0.0
        erlang_c = 1.0
        lq = float("inf")
        wq_minutes = float("inf")
        w_minutes = float("inf")
        l = float("inf")
        wq1_minutes = float("inf")
        wq2_minutes = float("inf")
        
    return {
        "is_stable": is_stable,
        "s": s,
        "lambda_per_hour": round(lam, 2),
        "mu_per_hour": round(mu, 2),
        "mean_service_minutes": round(60.0 / mu, 2) if mu > 0 else 0,
        "rho": round(rho, 4),
        "rho_percent": round(rho * 100, 2),
        "traffic_erlangs": round(c, 3),
        "p0": round(p0, 4),
        "p0_percent": round(p0 * 100, 2),
        "erlang_c_prob_wait": round(erlang_c, 4),
        "prob_wait_percent": round(erlang_c * 100, 2),
        "lq": round(lq, 2) if lq != float("inf") else "Infinito (Saturado)",
        "l": round(l, 2) if l != float("inf") else "Infinito (Saturado)",
        "wq_minutes": round(wq_minutes, 2) if wq_minutes != float("inf") else "Infinito",
        "w_minutes": round(w_minutes, 2) if w_minutes != float("inf") else "Infinito",
        "priority_theory": {
            "wq_priority_minutes": round(wq1_minutes, 2) if wq1_minutes != float("inf") else "Infinito",
            "wq_regular_minutes": round(wq2_minutes, 2) if wq2_minutes != float("inf") else "Infinito",
            "priority_wait_reduction_pct": round(
                ((wq2_minutes - wq1_minutes) / wq2_minutes) * 100, 1
            ) if (wq2_minutes != float("inf") and wq2_minutes > 0) else 0.0
        }
    }

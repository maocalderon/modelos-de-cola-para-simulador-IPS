"""
Motor de Simulación Discreta con SimPy para la IPS Viva Salud Integral.
Parámetros en el orden especificado:
1. MU (tasa de llegada)
2. LAMBDA (tiempo promedio de atención en ventanilla)
3. S (ventanillas de recepción / servidores)
4. K (tickets / fichos base)

La variabilidad estocástica y la disciplina de cola con prioridad son gestionadas
internamente por SimPy en el backend.
"""

import math
import random
from typing import List, Dict, Any, Optional
import simpy

from .patient import (
    Patient,
    generate_patient,
    CATEGORY_REGULAR,
    CATEGORY_ADULTO_MAYOR,
    CATEGORY_DISCAPACIDAD,
    CATEGORY_EMBARAZADA,
    CATEGORY_VULNERABLE,
    PRIORITY_LABELS,
    PRIORITY_ICONS
)
from .queue_theory import calculate_mms_theory


def minutes_to_clock(sim_minutes: float, start_hour: int = 5, start_minute: int = 0) -> str:
    """Convierte minutos de simulación a formato reloj 'HH:MM AM/PM'."""
    total_minutes = int(round(sim_minutes))
    day_minutes = (start_hour * 60 + start_minute + total_minutes) % (24 * 60)
    
    hours = day_minutes // 60
    mins = day_minutes % 60
    period = "AM" if hours < 12 else "PM"
    
    display_hour = hours if hours <= 12 else hours - 12
    if display_hour == 0:
        display_hour = 12
        
    return f"{display_hour:02d}:{mins:02d} {period}"


class IPSSimulation:
    def __init__(
        self,
        mu_arrival_rate: float = 30.0,        # 1. MU: Tasa de llegada (pacientes por hora)
        lambda_service_time: float = 7.0,     # 2. LAMBDA: Tiempo promedio de atención (minutos)
        num_servers: int = 3,                 # 3. S: Ventanillas de recepción (servidores paralelos)
        base_tokens: int = 30,                # 4. K: Cantidad de tickets / fichos base
        total_arrivals: Optional[int] = None, # Total de personas que llegan a hacer la fila (ej. K + 15)
        custom_distribution: Optional[Dict[str, float]] = None, # Distribución manual o None para auto
        random_seed: Optional[int] = 42
    ):
        # 1. MU: Tasa de llegada (pacientes por hora) -> intervalo promedio = 60 / mu minutos
        self.mu_arrival_rate = max(1.0, float(mu_arrival_rate))
        self.arrival_mean_interval = 60.0 / self.mu_arrival_rate
        
        # 2. LAMBDA: Tiempo promedio de atención en ventanilla (minutos)
        self.lambda_service_time = max(1.0, float(lambda_service_time))
        self.service_mean_minutes = self.lambda_service_time
        
        # 3. S: Ventanillas
        self.num_servers = max(1, int(num_servers))
        
        # 4. K: Tickets / fichos base
        self.base_tokens = max(1, int(base_tokens))
        
        # Total de llegadas: por defecto k + 15 para simular fila completa y descartes
        if total_arrivals is not None:
            self.total_arrivals = max(self.base_tokens, int(total_arrivals))
        else:
            self.total_arrivals = self.base_tokens + 15
            
        self.custom_distribution = custom_distribution
        self.random_seed = random_seed
        self.rng = random.Random(random_seed) if random_seed is not None else random.Random()
        
        # SimPy Environment
        self.env = simpy.Environment()
        self.reception_servers = simpy.PriorityResource(self.env, capacity=self.num_servers)
        
        # Estado de simulación
        self.patients: List[Patient] = []
        self.events: List[Dict[str, Any]] = []
        self.token_queue: List[Patient] = [] # Fila física para fichos
        self.tokens_distributed = 0
        self.extra_tokens_count = 0
        self.tokens_exhausted = False
        
        # Ventanillas disponibles y estado
        self.server_busy_status = {i + 1: False for i in range(self.num_servers)}
        self.server_current_patient = {i + 1: None for i in range(self.num_servers)}
        
        # Métricas agregadas
        self.served_count = 0
        self.reception_waiting_list: List[int] = []

    def log_event(
        self,
        event_type: str,
        message: str,
        patient: Optional[Patient] = None,
        desk_id: Optional[int] = None,
        extra_data: Optional[Dict[str, Any]] = None
    ):
        """Registra un evento ordenado cronológicamente para la animación 3D y auditoría."""
        sim_time = self.env.now
        clock = minutes_to_clock(sim_time)
        active_desks = sum(1 for is_busy in self.server_busy_status.values() if is_busy)
        
        event = {
            "index": len(self.events) + 1,
            "sim_time": round(sim_time, 2),
            "clock": clock,
            "type": event_type,
            "message": message,
            "patient": patient.to_dict() if patient else None,
            "desk_id": desk_id,
            "state": {
                "token_queue_len": len(self.token_queue),
                "tokens_given": self.tokens_distributed,
                "extra_tokens": self.extra_tokens_count,
                "reception_waiting": len(self.reception_waiting_list),
                "active_desks": active_desks,
                "served_count": self.served_count,
            }
        }
        if extra_data:
            event["extra_data"] = extra_data
            
        self.events.append(event)

    def run_simulation(self) -> Dict[str, Any]:
        """Ejecuta el proceso completo de simulación en SimPy."""
        # 1. Proceso de llegadas estocásticas de pacientes
        self.env.process(self._arrivals_generator())
        
        # 2. Proceso de inicio de reparto de fichos (06:00 AM = minuto 60)
        self.env.process(self._token_distribution_process())
        
        # 3. Proceso de apertura de recepción (08:00 AM = minuto 180)
        self.env.process(self._reception_opening_process())
        
        self.log_event("SIM_START", "05:00 AM: Inicia la jornada en la IPS Viva Salud Integral.")
        self.env.run(until=900)
        self.log_event("SIM_COMPLETE", "Jornada completada con éxito en la IPS.")
        
        return self._generate_summary_report()

    def _arrivals_generator(self):
        """Genera llegadas con intervalo exponencial controlado por SimPy (tasa MU)."""
        for i in range(1, self.total_arrivals + 1):
            # Intervalo exponencial generado por SimPy
            interval = self.rng.expovariate(1.0 / self.arrival_mean_interval)
            yield self.env.timeout(interval)
            
            patient = generate_patient(
                patient_id=i,
                arrival_time=self.env.now,
                custom_distribution=self.custom_distribution,
                rng=self.rng
            )
            self.patients.append(patient)
            
            # Gestión de la cola de fichos según prioridad o rechazo
            self._handle_patient_arrival_to_token_queue(patient)

    def _handle_patient_arrival_to_token_queue(self, patient: Patient):
        """
        Regla de negocio IPS:
        - Si los K fichos ya se agotaron, cualquier paciente es rechazado.
        - Si aún hay fichos disponibles:
            - Prioritarios adelantan la fila hasta el frente.
            - Regulares se ubican al final.
        """
        if self.tokens_exhausted:
            if patient.is_priority:
                self._assign_extra_token(patient, "llegó con los tickets base agotados")
                if self.env.now >= 180:
                    self.env.process(self._patient_reception_process(patient))
            else:
                self._reject_patient(patient, "TICKETS_EXHAUSTED")
        else:
            # Los tickets aún están disponibles o aún no son las 6:00 AM
            if patient.is_priority:
                # Adelanta la fila ubicándose por delante de todos los regulares
                insert_idx = 0
                for idx, p in enumerate(self.token_queue):
                    if p.is_priority:
                        insert_idx = idx + 1
                    else:
                        break
                self.token_queue.insert(insert_idx, patient)
                
                self.log_event(
                    "PRIORITY_OVERTAKE",
                    f"{patient.name} ({PRIORITY_LABELS.get(patient.category)}) tiene condición prioritaria y pasa al frente de la fila (Posición #{insert_idx + 1}).",
                    patient=patient,
                    extra_data={"queue_position": insert_idx + 1}
                )
            else:
                self.token_queue.append(patient)
                self.log_event(
                    "PATIENT_ARRIVAL",
                    f"{patient.name} ({patient.category}) llega a la fila exterior (Posición #{len(self.token_queue)}).",
                    patient=patient,
                    extra_data={"queue_position": len(self.token_queue)}
                )

    def _token_distribution_process(self):
        """A las 06:00 AM (minuto 60), se entregan los K tickets base."""
        yield self.env.timeout(60.0)
        self.log_event("TOKEN_DISTRIBUTION_START", "06:00 AM: Inicia el reparto de tickets en el módulo exterior.")
        
        while self.tokens_distributed < self.base_tokens:
            if len(self.token_queue) > 0:
                patient = self.token_queue.pop(0)
                
                # Tiempo que tarda la entrega física del ticket (12 a 25 segundos)
                handover_time = self.rng.uniform(0.2, 0.4)
                yield self.env.timeout(handover_time)
                
                self.tokens_distributed += 1
                patient.token_number = self.tokens_distributed
                patient.token_assigned_time = self.env.now
                patient.wait_time_token = patient.token_assigned_time - patient.arrival_gate_time
                
                self.log_event(
                    "TOKEN_ASSIGNED",
                    f"Ticket #{patient.token_number} entregado a {patient.name} ({PRIORITY_LABELS.get(patient.category)}).",
                    patient=patient,
                    extra_data={"token_number": patient.token_number}
                )
            else:
                if self.env.now >= 180:
                    break
                yield self.env.timeout(1.0)
                
        self.tokens_exhausted = True
        self.log_event(
            "TOKENS_EXHAUSTED",
            f"Se han entregado los {self.tokens_distributed} tickets base disponibles. Cupos de ventanilla cerrados."
        )
        
        # Nadie en la fila puede recibir un ticket por encima del límite K.
        while len(self.token_queue) > 0:
            rem = self.token_queue.pop(0)
            if rem.is_priority:
                self._assign_extra_token(rem, "estaba en la fila al agotarse los tickets base")
            else:
                self._reject_patient(rem, "NO_TICKET_LEFT")

    def _assign_extra_token(self, patient: Patient, context: str):
        self.extra_tokens_count += 1
        token_num = self.base_tokens + self.extra_tokens_count
        patient.token_number = token_num
        patient.is_extra_token = True
        patient.token_assigned_time = self.env.now
        patient.wait_time_token = patient.token_assigned_time - patient.arrival_gate_time
        self.log_event(
            "TOKEN_EXTRA_EXCEPTION",
            f"EXCEPCIÓN PRIORITARIA: {patient.name} {context}. Recibe el ticket extra #{token_num}.",
            patient=patient,
            extra_data={"token_number": token_num, "is_extra": True}
        )

    def _reject_patient(self, patient: Patient, reason: str):
        patient.token_rejected = True
        self.log_event(
            "TOKEN_REJECTED",
            f"RECHAZADO: {patient.name} no alcanzó uno de los {self.base_tokens} tickets y se retira de la IPS.",
            patient=patient,
            extra_data={"departing": True, "reason": reason}
        )

    def _reception_opening_process(self):
        """A las 08:00 AM (minuto 180), abren las puertas de recepción M/M/s."""
        if self.env.now < 180.0:
            yield self.env.timeout(180.0 - self.env.now)
            
        self.log_event(
            "RECEPTION_OPEN",
            f"08:00 AM: Apertura de recepción. {self.num_servers} ventanillas habilitadas para atender a los pacientes con ticket."
        )
        
        patients_with_token = [
            p for p in self.patients
            if p.token_number is not None and not p.token_rejected
        ]
        patients_with_token.sort(key=lambda p: p.token_number if p.token_number else 999)
        
        for patient in patients_with_token:
            yield self.env.timeout(self.rng.uniform(0.05, 0.15))
            self.env.process(self._patient_reception_process(patient))

    def _patient_reception_process(self, patient: Patient):
        """Atención en ventanilla bajo disciplina de cola con prioridad estricta en SimPy."""
        patient.reception_arrival_time = self.env.now
        self.reception_waiting_list.append(patient.id)
        
        self.log_event(
            "PATIENT_ENTER_RECEPTION",
            f"{patient.name} ingresa a la sala de espera con Ticket #{patient.token_number}.",
            patient=patient
        )
        
        # SimPy PriorityResource: prioridad 0 para prioritarios, prioridad 1 para regulares
        priority_rank = 0 if patient.is_priority else 1
        
        with self.reception_servers.request(priority=priority_rank) as req:
            yield req
            
            patient.service_start_time = self.env.now
            patient.wait_time_reception = patient.service_start_time - patient.reception_arrival_time
            if patient.id in self.reception_waiting_list:
                self.reception_waiting_list.remove(patient.id)
                
            desk_id = self._find_free_desk()
            self.server_busy_status[desk_id] = True
            self.server_current_patient[desk_id] = patient.id
            patient.server_id = desk_id
            
            prio_badge = " [PRIORITARIO]" if patient.is_priority else ""
            self.log_event(
                "PATIENT_CALLED",
                f"Turno Ticket #{patient.token_number}{prio_badge} ({patient.name}) -> Ventanilla {desk_id}.",
                patient=patient,
                desk_id=desk_id,
                extra_data={"desk_id": desk_id, "token_number": patient.token_number}
            )
            
            # Duración del servicio exponencial con media lambda_service_time (manejada por SimPy)
            service_duration = max(1.5, self.rng.expovariate(1.0 / self.service_mean_minutes))
            patient.service_duration = service_duration
            
            yield self.env.timeout(service_duration)
            
            patient.service_end_time = self.env.now
            patient.total_time_in_system = patient.service_end_time - patient.arrival_gate_time
            self.served_count += 1
            
            self.server_busy_status[desk_id] = False
            self.server_current_patient[desk_id] = None
            
            self.log_event(
                "SERVICE_END",
                f"{patient.name} completó su atención en Ventanilla {desk_id} ({round(service_duration, 1)} min) y se retira de la IPS.",
                patient=patient,
                desk_id=desk_id,
                extra_data={"duration": round(service_duration, 1), "departing": True}
            )

    def _find_free_desk(self) -> int:
        for desk_id, is_busy in self.server_busy_status.items():
            if not is_busy:
                return desk_id
        return 1

    def _generate_summary_report(self) -> Dict[str, Any]:
        """Calcula todas las métricas estadísticas y comparativa contra teoría M/M/s."""
        attended_patients = [p for p in self.patients if p.service_end_time is not None]
        priority_attended = [p for p in attended_patients if p.is_priority]
        regular_attended = [p for p in attended_patients if not p.is_priority]
        rejected_patients = [p for p in self.patients if p.token_rejected]
        
        token_patients = [p for p in self.patients if p.token_assigned_time is not None]
        avg_wait_token_all = sum(p.wait_time_token for p in token_patients) / len(token_patients) if token_patients else 0.0
        avg_wait_token_prio = (
            sum(p.wait_time_token for p in token_patients if p.is_priority) /
            len([p for p in token_patients if p.is_priority])
        ) if [p for p in token_patients if p.is_priority] else 0.0
        avg_wait_token_reg = (
            sum(p.wait_time_token for p in token_patients if not p.is_priority) /
            len([p for p in token_patients if not p.is_priority])
        ) if [p for p in token_patients if not p.is_priority] else 0.0
        
        avg_wait_reception_all = sum(p.wait_time_reception for p in attended_patients) / len(attended_patients) if attended_patients else 0.0
        avg_wait_reception_prio = sum(p.wait_time_reception for p in priority_attended) / len(priority_attended) if priority_attended else 0.0
        avg_wait_reception_reg = sum(p.wait_time_reception for p in regular_attended) / len(regular_attended) if regular_attended else 0.0
        avg_service_time = sum(p.service_duration for p in attended_patients) / len(attended_patients) if attended_patients else 0.0
        avg_total_system_time = sum(p.total_time_in_system for p in attended_patients) / len(attended_patients) if attended_patients else 0.0
        
        # Teoría M/M/s:
        # Tasa de servicio mu_theory (atenciones por hora por servidor) = 60 / lambda_service_time
        mu_service_rate_per_hour = 60.0 / self.service_mean_minutes
        
        # Proporción prioritaria observada
        priority_fraction = len(priority_attended) / len(attended_patients) if attended_patients else 0.25
        
        # Tasa de llegada efectiva
        arrival_rate_theory = min(self.mu_arrival_rate, self.num_servers * mu_service_rate_per_hour * 0.88)
        
        theory_metrics = calculate_mms_theory(
            arrival_rate=arrival_rate_theory,
            service_rate=mu_service_rate_per_hour,
            num_servers=self.num_servers,
            priority_ratio=priority_fraction
        )
        
        category_counts = {}
        for p in self.patients:
            category_counts[p.category] = category_counts.get(p.category, 0) + 1
            
        return {
            "config": {
                "mu_arrival_rate": self.mu_arrival_rate,
                "lambda_service_time": self.lambda_service_time,
                "num_servers": self.num_servers,
                "base_tokens": self.base_tokens,
                "total_arrivals": self.total_arrivals,
                "custom_distribution": self.custom_distribution,
                "random_seed": self.random_seed
            },
            "summary": {
                "total_patients_arrived": len(self.patients),
                "tokens_base_distributed": self.tokens_distributed,
                "tokens_extra_distributed": self.extra_tokens_count,
                "total_tokens_granted": self.tokens_distributed + self.extra_tokens_count,
                "total_rejected": len(rejected_patients),
                "total_attended": len(attended_patients),
                "priority_attended": len(priority_attended),
                "regular_attended": len(regular_attended),
                "category_counts": category_counts,
            },
            "kpi_simulated": {
                "avg_wait_token_all": round(avg_wait_token_all, 2),
                "avg_wait_token_priority": round(avg_wait_token_prio, 2),
                "avg_wait_token_regular": round(avg_wait_token_reg, 2),
                "avg_wait_reception_all": round(avg_wait_reception_all, 2),
                "avg_wait_reception_priority": round(avg_wait_reception_prio, 2),
                "avg_wait_reception_regular": round(avg_wait_reception_reg, 2),
                "avg_service_time": round(avg_service_time, 2),
                "avg_total_system_time": round(avg_total_system_time, 2),
                "priority_benefit_percent": round(
                    ((avg_wait_reception_reg - avg_wait_reception_prio) / avg_wait_reception_reg) * 100, 1
                ) if avg_wait_reception_reg > 0 else 0.0,
            },
            "theory_mms": theory_metrics,
            "events_count": len(self.events),
            "events": self.events,
            "patients": [p.to_dict() for p in self.patients]
        }

"""
Modelo de Pacientes y Categorías para la IPS Viva Salud Integral.
Soporta asignación automática aleatoria en SimPy o distribución personalizada del 100%.
"""

from dataclasses import dataclass
from typing import Optional, Dict
import random

# Categorías de pacientes en la IPS
CATEGORY_REGULAR = "REGULAR"
CATEGORY_ADULTO_MAYOR = "ADULTO_MAYOR"
CATEGORY_DISCAPACIDAD = "DISCAPACIDAD"
CATEGORY_EMBARAZADA = "EMBARAZADA"
CATEGORY_VULNERABLE = "VULNERABLE"

PRIORITY_LABELS = {
    CATEGORY_REGULAR: "Regular",
    CATEGORY_ADULTO_MAYOR: "Adulto Mayor (60+)",
    CATEGORY_DISCAPACIDAD: "Persona con Discapacidad",
    CATEGORY_EMBARAZADA: "Mujer Embarazada",
    CATEGORY_VULNERABLE: "Población Vulnerable",
}

PRIORITY_ICONS = {
    CATEGORY_REGULAR: "👤",
    CATEGORY_ADULTO_MAYOR: "👴",
    CATEGORY_DISCAPACIDAD: "♿",
    CATEGORY_EMBARAZADA: "🤰",
    CATEGORY_VULNERABLE: "🤝",
}

PRIORITY_COLORS = {
    CATEGORY_REGULAR: "#3b82f6",       # Azul
    CATEGORY_ADULTO_MAYOR: "#f59e0b",   # Ámbar
    CATEGORY_DISCAPACIDAD: "#ef4444",   # Rojo
    CATEGORY_EMBARAZADA: "#ec4899",     # Rosa
    CATEGORY_VULNERABLE: "#8b5cf6",     # Púrpura
}

# Nombres realistas para la simulación
NOMBRES = [
    "Carlos", "María", "José", "Rosa", "Juan", "Luz", "Luis", "Ana", "Jorge", "Carmen",
    "Pedro", "Martha", "Andrés", "Gloria", "David", "Patricia", "Javier", "Elena", "Daniel", "Sandra",
    "Héctor", "Claudia", "Fernando", "Diana", "Gabriel", "Esperanza", "Ricardo", "Cecilia", "Manuel", "Teresa",
    "Hernando", "Adriana", "Gustavo", "Paola", "Oscar", "Beatriz", "Iván", "Mónica", "Felipe", "Lucía"
]

APELLIDOS = [
    "Rodríguez", "Gómez", "López", "González", "Martínez", "García", "Pérez", "Sánchez", "Ramírez", "Torres",
    "Díaz", "Vargas", "Castro", "Morales", "Ríos", "Álvarez", "Mendoza", "Jiménez", "Rojas", "Herrera",
    "Medina", "Aguilar", "Suárez", "Guerrero", "Ortiz", "Navarro", "Cardona", "Duque", "Valencia", "Rendón"
]


@dataclass
class Patient:
    id: int
    name: str
    category: str
    is_priority: bool
    
    # Tiempos de simulación (en minutos desde las 05:00 AM)
    arrival_gate_time: float = 0.0          # Hora en que llega a la fila exterior
    token_assigned_time: Optional[float] = None # Hora en que recibe el ficho
    token_number: Optional[int] = None       # Número de ficho asignado (1..k o k+1 para extra)
    is_extra_token: bool = False             # Si fue un ficho extra concedido por excepción prioritaria
    token_rejected: bool = False            # Si quedó sin ficho (rechazado por agotamiento)
    
    # Ingreso a sala desde las 07:00 AM; ventanilla desde las 08:00 AM (min 180)
    reception_arrival_time: Optional[float] = None  # Ingreso a la sala de espera
    service_start_time: Optional[float] = None      # Inicio de atención en ventanilla
    service_end_time: Optional[float] = None        # Fin de atención
    server_id: Optional[int] = None                 # Ventanilla que lo atendió (1..S)
    service_duration: float = 0.0                   # Duración efectiva de la atención
    
    # Métricas calculadas
    wait_time_token: float = 0.0             # Tiempo esperando en la fila exterior para ficho
    wait_time_opening: float = 0.0           # Tiempo sentado antes de abrir ventanillas a las 08:00
    wait_time_reception: float = 0.0         # Espera en cola después de abrir ventanillas
    total_time_in_system: float = 0.0        # Tiempo total transcurrido en el sistema
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "category_label": PRIORITY_LABELS.get(self.category, self.category),
            "icon": PRIORITY_ICONS.get(self.category, "👤"),
            "color": PRIORITY_COLORS.get(self.category, "#3b82f6"),
            "is_priority": self.is_priority,
            "arrival_gate_time": round(self.arrival_gate_time, 2),
            "token_assigned_time": round(self.token_assigned_time, 2) if self.token_assigned_time is not None else None,
            "token_number": self.token_number,
            "is_extra_token": self.is_extra_token,
            "token_rejected": self.token_rejected,
            "reception_arrival_time": round(self.reception_arrival_time, 2) if self.reception_arrival_time is not None else None,
            "service_start_time": round(self.service_start_time, 2) if self.service_start_time is not None else None,
            "service_end_time": round(self.service_end_time, 2) if self.service_end_time is not None else None,
            "server_id": self.server_id,
            "service_duration": round(self.service_duration, 2),
            "wait_time_token": round(self.wait_time_token, 2),
            "wait_time_opening": round(self.wait_time_opening, 2),
            "wait_time_reception": round(self.wait_time_reception, 2),
            "total_time_in_system": round(self.total_time_in_system, 2),
        }


def generate_patient(
    patient_id: int,
    arrival_time: float,
    custom_distribution: Optional[Dict[str, float]] = None,
    rng: Optional[random.Random] = None
) -> Patient:
    """
    Genera un paciente.
    - Si custom_distribution es None: SimPy genera aleatoriamente la categoría
      de forma automática en el backend.
    - Si custom_distribution se provee: se muestrea con las probabilidades del usuario (suman 100%).
    """
    r = rng if rng else random
    name = f"{r.choice(NOMBRES)} {r.choice(APELLIDOS)}"
    
    categories = [
        CATEGORY_REGULAR,
        CATEGORY_ADULTO_MAYOR,
        CATEGORY_DISCAPACIDAD,
        CATEGORY_EMBARAZADA,
        CATEGORY_VULNERABLE
    ]
    
    if custom_distribution and len(custom_distribution) == 5:
        # Modo manual con distribución personalizada (suman 100%)
        weights = [
            max(0.0, float(custom_distribution.get(CATEGORY_REGULAR, 70.0))),
            max(0.0, float(custom_distribution.get(CATEGORY_ADULTO_MAYOR, 12.0))),
            max(0.0, float(custom_distribution.get(CATEGORY_DISCAPACIDAD, 8.0))),
            max(0.0, float(custom_distribution.get(CATEGORY_EMBARAZADA, 6.0))),
            max(0.0, float(custom_distribution.get(CATEGORY_VULNERABLE, 4.0))),
        ]
        total_w = sum(weights)
        if total_w <= 0:
            weights = [70.0, 12.0, 8.0, 6.0, 4.0]
        category = r.choices(categories, weights=weights, k=1)[0]
    else:
        # Modo automático estocástico por defecto gestionado por SimPy en el backend
        # ~75% regular, y 25% prioritario distribuido naturalmente
        weights = [75.0, 10.0, 7.5, 5.0, 2.5]
        category = r.choices(categories, weights=weights, k=1)[0]
        
    is_priority = (category != CATEGORY_REGULAR)
    
    return Patient(
        id=patient_id,
        name=name,
        category=category,
        is_priority=is_priority,
        arrival_gate_time=arrival_time
    )

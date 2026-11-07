"""
Servidor Web Flask y API REST para el Simulador 3D de IPS con Modelo de Colas M/M/s.
"""

import io
import csv
import json
from flask import Flask, render_template, request, jsonify, Response, send_file
from flask_cors import CORS

from simulation.sim_engine import IPSSimulation
from simulation.queue_theory import calculate_mms_theory

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

# Cache de última simulación ejecutada
last_simulation_result = None


@app.route("/")
def index():
    """Página principal del simulador 3D interactivo."""
    return render_template("index.html")


@app.route("/api/simulate", methods=["POST"])
def run_simulation_api():
    """
    Endpoint para ejecutar la simulación dinámica de SimPy con los parámetros del usuario.
    """
    global last_simulation_result
    try:
        data = request.get_json() or {}
        
        # 1. MU: Tasa de llegada (pacientes por hora)
        mu_arrival_rate = float(data.get("mu_arrival_rate", data.get("arrival_rate", 30.0)))
        
        # 2. LAMBDA: Tiempo promedio de atención (minutos)
        lambda_service_time = float(data.get("lambda_service_time", data.get("service_mean_minutes", 7.0)))
        
        # 3. S: Ventanillas de recepción
        num_servers = int(data.get("num_servers", 3))
        
        # 4. K: Tickets / fichos base
        base_tokens = int(data.get("base_tokens", 30))
        
        # Total de llegadas
        total_arrivals = int(data.get("total_arrivals", base_tokens + 15))
        
        # Distribución de prioridades (Automático vs Manual)
        custom_priority_enabled = bool(data.get("custom_priority_enabled", False))
        custom_distribution = None
        if custom_priority_enabled:
            custom_distribution = data.get("custom_distribution", {})
            if not isinstance(custom_distribution, dict):
                raise ValueError("La distribución manual de prioridades no es válida.")
            categories = ("REGULAR", "ADULTO_MAYOR", "DISCAPACIDAD", "EMBARAZADA", "VULNERABLE")
            try:
                percentages = [float(custom_distribution.get(category, -1)) for category in categories]
            except (TypeError, ValueError):
                raise ValueError("Cada porcentaje debe ser un número entre 0 y 100.")
            if any(value < 0 or value > 100 for value in percentages):
                raise ValueError("Cada porcentaje debe estar entre 0 y 100.")
            if abs(sum(percentages) - 100) > 0.01:
                raise ValueError("La distribución manual debe sumar exactamente 100%.")
            custom_distribution = dict(zip(categories, percentages))
            
        seed_val = data.get("random_seed")
        random_seed = int(seed_val) if (seed_val is not None and str(seed_val).strip() != "") else None
        
        # Validaciones de seguridad
        mu_arrival_rate = max(1.0, min(mu_arrival_rate, 120.0))
        lambda_service_time = max(1.0, min(lambda_service_time, 30.0))
        num_servers = max(1, min(num_servers, 12))
        base_tokens = max(5, min(base_tokens, 100))
        total_arrivals = max(base_tokens, min(total_arrivals, 250))
        
        # Instanciar y ejecutar el motor SimPy
        sim = IPSSimulation(
            mu_arrival_rate=mu_arrival_rate,
            lambda_service_time=lambda_service_time,
            num_servers=num_servers,
            base_tokens=base_tokens,
            total_arrivals=total_arrivals,
            custom_distribution=custom_distribution,
            random_seed=random_seed
        )
        
        result = sim.run_simulation()
        last_simulation_result = result
        
        return jsonify({
            "status": "success",
            "data": result
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400


@app.route("/api/theory", methods=["POST"])
def get_theory_api():
    """Calcula directamente las fórmulas teóricas de M/M/s para comparación instantánea."""
    try:
        data = request.get_json() or {}
        arrival_rate = float(data.get("arrival_rate", 20.0))
        service_rate = float(data.get("service_rate", 8.0))
        num_servers = int(data.get("num_servers", 3))
        priority_ratio = float(data.get("priority_ratio", 0.25))
        
        theory = calculate_mms_theory(arrival_rate, service_rate, num_servers, priority_ratio)
        return jsonify({"status": "success", "theory": theory})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route("/api/export/csv", methods=["GET"])
def export_csv():
    """Exporta los pacientes de la última simulación a formato CSV descargable."""
    global last_simulation_result
    if not last_simulation_result:
        return jsonify({"error": "No hay datos de simulación previa"}), 404
        
    patients = last_simulation_result.get("patients", [])
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Encabezados
    writer.writerow([
        "ID Paciente", "Nombre", "Categoría", "Es Prioritario",
        "Llegada Puerta (Minutos)", "Ficho Asignado", "Es Ficho Extra", "Rechazado Sin Ficho",
        "Espera Ficho (Min)", "Ingreso Sala (Min)", "Inicio Atención (Min)",
        "Fin Atención (Min)", "Ventanilla", "Duración Servicio (Min)",
        "Espera Recepción (Min)", "Tiempo Total IPS (Min)"
    ])
    
    for p in patients:
        writer.writerow([
            p.get("id"),
            p.get("name"),
            p.get("category_label"),
            "SÍ" if p.get("is_priority") else "NO",
            p.get("arrival_gate_time"),
            p.get("token_number") or "N/A",
            "SÍ" if p.get("is_extra_token") else "NO",
            "SÍ" if p.get("token_rejected") else "NO",
            p.get("wait_time_token"),
            p.get("reception_arrival_time") or "N/A",
            p.get("service_start_time") or "N/A",
            p.get("service_end_time") or "N/A",
            p.get("server_id") or "N/A",
            p.get("service_duration"),
            p.get("wait_time_reception"),
            p.get("total_time_in_system")
        ])
        
    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=ips_simulacion_pacientes.csv"}
    )


@app.route("/api/export/json", methods=["GET"])
def export_json():
    """Descarga los resultados completos en formato JSON."""
    global last_simulation_result
    if not last_simulation_result:
        return jsonify({"error": "No hay datos de simulación previa"}), 404
    return jsonify(last_simulation_result)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

# Simulador 3D para IPS - Simulación de eventos discretos con prioridad y tickets
### IPS Viva Salud Integral

Un simulador interactivo en 3D para la gestión de colas en una **Institución Prestadora de Salud (IPS)**, desarrollado con **Python**, el motor de eventos discretos **SimPy**, y una interfaz web 3D interactiva construida con **Three.js** y **Chart.js**.

## Clasificación del modelo implementado

El flujo de atención **no es un M/M/s/K clásico**. SimPy genera llegadas con intervalos exponenciales y duraciones de servicio exponenciales, con `s` ventanillas y prioridad no apropiativa. La admisión es finita por una cuota de `K` tickets base; después se rechazan los regulares y se permiten tickets extra para prioridades. Además, se simula una jornada finita y no un régimen estacionario. Por estas reglas, la clasificación más precisa es una simulación de eventos discretos con capacidad de admisión limitada, prioridades y excepciones.

Los parámetros de entrada son `lambda` (tasa media de llegada por hora) y `mu` (tiempo medio de atención en minutos). SimPy genera un número aleatorio de llegadas exponenciales en la ventana 05:00-07:00; no se configura una cantidad de personas. Para la referencia teórica M/M/s, la tasa de servicio convencional se calcula como `60 / mu`. Erlang-C se conserva solo como referencia estacionaria aproximada; no modela directamente K ni las excepciones prioritarias.

---

## 📋 Declaración de Origen de Datos y Justificación de Parámetros

### 1. Origen de los Datos
- **Naturaleza:** **Datos Simulados Estocásticamente**.
- **Generación:** Los datos se producen mediante procesos de eventos discretos de **SimPy** y muestreo aleatorio en Python, siguiendo las distribuciones de la Teoría de Colas de Kendall:
  - Llegadas de pacientes: Proceso estocástico de **Poisson** con tiempos entre arribos exponenciales con media $1/\lambda$.
  - Tiempos de atención en ventanilla: Distribución **Exponencial** con media igual al parámetro $\mu$ en minutos por ventanilla.
- **Calibración:** Los parámetros base del modelo fueron calibrados a partir de los tiempos de referencia observados en centros de atención primaria del Sistema General de Seguridad Social en Salud de Colombia (SGSSS), alineados con la **Resolución 5596 de 2015 del Ministerio de Salud y Protección Social** (criterios de triage y atención preferente) y la **Ley Estatutaria de Salud (Ley 1751 de 2015)**.

### 2. Justificación de los Parámetros del Modelo Matemático
| Parámetro | Valor Base | Justificación Operativa y Sanitaria |
|---|---|---|
| **Ventanillas ($s$)** | $3$ servidores | Capacidad instalada estándar de módulos de recepción/facturación para una IPS de primer o segundo nivel, asegurando que la intensidad de tráfico $\rho = \frac{\lambda}{s\mu} < 1$ para evitar colapso del sistema. |
| **Fichos Base a las 6:00 AM** | $30$ fichos | Representa la oferta diaria matutina de citas de consulta médica general disponibles para asignación presencial en el primer turno del día. |
| **Tasa de Llegada ($\lambda$)** | $30$ pac/hora ($60/\lambda = 2.0$ min entre llegadas, en promedio) | Modela las llegadas aleatorias entre 05:00 AM y 07:00 AM para asegurar cupo. |
| **Tiempo Medio de Atención ($\mu$ de entrada)** | $7.0$ minutos | Tiempo de ciclo promedio en ventanilla: validación de derechos en BDUA/ADRES, recaudación de copago o cuota moderadora, radicación y emisión de volante. La tasa teórica correspondiente es $60/7$ atenciones/hora. |
| **Población Prioritaria** | $25\%$ de la demanda | Refleja la proporción de adultos mayores (60+), personas en situación de discapacidad, mujeres gestantes y personas vulnerables en el régimen subsidiado y contributivo. |
| **Excepción de Fichos Extras** | Dinámica | Garantiza el mandato constitucional de no discriminación y eliminación de barreras administrativas: ante el arribo de un paciente discapacitado o vulnerable con fichos agotados, la IPS no rechaza al usuario ni despoja a los ya asignados, sino que genera un **Ficho Extra (#31+)**. |

---

## 🎯 Reglas de Negocio de la IPS

1. **Fase 1: Reparto de Fichos en Entrada Exterior (05:00 AM - 06:00 AM)**
   - Las personas llegan desde temprano a hacer fila para obtener uno de los **30 fichos base** disponibles para el día.
   - A las **06:00 AM** inicia formalmente la entrega de los fichos por parte del personal de seguridad / admisiones.
2. **Preferencia y Adelanto de Fila (Prioridad Humanitaria)**:
   - Si llega un paciente prioritario (Adulto Mayor, Discapacidad, Embarazada o Vulnerable), **pasa automáticamente a la primera fila**, ubicándose delante de los pacientes regulares antes de que se agoten los cupos.
3. **Regla de Excepción de Fichos Extras**:
   - Si se reparten los 30 fichos y se agotan, a los pacientes regulares posteriores se les informa que los cupos terminaron.
   - **Si llega una persona con discapacidad o prioridad después de agotados los 30 fichos, se aplica la excepción humanitaria**: **no se le quita ningún ficho a nadie**, sino que **se le genera un Ficho Extra (#31, #32, etc.)** y pasa a recepción.
4. **Fase 2: Recepción y Atención en Ventanillas (08:00 AM en adelante)**
   - A las **08:00 AM** se abren las puertas de la sala de recepción.
   - Los pacientes con ficho ingresan a la sala de espera.
   - Modelo **$M/M/s$**: Existen $s$ ventanillas de recepción paralelas gestionadas con `simpy.PriorityResource`.
   - Cuando una ventanilla queda libre, se atiende con preferencia inmediata a los pacientes prioritarios frente a los regulares.

---

## 📐 Fundamento Matemático: Modelo de Colas $M/M/s$ con Prioridades

### 1. Factor de Utilización del Sistema
$$\rho = \frac{\lambda}{s \cdot \mu} \quad (\text{Estable si } \rho < 1)$$

### 2. Probabilidad de Sistema Vacío ($P_0$)
$$P_0 = \left[ \sum_{n=0}^{s-1} \frac{(s\rho)^n}{n!} + \frac{(s\rho)^s}{s!(1-\rho)} \right]^{-1}$$

### 3. Fórmula de Erlang-C (Probabilidad de Esperar en Cola)
$$C(s, \lambda/\mu) = P(\text{Espera} > 0) = \frac{\frac{(\lambda/\mu)^s}{s!(1-\rho)}}{\sum_{n=0}^{s-1} \frac{(\lambda/\mu)^n}{n!} + \frac{(\lambda/\mu)^s}{s!(1-\rho)}} = \frac{(\lambda/\mu)^s P_0}{s!(1-\rho)}$$

### 4. Modelo de Prioridades de Cobham (No Apropiativo)
Para la clase prioritaria (Clase 1) y regular (Clase 2), con tasas $\lambda_1$ y $\lambda_2$ ($\lambda = \lambda_1 + \lambda_2$):
- **Tiempo de espera en cola para prioritarios ($W_{q,1}$)**:
  $$W_{q,1} = \frac{W_0}{1 - \rho_1} \quad \text{donde } W_0 = \frac{C(s, \lambda/\mu)}{s\mu}, \quad \rho_1 = \frac{\lambda_1}{s\mu}$$
- **Tiempo de espera en cola para regulares ($W_{q,2}$)**:
  $$W_{q,2} = \frac{W_0}{(1 - \rho_1)(1 - \rho)}$$

---

## 🎮 Controles y Navegación del Simulador

- **Navegación del Mouse**:
  - **Rotar vista:** Clic izquierdo y arrastrar (en modo rotación).
  - **Moverse arriba, abajo y a los lados (Pan):** Clic derecho y arrastrar, o activar el botón **[✋ Mover (Pan)]** en la barra superior para mover con clic izquierdo.
  - **Zoom:** Rueda del mouse.
  - **Botones direccionales:** Flechas `▲`, `▼`, `◄`, `►` en la barra central o teclas `W`, `A`, `S`, `D`.
- **Apertura de Paneles Laterales**:
  - Botones flotantes en los bordes: **[⚙ Parámetros]** (borde izquierdo) y **[📟 Turnero & KPIs]** (borde derecho) para abrir o cerrar las ventanas cuando lo desees.
- **Entrada Numérica Directa**:
  - Parámetros ingresados numéricamente con botones de paso `+` / `−` y teclado directo.
  - Botones de **Carga Rápida de Escenarios** (Base, Alta Capacidad, Contingencia).

---

## 🚀 Instalación y Ejecución

```bash
./run.sh
```

Abre en tu navegador:
👉 **`http://127.0.0.1:5000`**

GUÍA TÉCNICA MINIMALISTA — IMPLEMENTACIÓN DE LA APP
1. Estructura del proyecto
Crear carpeta raíz del proyecto.

Añadir archivos:

index.html

app.js

styles.css (opcional)

Crear carpeta storage/ para sesiones.

2. index.html
Añadir botones: iniciar, detener, exportar.

Añadir contenedores <canvas> para gráficas.

Añadir contenedor para indicadores numéricos.

Incluir app.js al final del <body>.

3. Permisos de sensores
Detectar iOS.

Solicitar permisos:

DeviceOrientationEvent.requestPermission()

DeviceMotionEvent.requestPermission()

Mostrar botón “Activar sensores” si es necesario.

4. Captura de datos
Crear arrays para muestras.

Registrar eventos:

deviceorientation → alpha, beta, gamma

devicemotion → acceleration, rotationRate

Guardar cada muestra con performance.now().

Limitar frecuencia de muestreo si es necesario.

5. Almacenamiento temporal
Guardar muestras en un array en memoria.

Al finalizar sesión:

Guardar en IndexedDB

o exportar CSV/JSON

Estructura de cada muestra:
{t, alpha, beta, gamma, accX, accY, accZ, rotA, rotB, rotG}.

6. Filtrado de señal
Implementar filtro paso alto (eliminar movimientos lentos).

Implementar filtro paso bajo (suavizar ruido).

Procesar en ventanas de 2–5 segundos.

Generar señal filtrada por eje.

7. Análisis
Calcular RMS por eje.

Calcular FFT por eje.

Identificar frecuencia dominante (pico del espectro).

Calcular energía total.

Determinar eje dominante.

Guardar resultados en objeto analisis.

8. Visualización
Usar Chart.js o Canvas nativo.

Gráficas necesarias:

Señal cruda por eje

Señal filtrada

FFT

Comparación entre sesiones

Mostrar indicadores numéricos:

Frecuencia dominante

RMS

Eje dominante

Energía total

Variabilidad temporal

9. Exportación
A) Visual en pantalla
Panel con gráficas.

Panel con métricas.

Comparación entre sesiones.

B) PDF
Usar jsPDF o pdf-lib.

Incluir:

Portada

Resumen ejecutivo

Gráficas incrustadas

Interpretación automática

Anexos opcionales

C) CSV / JSON
CSV → todas las muestras.

JSON → muestras + análisis + metadatos.

10. Historial de sesiones (opcional)
Guardar sesiones en IndexedDB.

Mostrar lista de sesiones.

Añadir mini‑gráficas tipo sparkline.

Comparación longitudinal automática.

11. PWA (opcional)
Crear manifest.json.

Crear service-worker.js.

Activar instalación en móvil.

Permitir uso offline.

12. Notas técnicas
alpha, beta, gamma → orientación.

acceleration y rotationRate → mejor para temblor fino.

Temblor fisiológico: 4–12 Hz.

rotationRate.beta suele ser el eje más sensible.

13. Resultado esperado
App web accesible desde móvil (HTTPS).

Captura de movimiento en tiempo real.

Filtrado y análisis del temblor.

Gráficas claras y exportables.

Comparación entre sesiones.

PDF profesional con resultados.
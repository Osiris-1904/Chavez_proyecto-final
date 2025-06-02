document.addEventListener('DOMContentLoaded', function() {
    // Función para verificar pacientes críticos
    function verificarPacientesCriticos() {
        fetch('/api/pacientes-criticos')
            .then(response => response.json())
            .then(data => {
                if (data.length > 0) {
                    mostrarAlertas(data);
                    actualizarBadge(data.length);
                } else {
                    document.getElementById('alertas-badge').textContent = '';
                }
            })
            .catch(error => console.error('Error al obtener pacientes críticos:', error));
    }

    // Función para mostrar alertas
    function mostrarAlertas(pacientes) {
        const alertasContainer = document.getElementById('alertas-container');
        if (!alertasContainer) return;

        alertasContainer.innerHTML = ''; // Limpiar alertas anteriores

        pacientes.forEach(paciente => {
            const alerta = document.createElement('div');
            alerta.className = 'alerta-critica';
            
            // Determinar el tipo de alerta
            let tipoAlerta = '';
            let motivo = [];
            
            if (paciente.frecuencia_cardiaca > 100) {
                tipoAlerta = 'TAQUICARDIA';
                motivo.push(`Frecuencia cardíaca alta: ${paciente.frecuencia_cardiaca} bpm`);
                alerta.classList.add('alerta-roja');
            } else if (paciente.frecuencia_cardiaca < 60) {
                tipoAlerta = 'BRADICARDIA';
                motivo.push(`Frecuencia cardíaca baja: ${paciente.frecuencia_cardiaca} bpm`);
                alerta.classList.add('alerta-azul');
            }
            
            // Verificar presión arterial (formato "120/80")
            if (paciente.presion_arterial) {
                const [sistolica, diastolica] = paciente.presion_arterial.split('/').map(Number);
                if (sistolica > 140 || diastolica > 90) {
                    tipoAlerta = tipoAlerta || 'HIPERTENSIÓN';
                    motivo.push(`Presión arterial alta: ${paciente.presion_arterial} mmHg`);
                    if (!alerta.classList.contains('alerta-roja')) {
                        alerta.classList.add('alerta-naranja');
                    }
                }
            }
            
            // Verificar temperatura
            if (paciente.temperatura > 37.5) {
                tipoAlerta = tipoAlerta || 'FIEBRE';
                motivo.push(`Temperatura elevada: ${paciente.temperatura} °C`);
                if (!alerta.classList.contains('alerta-roja') && !alerta.classList.contains('alerta-naranja')) {
                    alerta.classList.add('alerta-amarilla');
                }
            }

            alerta.innerHTML = `
                <h3>ALERTA: ${tipoAlerta}</h3>
                <p><strong>Paciente:</strong> ${paciente.nombre}</p>
                <p><strong>Edad:</strong> ${paciente.edad}</p>
                <p><strong>Motivo:</strong> ${motivo.join(' | ')}</p>
                <button onclick="agendarCitaUrgente(${paciente.id})">Agendar Cita Urgente</button>
            `;
            
            alertasContainer.appendChild(alerta);
        });
    }

    // Función para actualizar el badge de alertas en el navbar
    function actualizarBadge(count) {
        const badge = document.getElementById('alertas-badge');
        if (badge) {
            badge.textContent = count > 0 ? count : '';
            if (count > 0) {
                badge.classList.add('badge-active');
            } else {
                badge.classList.remove('badge-active');
            }
        }
    }

    // Función para agendar cita urgente
    window.agendarCitaUrgente = function(pacienteId) {
        window.location.href = `/agendar-cita?paciente_id=${pacienteId}&urgente=1`;
    }

    // Verificar pacientes críticos cada 30 segundos
    verificarPacientesCriticos();
    setInterval(verificarPacientesCriticos, 30000);
});

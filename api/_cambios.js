// Cambios de datos preparados por Claude. La propietaria los ve al entrar al panel
// y decide uno a uno si los aplica o los descarta. Solo se sirven con sesión (api/cambios.js).
//
// Cada cambio: { id: 'AAAA-MM-DD-n', fecha: 'AAAA-MM-DD', resumen: 'texto corto', ops: [ ... ] }
// Operaciones disponibles (se aplican en el orden escrito):
//   { tipo: 'habitacion', num: 6, set: { precio: 310, nombre: '…', activa: true, gastos: 60, m2: 6.87, cama: '110', descripcion: '…' } }
//   { tipo: 'intervalo', num: 1, accion: 'añadir', desde: 'AAAA-MM-DD', hasta: 'AAAA-MM-DD', estado: 'ocupada' | 'libre' }
//   { tipo: 'intervalo', num: 1, accion: 'quitar', desde: 'AAAA-MM-DD', hasta: 'AAAA-MM-DD', estado: 'ocupada' | 'libre' }
//   { tipo: 'inquilina', nombre: 'Laura', apellidos: '…', telefono: '…', … }   (crea o actualiza por nombre + apellidos)
//   { tipo: 'contrato', inquilina: 'Laura Pérez', num: 4, desde, hasta, precio?, gastos?, fianza?, diaPago?, fianzaEstado? }
//   { tipo: 'fin-contrato', inquilina: 'Laura Pérez', num: 4, hasta: 'AAAA-MM-DD' }   (cambia la fecha de salida)
//   { tipo: 'cobro-pagado', inquilina: 'Laura Pérez', concepto: 'Mensualidad octubre 2026', fecha: 'AAAA-MM-DD', metodo: 'Bizum' }
//   { tipo: 'incidencia', titulo: '…', num: 4 | 'comun', detalle?, estado?, coste?, fecha? }
//   { tipo: 'ajustes', set: { cursos: [2027, 2028], entrarYa: true } }
export default [];

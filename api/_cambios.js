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
export default [
  {
    id: '2026-09-25-1',
    fecha: '2026-09-25',
    resumen: 'Alta de las 7 inquilinas actuales (datos personales)',
    ops: [
      {
        "tipo": "inquilina",
        "nombre": "Maria Kristina",
        "apellidos": "Alvarado Estrada",
        "doc": "F8687925",
        "universidad": "Universidad Loyola Andalucía",
        "telefono": "+502 41861022",
        "email": "mariakristinaalvarado@gmail.com",
        "nacionalidad": "Guatemala"
      },
      {
        "tipo": "inquilina",
        "nombre": "Melania",
        "apellidos": "Pegoraro",
        "doc": "YC6814634 / Y1362970G",
        "universidad": "Universidad Loyola Andalucía",
        "telefono": "645 70 20 37",
        "email": "Pegoraroalvaromelania@gmail.com"
      },
      {
        "tipo": "inquilina",
        "nombre": "Nuria Gema",
        "apellidos": "Segura Ortega",
        "doc": "18514152A",
        "universidad": "Universidad Loyola Andalucía",
        "telefono": "653 50 53 57",
        "email": "stranuria@gmail.com"
      },
      {
        "tipo": "inquilina",
        "nombre": "Fabiola Rocio",
        "apellidos": "Ferrera Cerpa",
        "doc": "29623334R",
        "universidad": "Otra",
        "telefono": "640 38 25 69",
        "email": "fabiolaferreracerpa2406@gmail.com",
        "estudios": "Arduan Formación"
      },
      {
        "tipo": "inquilina",
        "nombre": "Lhaura Sophia",
        "apellidos": "Silva Torino",
        "doc": "79110119D",
        "universidad": "Universidad Pablo de Olavide",
        "telefono": "+34 644 19 94 29",
        "email": "Lhaurasophia@gmail.com"
      },
      {
        "tipo": "inquilina",
        "nombre": "Cecilia Leonor",
        "apellidos": "Jimenez Miralles",
        "doc": "46068803X",
        "universidad": "Universidad Loyola Andalucía",
        "telefono": "635 08 69 51",
        "email": "ceimecs@gmail.com"
      },
      {
        "tipo": "inquilina",
        "nombre": "Angela",
        "apellidos": "Mateo Nieto",
        "doc": "29584968E",
        "universidad": "Universidad Loyola Andalucía"
      }
    ]
  }
];

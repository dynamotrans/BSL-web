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
  },
  {
    "id": "2026-09-25-2",
    "fecha": "2026-09-25",
    "resumen": "Contratos del curso 2026/27 de las 7 inquilinas (Girasol queda libre)",
    "ops": [
      {
        "tipo": "inquilina",
        "nombre": "Melania",
        "apellidos": "Pegoraro",
        "direccion": "Santa Cruz de Tenerife"
      },
      {
        "tipo": "inquilina",
        "nombre": "Lhaura Sophia",
        "apellidos": "Silva Torino",
        "direccion": "Fuengirola (Málaga)"
      },
      {
        "tipo": "inquilina",
        "nombre": "Cecilia Leonor",
        "apellidos": "Jimenez Miralles",
        "direccion": "Montilla (Córdoba)"
      },
      {
        "tipo": "inquilina",
        "nombre": "Nuria Gema",
        "apellidos": "Segura Ortega",
        "direccion": "Linares (Jaén)"
      },
      {
        "tipo": "inquilina",
        "nombre": "Fabiola Rocio",
        "apellidos": "Ferrera Cerpa",
        "direccion": "Huelva"
      },
      {
        "tipo": "inquilina",
        "nombre": "Maria Kristina",
        "apellidos": "Alvarado Estrada",
        "direccion": "Guatemala"
      },
      {
        "tipo": "inquilina",
        "nombre": "Angela",
        "apellidos": "Mateo Nieto",
        "direccion": "Constantina (Sevilla)"
      },
      {
        "tipo": "contrato",
        "inquilina": "Melania Pegoraro",
        "num": 1,
        "desde": "2026-09-01",
        "hasta": "2027-07-31",
        "precio": 330,
        "gastos": 60,
        "fianza": 300,
        "diaPago": 5
      },
      {
        "tipo": "contrato",
        "inquilina": "Lhaura Sophia Silva Torino",
        "num": 2,
        "desde": "2026-09-01",
        "hasta": "2027-07-31",
        "precio": 330,
        "gastos": 60,
        "fianza": 300,
        "diaPago": 5
      },
      {
        "tipo": "contrato",
        "inquilina": "Cecilia Leonor Jimenez Miralles",
        "num": 3,
        "desde": "2026-09-01",
        "hasta": "2027-07-31",
        "precio": 320,
        "gastos": 60,
        "fianza": 300,
        "diaPago": 5
      },
      {
        "tipo": "contrato",
        "inquilina": "Nuria Gema Segura Ortega",
        "num": 4,
        "desde": "2026-09-01",
        "hasta": "2027-07-31",
        "precio": 320,
        "gastos": 60,
        "fianza": 300,
        "diaPago": 5
      },
      {
        "tipo": "contrato",
        "inquilina": "Fabiola Rocio Ferrera Cerpa",
        "num": 5,
        "desde": "2026-09-01",
        "hasta": "2027-07-31",
        "precio": 330,
        "gastos": 60,
        "fianza": 300,
        "diaPago": 5
      },
      {
        "tipo": "contrato",
        "inquilina": "Maria Kristina Alvarado Estrada",
        "num": 6,
        "desde": "2026-09-01",
        "hasta": "2027-07-31",
        "precio": 300,
        "gastos": 60,
        "fianza": 300,
        "diaPago": 5
      },
      {
        "tipo": "contrato",
        "inquilina": "Angela Mateo Nieto",
        "num": 8,
        "desde": "2026-10-01",
        "hasta": "2027-07-31",
        "precio": 330,
        "gastos": 60,
        "fianza": 330,
        "diaPago": 5
      }
    ]
  },
  {
    "id": "2026-09-25-3",
    "fecha": "2026-09-25",
    "resumen": "Quitar las fechas de prueba de Azahar (Nº 1)",
    "ops": [
      {
        "tipo": "intervalo",
        "num": 1,
        "accion": "quitar",
        "desde": "2027-09-25",
        "hasta": "2028-06-25",
        "estado": "ocupada"
      },
      {
        "tipo": "intervalo",
        "num": 1,
        "accion": "quitar",
        "desde": "2028-09-01",
        "hasta": "2029-07-31",
        "estado": "libre"
      },
      {
        "tipo": "intervalo",
        "num": 1,
        "accion": "quitar",
        "desde": "2028-09-01",
        "hasta": "2029-07-31",
        "estado": "ocupada"
      }
    ]
  },
  {
    "id": "2026-09-25-4",
    "fecha": "2026-09-25",
    "resumen": "(Opcional) Marcar como cobradas la fianza de las 7 y la mensualidad de septiembre de las 6 que entraron el 1 sep. Aplica solo si ya las cobraste; si no, Descartar",
    "ops": [
      {
        "tipo": "cobro-pagado",
        "inquilina": "Melania Pegoraro",
        "concepto": "Mensualidad septiembre 2026",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Melania Pegoraro",
        "concepto": "Fianza",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Lhaura Sophia Silva Torino",
        "concepto": "Mensualidad septiembre 2026",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Lhaura Sophia Silva Torino",
        "concepto": "Fianza",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Cecilia Leonor Jimenez Miralles",
        "concepto": "Mensualidad septiembre 2026",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Cecilia Leonor Jimenez Miralles",
        "concepto": "Fianza",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Nuria Gema Segura Ortega",
        "concepto": "Mensualidad septiembre 2026",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Nuria Gema Segura Ortega",
        "concepto": "Fianza",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Fabiola Rocio Ferrera Cerpa",
        "concepto": "Mensualidad septiembre 2026",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Fabiola Rocio Ferrera Cerpa",
        "concepto": "Fianza",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Maria Kristina Alvarado Estrada",
        "concepto": "Mensualidad septiembre 2026",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Maria Kristina Alvarado Estrada",
        "concepto": "Fianza",
        "fecha": "2026-09-01",
        "metodo": "Otro"
      },
      {
        "tipo": "cobro-pagado",
        "inquilina": "Angela Mateo Nieto",
        "concepto": "Fianza",
        "fecha": "2026-09-25",
        "metodo": "Otro"
      }
    ]
  }
];
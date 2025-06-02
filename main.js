const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
require('dotenv').config();

// Configurar conexión a MySQL
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});
connection.connect(err => {
  if (err) {
    console.error('Error conectando a MySQL:', err);
    return;
  }
  console.log('Conexión exitosa a MySQL');
});

// Configuración de la sesión
app.use(session({
  secret: 'secretKey',
  resave: false,
  saveUninitialized: false,
}));

// Procesamiento de datos y archivos estáticos
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Configurar EJS
app.set('view engine', 'ejs');
app.set('views', './views');

// Configuración de Multer para subir archivos Excel
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Mantener el nombre original
    }
});

const fileFilter = (req, file, cb) => {
    // Lista de mimetypes permitidos (Excel, PDF, imágenes comunes)
    const allowedMimetypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/pdf', // PDF
        'image/jpeg',      // JPEG
        'image/png',       // PNG
        'image/gif',       // GIF
        'text/csv',        // CSV (opcional)
        'application/vnd.ms-excel' // .xls (Excel antiguo, opcional)
    ];

    if (allowedMimetypes.includes(file.mimetype)) {
        cb(null, true); // Aceptar el archivo
    } else {
        cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls), PDF, imágenes (JPEG, PNG, GIF) o CSV'), false); // Rechazar el archivo
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter
});



// Menue de navegacion
app.get('/menu', (req, res) => {
    let menuItems = [
        { nombre: 'Inicio', url: '/index.html' }
    ];

    if (req.session.user) {
        if (req.session.user.tipo_usuario === 'admin') {
            menuItems.push(
                { nombre: 'Actualizar Médicos', url: '/asignar-especialidad' },
                { nombre: 'Alertas', url: '/alertas.html' },
                { nombre: 'Búsqueda Avanzada', url: '/busqueda.html' },
                { nombre: 'Calendario', url: '/calendario.html' },
                { nombre: 'Documentos', url: '/subir-pdf.html' },
                { nombre: 'Gestionar Registros', url: '/gestionar-registros' },
                { nombre: 'Listas', url: '/ver-excels' },
                { nombre: 'Registrar Pacientes', url: '/registrar-paciente' },
                { nombre: 'Ver y Gestionar Pacientes', url: '/pacientes' },
                { nombre: 'Ver Usuarios', url: '/ver-usuarios' }
            );
        } else if (req.session.user.tipo_usuario === 'medico') {
            menuItems.push(
                { nombre: 'Alertas', url: '/alertas.html' },
                { nombre: 'Búsqueda Avanzada', url: '/busqueda.html' },
                { nombre: 'Calendario', url: '/calendario.html' },
                { nombre: 'Documentos', url: '/subir-pdf.html' },
                { nombre: 'Listas', url: '/ver-excels' },
                { nombre: 'Mensajería', url: '/mensajes.html' },
                { nombre: 'Mis Datos', url: '/ver-mis-datos' },
                { nombre: 'Registrar Pacientes', url: '/registrar-paciente' },
                { nombre: 'Ver y Gestionar Pacientes', url: '/pacientes' }
            );
        } else if (req.session.user.tipo_usuario === 'paciente') {
            menuItems.push(
                { nombre: 'Mis Datos', url: '/ver-mis-datos' },
                { nombre: 'Mensajería', url: '/mensajes.html' },
                { nombre: 'Calendario', url: '/calendario.html' }
            );
        }
    }

    menuItems.push({ nombre: 'Cerrar Sesión', url: '/logout' });

    res.json(menuItems);
});

// Middleware para proteger ruta
function requireLogin(req, res, next) {
  if (!req.session.user || !req.session.user.id) {
    return res.redirect('/login.html');
  }
  next();
}

// Middleware para roles
function requireRole(...roles) {
  return (req, res, next) => {
      if (req.session.user && roles.includes(req.session.user.tipo_usuario)) {
          next();
      } else {
          res.status(403).send('Acceso denegado');
      }
  };
}

// Registro de usuario
app.post('/registrar', async (req, res) => {
  const { nombre_usuario, password, codigo_acceso } = req.body;
  let tipo_usuario = '';

  if (codigo_acceso === '1') tipo_usuario = 'admin';
  else if (codigo_acceso === '2') tipo_usuario = 'medico';
  else if (codigo_acceso === '3') tipo_usuario = 'paciente';
  else return res.send('Código de acceso no válido');

  const hashedPassword = bcrypt.hashSync(password, 10);

  const insertUser = 'INSERT INTO usuarios (nombre_usuario, password_hash, tipo_usuario) VALUES (?, ?, ?)';
  connection.query(insertUser, [nombre_usuario, hashedPassword, tipo_usuario], (err, results) => {
    if (err) return res.send('Error al registrar usuario');
    
    const newUserId = results.insertId;
    
    if (tipo_usuario === 'medico') {
      const insertMedico = 'INSERT INTO medicos (nombre, user_id) VALUES (?, ?)';
      connection.query(insertMedico, [nombre_usuario, newUserId], (err) => {
        if (err) console.error('Error al crear médico asociado:', err);
      });
    }
    else if (tipo_usuario === 'paciente') {
      const insertPaciente = 'INSERT INTO pacientes (nombre, user_id) VALUES (?, ?)';
      connection.query(insertPaciente, [nombre_usuario, newUserId], (err) => {
        if (err) console.error('Error al crear paciente asociado:', err);
      });
    }
    
    res.redirect('/login.html');
  });
});

// Iniciar sesión
app.post('/login', (req, res) => {
  const { nombre_usuario, password } = req.body;

  connection.query('SELECT * FROM usuarios WHERE nombre_usuario = ?', 
    [nombre_usuario], async (err, results) => {
    if (err || results.length === 0) {
      return res.sendFile(__dirname + '/public/usuario.html');
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (match) {  
      req.session.user = {
        id: user.id,
        nombre_usuario: user.nombre_usuario,
        tipo_usuario: user.tipo_usuario
      };
    
      res.redirect('/');
    } else {
      return res.sendFile(__dirname + '/public/error.html');
    }
  });
});

// Cerrar sesión
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login.html');
});

// Página principal después de iniciar sesión
app.get('/', requireLogin, (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Ruta para obtener el tipo de usuario actual
app.get('/tipo-usuario', requireLogin, (req, res) => {
  res.json({ tipo_usuario: req.session.user.tipo_usuario });
});

// Ruta para insertar un nuevo médico
app.post('/insertar-medico', requireLogin, requireRole('admin'), (req, res) => {
  const { medico_name, especialidad } = req.body;
  const user_id = req.session.user.id;

  if (!medico_name || !especialidad) {
    return res.status(400).send('Por favor completa todos los campos');
  }

  const checkQuery = 'SELECT id FROM medicos WHERE user_id = ?';
  
  connection.query(checkQuery, [user_id], (err, results) => {
    if (err) {
      console.error('Error al verificar médico:', err);
      return res.status(500).send('Error al verificar médico existente');
    }

    if (results.length > 0) {
      const updateQuery = 'UPDATE medicos SET especialidad = ? WHERE user_id = ?';
      connection.query(updateQuery, [especialidad, user_id], (err) => {
        if (err) {
          console.error('Error al actualizar médico:', err);
          return res.status(500).send('Error al actualizar médico');
        }
        res.redirect('/medicos');
      });
    } else {
      const getUsernameQuery = 'SELECT nombre_usuario FROM usuarios WHERE id = ?';
      connection.query(getUsernameQuery, [user_id], (err, userResults) => {
        if (err || userResults.length === 0) {
          return res.status(500).send('Error al obtener datos del usuario');
        }

        const nombreUsuario = userResults[0].nombre_usuario;
        const insertQuery = 'INSERT INTO medicos (nombre, especialidad, user_id) VALUES (?, ?, ?)';
        
        connection.query(insertQuery, [nombreUsuario, especialidad, user_id], (err) => {
          if (err) {
            console.error('Error al insertar médico:', err);
            return res.status(500).send('Error al guardar el médico');
          }
          res.redirect('/medicos');
        });
      });
    }
  });
});

// Ruta para mostrar el formulario de asignación de especialidad
app.get('/asignar-especialidad', requireLogin, requireRole('admin'), (req, res) => {
    const queryMedicos = 'SELECT id, nombre, especialidad FROM medicos ORDER BY nombre ASC';
    
    connection.query(queryMedicos, (err, medicos) => {
        if (err) {
            console.error('Error al obtener médicos para asignar especialidad:', err);
            return res.status(500).send('Error al cargar la lista de médicos para asignación.');
        }
        res.render('asignar_especialidad', { medicos: medicos });
    });
});

// Ruta para que el admin actualice la especialidad
app.post('/asignar-especialidad', requireLogin, requireRole('admin'), (req, res) => {
    const { medico_id, especialidad } = req.body;

    if (!medico_id || !especialidad) {
        return res.status(400).send('Por favor, selecciona un médico y una especialidad válida.');
    }

    const updateQuery = `UPDATE medicos SET especialidad = ? WHERE id = ?`;
    
    connection.query(updateQuery, [especialidad, medico_id], (err, result) => {
        if (err) {
            console.error('Error al actualizar la especialidad del médico:', err);
            return res.status(500).send('Error interno del servidor al actualizar la especialidad.');
        }

        if (result.affectedRows === 0) {
            return res.status(404).send('Médico no encontrado o la especialidad ya era la misma.');
        }

        res.send(`
            <html>
            <head>
                <link rel="stylesheet" href="styles.css">
                <title>Actualización Exitosa</title>
            </head>
            <body>
                <div class="registro-pm">
                    <h2>Especialidad Actualizada</h2>
                    <p>La especialidad del médico (ID: ${medico_id}) ha sido actualizada a: <strong>${especialidad}</strong>.</p>
                    <a href="/asignar-especialidad" class="boton-registro">Volver a Asignar Especialidad</a>
                    <a href="/medicos" class="boton-registro">Ver Todos los Médicos</a>
                </div>
            </body> 
            </html>
        `);
    });
});

// Rutas para mostrar los médicos
app.get('/medicos', requireLogin, requireRole('admin'), (req, res) => {
  connection.query('SELECT * FROM medicos', (err, results) => {
    if (err) {
      return res.redirect('/error.html');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Medicos</title>
      </head>
      <body>
        <h1>Medicos Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Especialidad</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(medico => {
      html += `
        <tr>
          <td>${medico.nombre}</td>
          <td>${medico.especialidad}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para buscar pacientes según filtros
app.get('/buscar-pacientes', requireLogin, requireRole('admin', 'medico'),(req, res) => {
  const { name_search, age_search } = req.query;
  let query = 'SELECT * FROM pacientes WHERE 1=1';

  if (name_search) {
    query += ` AND nombre LIKE '%${name_search}%'`;
  }
  if (age_search) {
    query += ` AND edad = ${age_search}`;
  }

  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Resultados de Búsqueda</title>
      </head>
      <body>
        <h1>Resultados de Búsqueda</h1>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Edad</th>
              <th>Frecuencia Cardiaca (bpm)</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(paciente => {
      html += `
        <tr>
          <td>${paciente.nombre}</td>
          <td>${paciente.edad}</td>
          <td>${paciente.frecuencia_cardiaca}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para ordenar pacientes por frecuencia cardiaca
app.get('/ordenar-pacientes', requireLogin, requireRole('admin', 'medico'), (req, res) => {
  const query = 'SELECT * FROM pacientes ORDER BY frecuencia_cardiaca DESC';

  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes Ordenados</title>
      </head>
      <body>
        <h1>Pacientes Ordenados por Frecuencia Cardiaca</h1>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Edad</th>
              <th>Frecuencia Cardiaca (bpm)</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(paciente => {
      html += `
        <tr>
          <td>${paciente.nombre}</td>
          <td>${paciente.edad}</td>
          <td>${paciente.frecuencia_cardiaca}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para buscar medicos según filtros
app.get('/buscar-medicos', requireLogin, requireRole('admin'),(req, res) => {
  const { name_search, especialidad_search } = req.query;
  let query = 'SELECT * FROM medicos WHERE 1=1';

  if (name_search) {
    query += ` AND nombre LIKE '%${name_search}%'`;
  }
  if (especialidad_search) {
    query += ` AND especialidad = ${especialidad_search}`;
  }

  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
      <title>Medicos</title>
    </head>
    <body>
      <h1>Medicos Registrados</h1>
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Especialidad</th>
          </tr>
        </thead>
        <tbody>
  `;

  results.forEach(medico => {
    html += `
      <tr>
        <td>${medico.nombre}</td>
        <td>${medico.especialidad}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
      <button onclick="window.location.href='/'">Volver</button>
    </body>
    </html>
  `;

  res.send(html);
});
});

// Ruta para ordenar pacientes por frecuencia cardiaca
app.get('/ordenar-medicos', requireLogin, requireRole('admin'),(req, res) => {
  const query = 'SELECT * FROM medicos ORDER BY especialidad ASC';

  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
      <title>Medicos</title>
    </head>
    <body>
      <h1>Medicos Registrados</h1>
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Especialidad</th>
          </tr>
        </thead>
        <tbody>
  `;

  results.forEach(medico => {
    html += `
      <tr>
        <td>${medico.nombre}</td>
        <td>${medico.especialidad}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
      <button onclick="window.location.href='/'">Volver</button>
    </body>
    </html>
  `;

  res.send(html);
});
});

// Ruta para que solo admin pueda ver todos los usuarios
app.get('/ver-usuarios', requireLogin, requireRole('admin'), (req, res) => {
  const query = 'SELECT * FROM usuarios';
  
  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los usuarios.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Ver Usuarios</title>
      </head>
      <body>
        <h1>&#128100; Usuarios Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre de Usuario</th>
              <th>Tipo de Usuario</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(usuario => {
      html += `
        <tr>
          <td>${usuario.id}</td>
          <td>${usuario.nombre_usuario}</td>
          <td>${usuario.tipo_usuario}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para eliminar un usuario
app.delete('/usuarios/:id', (req, res) => {
    const userId = req.params.id;
    const query = 'DELETE FROM usuarios WHERE id = ?';

    connection.query(query, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error al eliminar el usuario.');
        }
        res.send('Usuario eliminado correctamente.');
    });
});

// Ruta para modificar el tipo de usuario
app.put('/usuarios/:id', (req, res) => {
    const userId = req.params.id;
    const nuevoTipo = req.body.tipo_usuario; 
    const query = 'UPDATE usuarios SET tipo_usuario = ? WHERE id = ?';

    connection.query(query, [nuevoTipo, userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error al modificar el usuario.');
        }
        res.send('Usuario modificado correctamente.');
    });
});

// Ruta para la página de gestión de registros
app.get('/gestionar-registros', requireLogin, requireRole('admin'), (req, res) => {
    const query = 'SELECT * FROM usuarios';

    connection.query(query, (err, results) => {
        if (err) {
            return res.send('Error al obtener los usuarios.');
        }

        let html = `
            <html>
                <head>
                    <link rel="stylesheet" href="/styles.css">
                    <title>Gestionar Registros</title>
                </head>
                <body>
                    <h1>&#128100; Gestionar Registros</h1>
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nombre de Usuario</th>
                                <th>Tipo de Usuario</th>
                                <th>Modificar</th>
                                <th>Eliminar</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        results.forEach(usuario => {
            html += `
                <tr>
                    <td>${usuario.id}</td>
                    <td>${usuario.nombre_usuario}</td>
                    <td>${usuario.tipo_usuario}</td>
                    <td>
                        <button onclick="mostrarFormularioModificar(${usuario.id}, '${usuario.tipo_usuario}')">Modificar</button>
                    </td>
                    <td>
                        <button onclick="eliminarUsuario(${usuario.id})">Eliminar</button>
                    </td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                    <button onclick="window.location.href='/'">Volver</button>

                    <div id="formulario-modificar" style="display: none;">
                        <h2>Modificar Tipo de Usuario</h2>
                        <form id="form-modificar">
                            <input type="hidden" id="usuario-id">
                            <select id="tipo-usuario">
                                <option value="admin">Admin</option>
                                <option value="medico">Médico</option>
                                <option value="paciente">Paciente</option>
                            </select>
                            <button type="button" onclick="modificarUsuario()">Guardar</button>
                            <button type="button" onclick="ocultarFormularioModificar()">Cancelar</button>
                        </form>
                    </div>

                    <script>
                        function eliminarUsuario(userId) {
                            if (confirm('¿Seguro que quieres eliminar este usuario?')) {
                                fetch(\`/usuarios/\${userId}\`, { method: 'DELETE' })
                                    .then(response => {
                                        if (response.ok) {
                                            alert('Usuario eliminado correctamente.');
                                            location.reload(); // Recargar la página para actualizar la tabla
                                        } else {
                                            alert('Error al eliminar el usuario.');
                                        }
                                    });
                            }
                        }

                        function mostrarFormularioModificar(userId, tipoUsuario) {
                            document.getElementById('usuario-id').value = userId;
                            document.getElementById('tipo-usuario').value = tipoUsuario;
                            document.getElementById('formulario-modificar').style.display = 'block';
                        }

                        function ocultarFormularioModificar() {
                            document.getElementById('formulario-modificar').style.display = 'none';
                        }

                        function modificarUsuario() {
                            const userId = document.getElementById('usuario-id').value;
                            const nuevoTipo = document.getElementById('tipo-usuario').value;

                            fetch(\`/usuarios/\${userId}\`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ tipo_usuario: nuevoTipo })
                            })
                                .then(response => {
                                    if (response.ok) {
                                        alert('Usuario modificado correctamente.');
                                        location.reload(); // Recargar la página para actualizar la tabla
                                    } else {
                                        alert('Error al modificar el usuario.');
                                    }
                                });
                        }
                    </script>
                </body>
            </html>
        `;

        res.send(html);
    });
});

// Ruta para mostrar el formulario de registro de pacientes 
app.get('/registrar-paciente', requireLogin, (req, res) => {
    res.render('registro_paciente'); 
});

// Ruta para guardar datos en la base de datos
app.post('/submit-data', requireLogin, (req, res) => {
    const { name, age, gender, height, weight, heart_rate, blood_pressure, temperature } = req.body;
    const user_id = req.session.user.id; 

    const query = `INSERT INTO pacientes 
                   (nombre, edad, genero, altura, peso, frecuencia_cardiaca, presion_arterial, temperatura, user_id) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    connection.query(query, 
        [name, age, gender, height, weight, heart_rate, blood_pressure, temperature, user_id], 
        (err, result) => {
            if (err) {
                console.error('Error al guardar paciente:', err);
                return res.redirect('/error.html');
            }
            res.redirect('/pacientes?success=true&name=' + encodeURIComponent(name)); 
        }
    );
});

// Ruta para mostrar la lista de pacientes
app.get('/pacientes', requireLogin, requireRole('admin', 'medico'), (req, res) => {
    const query = 'SELECT * FROM pacientes ORDER BY nombre ASC'; 

    connection.query(query, (err, results) => { 
        if (err) {
            console.error('Error al obtener pacientes:', err);
            return res.redirect('/error.html');
        }
        res.render('lista_pacientes', { pacientes: results, query: req.query });
    });
});

// Ruta para mostrar el formulario de edición de un paciente
app.get('/editar-paciente/:id', requireLogin, (req, res) => {
    const pacienteId = req.params.id;
    const tipo_usuario = req.session.user.tipo_usuario;

    let query;
    let queryParams;

    if (tipo_usuario === 'admin' || tipo_usuario === 'medico') {
        query = 'SELECT * FROM pacientes WHERE id = ?';
        queryParams = [pacienteId];
    } else {
        return res.status(403).send('No autorizado para editar este paciente.'); 
    }

    connection.query(query, queryParams, (err, results) => {
        if (err) {
            console.error('Error al obtener paciente para edición:', err);
            return res.redirect('/error.html');
        }
        if (results.length === 0) {
            return res.status(404).send('Paciente no encontrado o no autorizado.');
        }

        const paciente = results[0];
        res.render('editar_pacientes', { paciente: paciente });
    });
});

// Ruta para actualizar los datos de un paciente
app.post('/actualizar-paciente/:id', requireLogin, (req, res) => {
    const pacienteId = req.params.id;
    const { name, age, gender, height, weight, heart_rate, blood_pressure, temperature } = req.body;
    const tipo_usuario = req.session.user.tipo_usuario;

    let query;
    let queryParams;

    if (tipo_usuario === 'admin' || tipo_usuario === 'medico') {
        query = `UPDATE pacientes SET 
                   nombre = ?, edad = ?, genero = ?, altura = ?, peso = ?, 
                   frecuencia_cardiaca = ?, presion_arterial = ?, temperatura = ?
                   WHERE id = ?`; 
        queryParams = [name, age, gender, height, weight, heart_rate, blood_pressure, temperature, pacienteId];
    } else {
        return res.status(403).send('No autorizado para actualizar este paciente.');
    }
    
    connection.query(query, queryParams, 
        (err, result) => {
            if (err) {
                console.error('Error al actualizar paciente:', err);
                return res.redirect('/error.html');
            }
            if (result.affectedRows === 0) {
                return res.status(404).send('Paciente no encontrado o no autorizado para actualizar.');
            }
            res.redirect('/pacientes?updateSuccess=true');
        }
    );
});

// Ruta para eliminar un paciente
app.delete('/pacientes/:id', requireLogin, (req, res) => {
    const pacienteId = req.params.id;
    const tipo_usuario = req.session.user.tipo_usuario;

    let query;
    let queryParams;

    if (tipo_usuario === 'admin' || tipo_usuario === 'medico') {
        query = 'DELETE FROM pacientes WHERE id = ?'; 
        queryParams = [pacienteId];
    } else {
        return res.status(403).send('No autorizado para eliminar este paciente.'); 
    }

    connection.query(query, queryParams, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error al eliminar el paciente.');
        }
        if (results.affectedRows === 0) {
            return res.status(404).send('Paciente no encontrado o no autorizado para eliminar.');
        }
        res.status(200).send('Paciente eliminado correctamente.'); 
    });
});

// Ruta para mostrar los datos del paciente o medico
app.get('/ver-mis-datos', requireLogin, requireRole('paciente', 'medico'), (req, res) => {
  const userType = req.session.user.tipo_usuario;  
  const nombreUsuario = req.session.user.nombre_usuario;
  const userId = req.session.user.id; 

  if (!nombreUsuario || !userId) {
    return res.status(401).send('No autorizado');
  }

  if (userType === 'paciente') {
    const query = 'SELECT nombre, edad, frecuencia_cardiaca, genero, altura, peso, temperatura, presion_arterial FROM pacientes WHERE user_id = ?';
    connection.query(query, [userId], (err, results) => {
      if (err) {
        return res.status(500).send('Error al obtener los datos del paciente.');
      }
      if (results.length === 0) {
        return res.status(404).send('Paciente no encontrado.');
      }

      const paciente = results[0];
      let html = `
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Mis Datos</title>
        </head>
        <body>
          <h1>&#127973; Datos</h1>
          <table>
            <thead>
              <tr>
              <th>Nombre</th>
              <th>Edad</th>
              <th>Género</th>
              <th>Frecuencia Cardiaca (bpm)</th>
              <th>Altura (m)</th>
              <th>Peso (kg)</th>
              <th>Temperatura (°)</th>
              <th>Presion Arterial (mm Hg)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${paciente.nombre}</td>
                <td>${paciente.edad}</td>
                <td>${paciente.genero}</td>
                <td>${paciente.frecuencia_cardiaca}</td>
                <td>${paciente.altura}</td>
                <td>${paciente.peso}</td>
                <td>${paciente.temperatura}</td>
                <td>${paciente.presion_arterial}</td>
              </tr>
            </tbody>
          </table>
          <button onclick="window.location.href='/'">Volver</button>
        </body>
        </html>
      `;
      res.send(html);
    });

  } else if (userType === 'medico') {
    const query = 'SELECT nombre, especialidad FROM medicos WHERE user_id = ?';
    connection.query(query, [userId], (err, results) => {
      if (err) {
        return res.status(500).send('Error al obtener los datos del médico.');
      }
      if (results.length === 0) {
        return res.status(404).send('Médico no encontrado.');
      }

      const medico = results[0];
      let html = `
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Mis Datos</title>
        </head>
        <body>
          <h1>&#129404; Datos</h1>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Especialidad</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${medico.nombre}</td>
                <td>${medico.especialidad}</td>
              </tr>
            </tbody>
          </table>
          <button onclick="window.location.href='/'">Volver</button>
        </body>
        </html>
      `;
      res.send(html);
    });

  } else {
    return res.status(401).send('No autorizado');
  }
});

// Ruta para mostrar pacientes asignados a un medico
app.get('/mis-pacientes', requireLogin, requireRole('medico'), (req, res) => {
    const medicoId = req.session.user.id;

    const query = `
        SELECT p.*
        FROM pacientes p
        JOIN medico_paciente mp ON p.id = mp.paciente_id
        WHERE mp.medico_id = ?
    `;

    connection.query(query, [medicoId], (err, results) => {
        if (err) {
            console.error('Error al obtener pacientes asignados:', err);
            return res.status(500).send('Error al obtener pacientes asignados');
        }

        let html = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Mis Pacientes</title>
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <div id="navbar"></div>
                <div class="container">
                    <h1>Mis Pacientes Asignados</h1>
                    <table>
                        <thead>
                            <tr>
                                 <th>Nombre</th>
                                 <th>Edad</th>
                                 <th>Género</th>
                                 <th>Frecuencia Cardiaca (bpm)</th>
                                 <th>Altura (m)</th>
                                 <th>Peso (kg)</th>
                                 <th>Presion arterial (mm Hg)</th>
                                 <th>Temperatura (°)</th>
                                 <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (results && results.length > 0) {
            results.forEach(paciente => {
                html += `
                    <tr>
                        <td>${paciente.nombre}</td>
                        <td>${paciente.edad}</td>
                        <td>${paciente.genero}</td>
                        <td class="${paciente.frecuencia_cardiaca > 100 ? 'critical' : ''}">
                            ${paciente.frecuencia_cardiaca} bpm
                        <td>${paciente.altura}</td>
                        <td>${paciente.peso}</td>
                        <td class="${paciente.presion_arterial > 120/80 ? 'critical' : ''}">
                            ${paciente.presion_arterial} mm Hg
                        <td class="${paciente.temperatura > 37 ? 'critical' : ''}">
                            ${paciente.temperatura} °
                        </td>
                        <td>
                            <a href="/agendar-cita?paciente_id=${paciente.id}" class="btn btn-accent">Agendar Cita</a>
                        </td>
                    </tr>
                `;
            });
        } else {
            html += `
                <tr>
                    <td colspan="4">No tienes pacientes asignados.</td>
                </tr>
            `;
        }

        html += `
                        </tbody>
                    </table>
                    <button onclick="window.location.href='/'" class="btn">Volver al Inicio</button>
                </div>
            </body>
            </html>
        `;

        res.send(html);
    });
});

// Ruta para seleccionar paciente
app.get('/seleccionar-paciente-cita', requireLogin, requireRole('medico'), (req, res) => {
    const query = 'SELECT id, nombre, edad, frecuencia_cardiaca, temperatura, presion_arterial FROM pacientes ORDER BY nombre ASC';

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener la lista completa de pacientes:', err);
            return res.status(500).send('Error al obtener la lista de pacientes.');
        }

        let html = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Seleccionar Paciente para Cita</title>
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <div id="navbar"></div>
                <div class="container">
                    <h1>Seleccionar Paciente para Nueva Cita</h1>
                    <p>Selecciona un paciente de la lista para programar una cita.</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Edad</th>
                                <th>Frecuencia Cardíaca (bpm)</th>
                                <th>Temperatura (°C)</th>
                                <th>Presión Arterial (mmHg)</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (results && results.length > 0) {
            results.forEach(paciente => {
                html += `
                                <tr>
                                    <td>${paciente.nombre}</td>
                                    <td>${paciente.edad}</td>
                                    <td class="${paciente.frecuencia_cardiaca > 100 ? 'critical' : ''}">
                                        ${paciente.frecuencia_cardiaca} bpm
                                    </td>
                                    <td>${paciente.temperatura ? `${paciente.temperatura} °C` : 'N/A'}</td>
                                    <td>${paciente.presion_arterial ? `${paciente.presion_arterial} mmHg` : 'N/A'}</td>
                                    <td>
                                        <a href="/agendar-cita?paciente_id=${paciente.id}&paciente_nombre=${encodeURIComponent(paciente.nombre)}" class="btn btn-accent">Agendar Cita</a>
                                    </td>
                                </tr>
                `;
            });
        } else {
            html += `
                                <tr>
                                    <td colspan="6">No hay pacientes registrados en el sistema.</td>
                                </tr>
            `;
        }

        html += `
                        </tbody>
                    </table>
                    <button onclick="window.location.href='/'" class="btn">Volver al Inicio</button>
                </div>
                <script src="/navbar.js"></script>
            </body>
            </html>
        `;

        res.send(html);
    });
});


// Confirmacion de cita
app.get('/agendar-cita', requireLogin, requireRole('medico'), (req, res) => {
    const pacienteId = req.query.paciente_id;
    const pacienteNombre = req.query.paciente_nombre;

    if (!pacienteId || !pacienteNombre) {
        console.error('Error: Paciente ID y Nombre son requeridos para agendar una cita (en /agendar-cita GET).');
        return res.status(400).send('Paciente ID y Nombre son requeridos para agendar una cita. Vuelve a la selección de pacientes.');
    }

    const filePath = path.join(__dirname, 'public', 'agendarC.html');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error al leer el archivo agendarC.html:', err);
            return res.status(500).send('Error interno del servidor al cargar el formulario.');
        }

        let htmlContent = data.replace('id="title-paciente">Agendar Cita</h1>', `id="title-paciente">Agendar Cita con ${decodeURIComponent(pacienteNombre)}</h1>`);
        htmlContent = htmlContent.replace('id="paciente_id_input">', `id="paciente_id_input" value="${pacienteId}">`);
        htmlContent = htmlContent.replace(/<script>\s*document\.addEventListener\('DOMContentLoaded',[\s\S]*?<\/script>/, '');


        res.send(htmlContent);
    });
});

// Ruta para mostrar la agenda de citas del medico
app.get('/mi-agenda', requireLogin, requireRole('medico', 'paciente'), (req, res) => {
    const userId = req.session.user.id; 
    const userType = req.session.user.tipo_usuario;

    let query;
    let params;

    if (userType === 'medico') {
        query = `
            SELECT c.id, p.nombre AS paciente_nombre, c.fecha_hora, c.motivo, c.estado 
            FROM citas c
            JOIN pacientes p ON c.paciente_id = p.id
            JOIN medicos m ON c.medico_id = m.id 
            WHERE m.user_id = ? 
            ORDER BY c.fecha_hora ASC
        `;
        params = [userId];
    } else if (userType === 'paciente') {
        query = `
            SELECT c.id, m.nombre AS medico_nombre, c.fecha_hora, c.motivo, c.estado 
            FROM citas c
            JOIN medicos m ON c.medico_id = m.id
            JOIN pacientes p ON c.paciente_id = p.id 
            WHERE p.user_id = ? 
            ORDER BY c.fecha_hora ASC
        `;
        params = [userId]; 
    } else {
        return res.status(403).send('Acceso denegado');
    }

    connection.query(query, params, (err, results) => {
        if (err) {
            console.error('Error al obtener citas:', err); 
            return res.status(500).send('Error al obtener citas: ' + err.message); 
        }

        let html = `
            <html>
            <head>
                <link rel="stylesheet" href="/styles.css">
                <title>Mi Agenda</title>
            </head>
            <body>
                <h1>Mi Agenda</h1>
                <table>
                    <thead>
                        <tr>
                            <th>${userType === 'medico' ? 'Paciente' : 'Médico'}</th>
                            <th>Fecha y Hora</th>
                            <th>Motivo</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (results.length === 0) { 
            html += `
                <tr>
                    <td colspan="5">No tienes citas programadas.</td>
                </tr>
            `;
        } else {
            results.forEach(cita => {
                const primaryColumnData = userType === 'medico' ? cita.paciente_nombre : cita.medico_nombre;

                html += `
                    <tr>
                        <td>${primaryColumnData}</td>
                        <td>${new Date(cita.fecha_hora).toLocaleString()}</td>
                        <td>${cita.motivo}</td>
                        <td>${cita.estado}</td>
                        <td>
                            ${userType === 'medico' ? `
                                <button onclick="window.location.href='/completar-cita?id=${cita.id}'">Completar</button>
                                <button onclick="window.location.href='/cancelar-cita?id=${cita.id}'">Cancelar</button>
                            ` : `
                                <button onclick="window.location.href='/cancelar-cita?id=${cita.id}'">Cancelar</button>
                            `}
                        </td>
                    </tr>
                `;
            });
        }

        html += `
                    </tbody>
                </table>
                <button onclick="window.location.href='/'">Volver</button>
            </body>
            </html>
        `;

        res.send(html);
    });
});

// Cuando un médico crea una cita
app.post('/crear-cita', requireLogin, requireRole('medico'), (req, res) => {
    const medicoUserId = req.session.user.id; 
    const pacienteIdSeleccionado = req.body.paciente_id; 
    const fechaHoraCita = req.body.fecha_hora;
    const motivoCita = req.body.motivo;

    console.log('// --- INICIO DEBUG CREAR CITA ---');
    console.log('medicoUserId de la sesión:', medicoUserId); 

    connection.query('SELECT id FROM medicos WHERE user_id = ?', [medicoUserId], (err, results) => {
        if (err) {
            console.error('Error al obtener medico_id:', err);
            return res.status(500).send('Error interno del servidor.');
        }
        if (results.length === 0) {
            console.error('ERROR: No se encontró médico en la tabla "medicos" para el user_id:', medicoUserId);
            return res.status(404).send('Médico no encontrado para el usuario logueado. Verifique la tabla medicos.');
        }

        const medicoId = results[0].id; 
        console.log('ID de médico (medicoId) obtenido de la tabla medicos:', medicoId); 
        console.log('Paciente ID seleccionado (pacienteIdSeleccionado):', pacienteIdSeleccionado);
        console.log('Fecha y Hora de la cita:', fechaHoraCita);
        console.log('Motivo de la cita:', motivoCita);

        const query = 'INSERT INTO citas (medico_id, paciente_id, fecha_hora, motivo, estado) VALUES (?, ?, ?, ?, ?)';
        const params = [medicoId, pacienteIdSeleccionado, fechaHoraCita, motivoCita, 'pendiente']; 

        connection.query(query, params, (err, result) => {
            if (err) {
                console.error('Error al insertar cita:', err); 
                return res.status(500).send('Error al crear cita.');
            }
            console.log('Cita insertada correctamente con ID:', result.insertId); 
            console.log('// --- FIN DEBUG CREAR CITA ---');
            res.redirect('/mi-agenda'); 
        });
    });
});

// Ruta para mostrar el formulario de agendar cita
app.get('/agendar-cita', requireLogin, requireRole('medico'), (req, res) => {
    const pacienteId = req.query.paciente_id;
    
    // Si no hay paciente_id, redirigir a selección con mensaje claro
    if (!pacienteId) {
        return res.redirect('/seleccionar-paciente-cita?error=Selecciona un paciente primero');
    }

    connection.query('SELECT * FROM pacientes WHERE id = ?', [pacienteId], (err, pacienteResults) => {
        if (err || pacienteResults.length == 0) {
            console.error('Error al obtener paciente:', err);
            return res.redirect('/seleccionar-paciente-cita?error=Paciente no encontrado');
        }

        const paciente = pacienteResults[0];
        const isUrgente = req.query.urgente === '1';

        // Leer el archivo HTML y hacer las sustituciones necesarias
        const filePath = path.join(__dirname, 'public', 'agendarC.html');
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error al leer agendarC.html:', err);
                return res.status(500).send('Error al cargar el formulario');
            }

            let htmlContent = data
                .replace('id="title-paciente">Agendar Cita</h1>', 
                         `id="title-paciente">Agendar Cita con ${paciente.nombre}</h1>`)
                .replace('id="paciente_id_input">', 
                         `id="paciente_id_input" value="${pacienteId}">`);

            // Si es urgente, añadir "URGENTE" al motivo por defecto
            if (isUrgente) {
                htmlContent = htmlContent.replace(
                    '<textarea id="motivo" name="motivo" required></textarea>',
                    '<textarea id="motivo" name="motivo" required>URGENTE - </textarea>'
                );
            }

            res.send(htmlContent);
        });
    });
});

// Ruta para guardar una cita
app.post('/guardar-cita', requireLogin, requireRole('medico'), (req, res) => { 
    const { paciente_id, fecha_hora, motivo } = req.body;
    const medicoId = req.session.user.id;

        const insertQuery = 'INSERT INTO citas (medico_id, paciente_id, fecha_hora, motivo, estado) VALUES (?, ?, ?, ?, "pendiente")';
        connection.query(insertQuery, [medicoId, paciente_id, fecha_hora, motivo], (err) => {
            if (err) {
                console.error('Error al guardar cita:', err);
                return res.status(500).send('Error al guardar la cita');
            }
            
            res.redirect('/mi-agenda'); 
        });
});

// Ruta para completar una cita
app.get('/completar-cita', requireLogin, requireRole('medico'), (req, res) => {
    const citaId = req.query.id;
    const medicoId = req.session.user.id;

    const updateQuery = 'UPDATE citas SET estado = "completada" WHERE id = ? AND medico_id = ?';
    connection.query(updateQuery, [citaId, medicoId], (err) => {
        if (err) {
            console.error('Error al completar cita:', err);
            return res.status(500).send('Error al completar la cita');
        }
        
        res.redirect('/mi-agenda');
    });
});

// Ruta para cancelar una cita
app.get('/cancelar-cita', requireLogin, requireRole('medico'), (req, res) => {
    const citaId = req.query.id;
    const medicoId = req.session.user.id;

    const updateQuery = 'UPDATE citas SET estado = "cancelada" WHERE id = ? AND medico_id = ?';
    connection.query(updateQuery, [citaId, medicoId], (err) => {
        if (err) {
            console.error('Error al cancelar cita:', err);
            return res.status(500).send('Error al cancelar la cita');
        }
        
        res.redirect('/mi-agenda');
    });
});
 
// Búsqueda de pacientes en tiempo real
app.get('/api/buscar-pacientes-rt', requireLogin, requireRole('admin', 'medico'), (req, res) => {
  const { term } = req.query;
  
  if (!term || term.length < 1) {
    return res.json([]);
  }

  const query = 'SELECT id, nombre, edad, frecuencia_cardiaca FROM pacientes WHERE nombre LIKE ? LIMIT 10';
  const searchTerm = `%${term}%`;
  
  connection.query(query, [searchTerm], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Error en la búsqueda de pacientes' });
    }
    res.json(results);
  });
});

// Búsqueda de médicos en tiempo real
app.get('/api/buscar-medicos-rt', requireLogin, requireRole('admin'), (req, res) => {
  const { term } = req.query;
  
  if (!term || term.length < 1) {
    return res.json([]);
  }

  const query = 'SELECT id, nombre, especialidad FROM medicos WHERE nombre LIKE ? OR especialidad LIKE ? LIMIT 10';
  const searchTerm = `%${term}%`;
  
  connection.query(query, [searchTerm, searchTerm], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Error en la búsqueda de médicos' });
    }
    res.json(results);
  });
});

// Ruta API para obtener pacientes críticos
app.get('/api/pacientes-criticos', requireLogin, requireRole('admin', 'medico'), (req, res) => {
    const query = `
        SELECT id, nombre, edad, frecuencia_cardiaca, presion_arterial, temperatura 
        FROM pacientes 
        WHERE frecuencia_cardiaca > 100 
           OR frecuencia_cardiaca < 60
           OR (presion_arterial IS NOT NULL AND 
               (SUBSTRING_INDEX(presion_arterial, '/', 1) > 140 OR 
                SUBSTRING_INDEX(presion_arterial, '/', -1) > 90))
           OR temperatura > 37.5
        ORDER BY 
            CASE 
                WHEN frecuencia_cardiaca > 100 OR frecuencia_cardiaca < 60 THEN 1
                WHEN (SUBSTRING_INDEX(presion_arterial, '/', 1) > 140 OR 
                      SUBSTRING_INDEX(presion_arterial, '/', -1) > 90) THEN 2
                WHEN temperatura > 37.5 THEN 3
                ELSE 4
            END,
            ABS(frecuencia_cardiaca - 80) DESC
    `;
    
    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener pacientes críticos:', err);
            return res.status(500).json({ error: 'Error al obtener pacientes críticos' });
        }
        res.json(results);
    });
});

// Ruta para la página de alertas
app.get('/alertas', requireLogin, requireRole('admin', 'medico'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'alertas.html'));
});

// Ruta para enviar mensaje
app.post('/enviar-mensaje', requireLogin, async (req, res) => {
    const { destinatario_id, asunto, contenido } = req.body;
    const remitente_id = req.session.user.id;

    const query = 'INSERT INTO mensajes (remitente_id, destinatario_id, asunto, contenido) VALUES (?, ?, ?, ?)';
    connection.query(query, [remitente_id, destinatario_id, asunto, contenido], (err) => {
        if (err) {
            console.error('Error al enviar mensaje:', err);
            return res.status(500).json({ error: 'Error al enviar mensaje' });
        }
        res.json({ success: true });
    });
});

// Ruta para obtener mensajes recibidos
app.get('/mensajes-recibidos', requireLogin, (req, res) => {
    const userId = req.session.user.id;

    const query = `
        SELECT m.*, u.nombre_usuario as remitente_nombre 
        FROM mensajes m
        JOIN usuarios u ON m.remitente_id = u.id
        WHERE m.destinatario_id = ?
        ORDER BY m.fecha_envio DESC
    `;
    connection.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error al obtener mensajes:', err);
            return res.status(500).json({ error: 'Error al obtener mensajes' });
        }
        res.json(results);
    });
});

// Ruta para obtener mensajes enviados
app.get('/mensajes-enviados', requireLogin, (req, res) => {
    const userId = req.session.user.id;

    const query = `
        SELECT m.*, u.nombre_usuario as destinatario_nombre 
        FROM mensajes m
        JOIN usuarios u ON m.destinatario_id = u.id
        WHERE m.remitente_id = ?
        ORDER BY m.fecha_envio DESC
    `;
    connection.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error al obtener mensajes enviados:', err);
            return res.status(500).json({ error: 'Error al obtener mensajes enviados' });
        }
        res.json(results);
    });
});

// Ruta para marcar mensaje como leído
app.post('/marcar-leido/:id', requireLogin, (req, res) => {
    const mensajeId = req.params.id;
    const userId = req.session.user.id;

    const query = 'UPDATE mensajes SET leido = TRUE WHERE id = ? AND destinatario_id = ?';
    connection.query(query, [mensajeId, userId], (err) => {
        if (err) {
            console.error('Error al marcar mensaje como leído:', err);
            return res.status(500).json({ error: 'Error al marcar mensaje como leído' });
        }
        res.json({ success: true });
    });
});

// Ruta para buscar usuarios (para seleccionar destinatario)
app.get('/buscar-usuarios', requireLogin, (req, res) => {
    const { term } = req.query;
    const userId = req.session.user.id;
    
    let query;
    let params;

    if (req.session.user.tipo_usuario === 'admin') {
        query = 'SELECT id, nombre_usuario FROM usuarios WHERE nombre_usuario LIKE ? AND id != ?';
        params = [`%${term}%`, userId];
    } else if (req.session.user.tipo_usuario === 'medico') {
        query = `
            SELECT u.id, u.nombre_usuario 
            FROM usuarios u
            LEFT JOIN pacientes p ON u.id = p.user_id
            WHERE u.nombre_usuario LIKE ? 
            AND u.id != ?
            AND (u.tipo_usuario = 'medico' OR u.tipo_usuario = 'paciente')
        `;
        params = [`%${term}%`, userId];
    } else if (req.session.user.tipo_usuario === 'paciente') {
        query = `
            SELECT u.id, u.nombre_usuario 
            FROM usuarios u
            LEFT JOIN medicos m ON u.id = m.user_id
            WHERE u.nombre_usuario LIKE ? 
            AND u.id != ?
            AND (u.tipo_usuario = 'medico' OR u.tipo_usuario = 'paciente')
        `;
        params = [`%${term}%`, userId];
    }

    connection.query(query, params, (err, results) => {
        if (err) {
            console.error('Error al buscar usuarios:', err);
            return res.status(500).json({ error: 'Error al buscar usuarios' });
        }
        res.json(results);
    });
});

// Ruta para obtener citas por rango de fechas (para el calendario)
app.get('/api/citas', requireLogin, (req, res) => {
  const { start, end } = req.query;
  const userId = req.session.user.id;
  const userType = req.session.user.tipo_usuario;

  let query;
  let params;

  if (userType === 'medico') {
    query = `
      SELECT c.id, c.fecha_hora, c.motivo, c.estado, p.nombre AS paciente_nombre
      FROM citas c
      JOIN pacientes p ON c.paciente_id = p.id
      JOIN medicos m ON c.medico_id = m.id
      WHERE m.user_id = ? AND c.fecha_hora BETWEEN ? AND ?
      ORDER BY c.fecha_hora
    `;
    params = [userId, start, end];
  } else if (userType === 'paciente') {
    query = `
      SELECT c.id, c.fecha_hora, c.motivo, c.estado, m.nombre AS medico_nombre
      FROM citas c
      JOIN medicos m ON c.medico_id = m.id
      JOIN pacientes p ON c.paciente_id = p.id
      WHERE p.user_id = ? AND c.fecha_hora BETWEEN ? AND ?
      ORDER BY c.fecha_hora
    `;
    params = [userId, start, end];
  } else if (userType === 'admin') {
    query = `
      SELECT c.id, c.fecha_hora, c.motivo, c.estado, 
             p.nombre AS paciente_nombre, m.nombre AS medico_nombre
      FROM citas c
      JOIN pacientes p ON c.paciente_id = p.id
      JOIN medicos m ON c.medico_id = m.id
      WHERE c.fecha_hora BETWEEN ? AND ?
      ORDER BY c.fecha_hora
    `;
    params = [start, end];
  } else {
    return res.status(403).json({ error: 'Acceso no autorizado' });
  }

  connection.query(query, params, (err, results) => {
    if (err) {
      console.error('Error al obtener citas para el calendario:', err);
      return res.status(500).json({ error: 'Error al obtener citas' });
    }
    res.json(results);
  });
});

// Ruta para mostrar el formulario de subida de PDF
app.get('/subir-pdf', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'subir-pdf.html'));
});

// Ruta para procesar la subida de PDF
app.post('/subir-pdf', requireLogin, upload.single('pdfFile'), (req, res, next) => {
    if (!req.file) {
        return res.status(400).send('Por favor, sube un archivo válido (PDF o imagen)');
    }

    // Aquí puedes guardar información sobre el archivo en tu base de datos
    const { originalname, filename, path, mimetype, size } = req.file;
    const userId = req.session.user.id;
    
    const sql = 'INSERT INTO documentos (nombre_original, nombre_archivo, ruta, tipo, tamaño, user_id) VALUES (?, ?, ?, ?, ?, ?)';
    connection.query(sql, [originalname, filename, path, mimetype, size, userId], (err) => {
        if (err) {
            console.error('Error al guardar documento:', err);
            return res.status(500).send('Error al guardar información del documento');
        }
        
        res.send(`
            <html>
                <head>
                    <link rel="stylesheet" href="/styles.css">
                    <title>Éxito</title>
                </head>
                <body>
                    <div class="success-container">
                        <h2>Archivo subido exitosamente</h2>
                        <p>${originalname} ha sido guardado correctamente.</p>
                        <a href="/ver-documentos" class="btn">Ver Documentos</a>
                    </div>
                </body>
            </html>
        `);
    });
});

// Ruta para ver documentos subidos
app.get('/ver-documentos', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    
    const sql = 'SELECT * FROM documentos WHERE user_id = ? ORDER BY fecha_subida DESC';
    connection.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Error al obtener documentos:', err);
            return res.status(500).send('Error al obtener documentos');
        }
        
        let html = `
            <html>
                <head>
                    <link rel="stylesheet" href="/styles.css">
                    <title>Mis Documentos</title>
                </head>
                <body>
                    <h1>📄Mis Documentos</h1>
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Tipo</th>
                                <th>Tamaño</th>
                                <th>Fecha</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        results.forEach(doc => {
            const sizeMB = (doc.tamaño / (1024 * 1024)).toFixed(2);
            html += `
                <tr>
                    <td>${doc.nombre_original}</td>
                    <td>${doc.tipo}</td>
                    <td>${sizeMB} MB</td>
                    <td>${new Date(doc.fecha_subida).toLocaleString()}</td>
                    <td>
                        <a href="/descargar-documento/${doc.id}" class="btn">Descargar</a>
                        <button onclick="eliminarDocumento(${doc.id})" class="btn btn-danger">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                    <a href="/subir-pdf" class="btn">Subir Nuevo Documento</a>
                    
                    <script>
                        function eliminarDocumento(docId) {
                            if (confirm('¿Estás seguro de eliminar este documento?')) {
                                fetch('/eliminar-documento/' + docId, { method: 'DELETE' })
                                    .then(response => {
                                        if (response.ok) {
                                            location.reload();
                                        } else {
                                            alert('Error al eliminar documento');
                                        }
                                    });
                            }
                        }
                    </script>
                </body>
            </html>
        `;
        
        res.send(html);
    });
});

// Ruta para descargar documentos
app.get('/descargar-documento/:id', requireLogin, (req, res) => {
    const docId = req.params.id;
    const userId = req.session.user.id;
    
    const sql = 'SELECT * FROM documentos WHERE id = ? AND user_id = ?';
    connection.query(sql, [docId, userId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).send('Documento no encontrado');
        }
        
        const doc = results[0];
        res.download(doc.ruta, doc.nombre_original);
    });
});

// Ruta para eliminar documentos
app.delete('/eliminar-documento/:id', requireLogin, (req, res) => {
    const docId = req.params.id;
    const userId = req.session.user.id;
    
    // Primero obtenemos la ruta del archivo
    const getSql = 'SELECT ruta FROM documentos WHERE id = ? AND user_id = ?';
    connection.query(getSql, [docId, userId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).send('Documento no encontrado');
        }
        
        const filePath = results[0].ruta;
        
        // Eliminamos el registro de la base de datos
        const deleteSql = 'DELETE FROM documentos WHERE id = ? AND user_id = ?';
        connection.query(deleteSql, [docId, userId], (err) => {
            if (err) {
                return res.status(500).send('Error al eliminar registro de documento');
            }
            
            // Intentamos eliminar el archivo físico
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error al eliminar archivo físico:', err);
                    // Aún así consideramos la operación exitosa porque el registro se eliminó
                }
                res.status(200).send('Documento eliminado correctamente');
            });
        });
    });
});

// Configuración específica para Excel
const excelStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads/excel');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'excel-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const excelFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel' // .xls
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'), false);
    }
};

const uploadExcel = multer({
    storage: excelStorage,
    fileFilter: excelFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

// Ruta para mostrar el formulario de subida de Excel
app.get('/subir-excel', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'subir-excel.html'));
});

// Ruta para procesar la subida de Excel
app.post('/subir-excel', requireLogin, uploadExcel.single('excelFile'), (req, res, next) => {
    if (!req.file) {
        return res.status(400).send('Por favor, sube un archivo Excel válido (.xlsx, .xls)');
    }

    const { originalname, filename, path: filePath, size } = req.file;
    const userId = req.session.user.id;
    
    const sql = 'INSERT INTO documentos_excel (nombre_original, nombre_archivo, ruta, tamaño, user_id) VALUES (?, ?, ?, ?, ?)';
    connection.query(sql, [originalname, filename, filePath, size, userId], (err) => {
        if (err) {
            console.error('Error al guardar documento Excel:', err);
            return res.status(500).send('Error al guardar información del archivo Excel');
        }
        
        res.send(`
            <html>
                <head>
                    <link rel="stylesheet" href="/styles.css">
                    <title>Éxito</title>
                </head>
                <body>
                    <div class="success-container">
                        <h2>Archivo Excel subido exitosamente</h2>
                        <p>${originalname} ha sido guardado correctamente.</p>
                        <a href="/ver-excels" class="btn">Ver Archivos Excel</a>
                    </div>
                </body>
            </html>
        `);
    });
});

// Ruta para ver archivos Excel subidos
app.get('/ver-excels', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    
    const sql = 'SELECT * FROM documentos_excel WHERE user_id = ? ORDER BY fecha_subida DESC';
    connection.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Error al obtener archivos Excel:', err);
            return res.status(500).send('Error al obtener archivos Excel');
        }
        
        let html = `
            <html>
                <head>
                    <link rel="stylesheet" href="/styles.css">
                    <title>Mis Archivos Excel</title>
                    <style>
                        .excel-icon {
                            color: #1d6f42;
                            margin-right: 5px;
                        }
                        .preview-btn {
                            background-color:rgb(111, 29, 29);
                            color: white;
                            padding: 5px 10px;
                            border-radius: 4px;
                            text-decoration: none;
                            margin-right: 5px;
                        }
                    </style>
                </head>
                <body>
                    <h1><span class="excel-icon">📊</span> Mis Archivos Excel</h1>
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Tamaño</th>
                                <th>Fecha</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        results.forEach(doc => {
            const sizeMB = (doc.tamaño / (1024 * 1024)).toFixed(2);
            html += `
                <tr>
                    <td>${doc.nombre_original}</td>
                    <td>${sizeMB} MB</td>
                    <td>${new Date(doc.fecha_subida).toLocaleString()}</td>
                    <td>
                        <a href="/descargar-excel/${doc.id}" class="btn"><span class="excel-icon">📥</span> Descargar</a>
                        <a href="/preview-excel/${doc.id}" class="preview-btn">Vista Previa</a>
                        <button onclick="eliminarExcel(${doc.id})" class="btn btn-danger">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                    <a href="/subir-excel" class="btn"><span class="excel-icon">📤</span> Subir Nuevo Excel</a>
                    
                    <script>
                        function eliminarExcel(docId) {
                            if (confirm('¿Estás seguro de eliminar este archivo Excel?')) {
                                fetch('/eliminar-excel/' + docId, { method: 'DELETE' })
                                    .then(response => {
                                        if (response.ok) {
                                            location.reload();
                                        } else {
                                            alert('Error al eliminar archivo Excel');
                                        }
                                    });
                            }
                        }
                    </script>
                </body>
            </html>
        `;
        
        res.send(html);
    });
});

// Ruta para descargar archivos Excel
app.get('/descargar-excel/:id', requireLogin, (req, res) => {
    const docId = req.params.id;
    const userId = req.session.user.id;
    
    const sql = 'SELECT * FROM documentos_excel WHERE id = ? AND user_id = ?';
    connection.query(sql, [docId, userId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).send('Archivo Excel no encontrado');
        }
        
        const doc = results[0];
        res.download(doc.ruta, doc.nombre_original);
    });
});

// Ruta para vista previa de Excel
app.get('/preview-excel/:id', requireLogin, (req, res) => {
    const docId = req.params.id;
    const userId = req.session.user.id;
    
    const sql = 'SELECT * FROM documentos_excel WHERE id = ? AND user_id = ?';
    connection.query(sql, [docId, userId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).send('Archivo Excel no encontrado');
        }
        
        const doc = results[0];
        
        try {
            // Leer el archivo Excel
            const workbook = xlsx.readFile(doc.ruta);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Convertir a HTML
            const html = xlsx.utils.sheet_to_html(worksheet, {
                editable: false,
                header: '',
                footer: ''
            });
            
            // Enviar la vista previa
            res.send(`
                <html>
                    <head>
                        <link rel="stylesheet" href="/styles.css">
                        <title>Vista Previa: ${doc.nombre_original}</title>
                        <style>
                            .excel-preview {
                                overflow-x: auto;
                                margin: 20px 0;
                            }
                            .excel-preview table {
                                border-collapse: collapse;
                                width: 100%;
                            }
                            .excel-preview th, .excel-preview td {
                                border: 1px solid #ddd;
                                padding: 8px;
                                text-align: left;
                            }
                            .excel-preview th {
                                background-color: #1d6f42;
                                color: white;
                            }
                            .excel-preview tr:nth-child(even) {
                                background-color: #f2f2f2;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>Vista Previa: ${doc.nombre_original}</h1>
                            <div class="excel-preview">
                                ${html}
                            </div>
                            <div class="action-buttons">
                                <a href="/descargar-excel/${doc.id}" class="btn">Descargar</a>
                                <a href="/ver-excels" class="btn">Volver</a>
                            </div>
                        </div>
                    </body>
                </html>
            `);
        } catch (error) {
            console.error('Error al generar vista previa:', error);
            res.status(500).send('Error al generar vista previa del archivo Excel');
        }
    });
});

// Ruta para eliminar archivos Excel
app.delete('/eliminar-excel/:id', requireLogin, (req, res) => {
    const docId = req.params.id;
    const userId = req.session.user.id;
    
    // Primero obtenemos la ruta del archivo
    const getSql = 'SELECT ruta FROM documentos_excel WHERE id = ? AND user_id = ?';
    connection.query(getSql, [docId, userId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).send('Archivo Excel no encontrado');
        }
        
        const filePath = results[0].ruta;
        
        // Eliminamos el registro de la base de datos
        const deleteSql = 'DELETE FROM documentos_excel WHERE id = ? AND user_id = ?';
        connection.query(deleteSql, [docId, userId], (err) => {
            if (err) {
                return res.status(500).send('Error al eliminar registro de archivo Excel');
            }
            
            // Intentamos eliminar el archivo físico
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error al eliminar archivo físico:', err);
                    // Aún así consideramos la operación exitosa porque el registro se eliminó
                }
                res.status(200).send('Archivo Excel eliminado correctamente');
            });
        });
    });
});

// Ruta para descargar datos de pacientes en Excel
app.get('/exportar-pacientes-excel', requireLogin, requireRole('admin', 'medico'), (req, res) => {
    const query = 'SELECT * FROM pacientes ORDER BY nombre ASC';
    
    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener pacientes para exportar:', err);
            return res.status(500).send('Error al exportar pacientes');
        }
        
        // Crear libro de Excel
        const worksheet = xlsx.utils.json_to_sheet(results);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Pacientes');
        
        // Generar archivo temporal
        const fileName = `pacientes-${new Date().toISOString().split('T')[0]}.xlsx`;
        const filePath = path.join(__dirname, 'temp', fileName);
        
        // Asegurarse que existe el directorio temp
        if (!fs.existsSync(path.join(__dirname, 'temp'))) {
            fs.mkdirSync(path.join(__dirname, 'temp'));
        }
        
        xlsx.writeFile(workbook, filePath);
        
        // Enviar archivo y luego eliminarlo
        res.download(filePath, fileName, (err) => {
            if (err) {
                console.error('Error al enviar archivo:', err);
            }
            fs.unlink(filePath, (err) => {
                if (err) console.error('Error al eliminar archivo temporal:', err);
            });
        });
    });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

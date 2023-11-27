const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const app = express();
const port = 3000;

// Conectar a la base de datos SQLite
const db = new sqlite3.Database("mi-base-de-datos.db");

// Crear tablas (dueños y citas)
db.serialize(() => {
  // Incluye aquí los comandos CREATE TABLE para cada una de tus tablas
  db.run(
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, phone_number TEXT, password TEXT, client_name TEXT)"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS owners (id INTEGER PRIMARY KEY, phone_number TEXT, password TEXT, client_name TEXT)"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS businesses (id INTEGER PRIMARY KEY, owner_id INTEGER, name TEXT, location TEXT, contact_number TEXT)"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY, owner_id INTEGER, client_name TEXT, date TEXT, time TEXT, business_id INTEGER REFERENCES businesses(id))"
  );
});

// Middleware para parsear el cuerpo de las solicitudes como JSON
app.use(express.json());

// Middleware para hash de contraseñas usando bcrypt
const hashPasswordMiddleware = async (req, res, next) => {
  const { password } = req.body;
  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    req.body.password = hashedPassword;
  }
  next();
};

// Endpoint para registro de usuarios
app.post("/register", hashPasswordMiddleware, (req, res) => {
  const { phone_number, password, is_owner, client_name } = req.body;
  console.log("entrandoendpoint", req.body);
  if (
    !phone_number ||
    !password ||
    is_owner === undefined ||
    (is_owner === false && !client_name)
  ) {
    return res.status(400).json({ error: "Campos incompletos" });
  }

  const tableName = is_owner ? "owners" : "users";

  // Agregar el usuario a la base de datos
  const sql = is_owner
    ? `INSERT INTO ${tableName} (phone_number, password) VALUES (?, ?)`
    : `INSERT INTO ${tableName} (phone_number, password, client_name) VALUES (?, ?, ?)`;

  const params = is_owner
    ? [phone_number, password]
    : [phone_number, password, client_name];
  db.run(sql, params, function (err) {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: "Error interno del servidor" });
    }
    // Éxito al registrar el usuario
    res
      .status(201)
      .json({ id: this.lastID, phone_number, is_owner, client_name });
  });
});

// Endpoint para inicio de sesión de usuarios
app.post("/login", async (req, res) => {
  const { phone_number, password } = req.body;

  if (!phone_number || !password) {
    return res.status(400).json({ error: "Campos incompletos" });
  }

  // Verificar si el usuario es dueño o cliente
  const ownerResult = await queryUser("owners", phone_number, password);
  const userResult = await queryUser("users", phone_number, password);

  if (ownerResult || userResult) {
    res.json({ success: true, is_owner: ownerResult ? true : false });
  } else {
    res.status(401).json({ error: "Credenciales inválidas" });
  }
});
// Endpoint para crear un negocio
app.post("/create-business", (req, res) => {
  const { owner_id, name, location, contact_number } = req.body;

  if (!owner_id || !name || !location || !contact_number) {
    return res.status(400).json({ error: "Campos incompletos" });
  }

  // Verificar si el dueño existe
  db.get("SELECT * FROM owners WHERE id = ?", [owner_id], (err, owner) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: "Error interno del servidor" });
    }

    if (!owner) {
      return res.status(404).json({ error: "Dueño no encontrado" });
    }

    // Agregar el negocio a la base de datos
    const sql =
      "INSERT INTO businesses (owner_id, name, location, contact_number) VALUES (?, ?, ?, ?)";
    const params = [owner_id, name, location, contact_number];

    db.run(sql, params, function (err) {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: "Error interno del servidor" });
      }

      // Éxito al crear el negocio
      res
        .status(201)
        .json({ id: this.lastID, owner_id, name, location, contact_number });
    });
  });
});

// Endpoint para agendar una cita
app.post("/schedule-appointment", (req, res) => {
  const { owner_id, client_name, date, time, business_id } = req.body;

  if (!owner_id || !client_name || !date || !time || !business_id) {
    return res.status(400).json({ error: "Campos incompletos" });
  }

  // Verificar si el dueño y el negocio existen
  db.get("SELECT * FROM owners WHERE id = ?", [owner_id], (err, owner) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: "Error interno del servidor" });
    }

    if (!owner) {
      return res.status(404).json({ error: "Dueño no encontrado" });
    }

    db.get(
      "SELECT * FROM businesses WHERE id = ? AND owner_id = ?",
      [business_id, owner_id],
      (err, business) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ error: "Error interno del servidor" });
        }

        if (!business) {
          return res
            .status(404)
            .json({ error: "Negocio no encontrado o no pertenece al dueño" });
        }

        // Agregar la cita a la base de datos
        const sql =
          "INSERT INTO appointments (owner_id, client_name, date, time, business_id) VALUES (?, ?, ?, ?, ?)";
        const params = [owner_id, client_name, date, time, business_id];

        db.run(sql, params, function (err) {
          if (err) {
            console.error(err.message);
            return res
              .status(500)
              .json({ error: "Error interno del servidor" });
          }

          // Éxito al agendar la cita
          res.status(201).json({
            id: this.lastID,
            owner_id,
            client_name,
            date,
            time,
            business_id,
          });
        });
      }
    );
  });
});

// Endpoint para obtener citas programadas de un cliente
app.get("/appointments/:clientId", (req, res) => {
  const clientId = req.params.clientId;

  // Verificar si el usuario existe y es un cliente
  db.get(
    "SELECT * FROM users WHERE id = ? AND is_owner = 0",
    [clientId],
    (err, user) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: "Error interno del servidor" });
      }

      if (!user) {
        return res
          .status(404)
          .json({ error: "Usuario no encontrado o no es un cliente" });
      }

      // Obtener citas programadas del cliente
      db.all(
        "SELECT * FROM appointments WHERE owner_id = ? ORDER BY date, time",
        [clientId],
        (err, appointments) => {
          if (err) {
            console.error(err.message);
            return res
              .status(500)
              .json({ error: "Error interno del servidor" });
          }

          // Éxito al obtener las citas
          res.json({ client_name: user.client_name, appointments });
        }
      );
    }
  );
});

// Función auxiliar para consultar un usuario en una tabla específica
const queryUser = (tableName, phone_number, password) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM ${tableName} WHERE phone_number = ?`,
      [phone_number],
      (err, row) => {
        if (err) {
          reject(err);
        } else if (row && bcrypt.compareSync(password, row.password)) {
          resolve(row);
        } else {
          resolve(null);
        }
      }
    );
  });
};
// Middleware para parsear el cuerpo de las solicitudes como JSON
app.use(express.json());

// Endpoint para obtener todos los usuarios
app.get("/users", (req, res) => {
  db.all("SELECT * FROM users", (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: "Error interno del servidor" });
    } else {
      res.json(rows);
    }
  });
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor iniciado en http://localhost:${port}`);
});

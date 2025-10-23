// api/test-db.js
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.status(200).json({ message: "Hello from Postgres!", time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database connection failed" });
  }
};

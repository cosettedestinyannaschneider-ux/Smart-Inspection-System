const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306) || 3306,
  user: process.env.DB_USER || 'root',
  // 数据库密码只能通过本地 .env 注入，禁止在仓库中保留默认密码
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ai_project',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool.promise();

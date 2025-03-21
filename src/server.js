const app = require('./app');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const passportConfig = require('./config/passportConfig');
const cors = require('cors');
const express = require('express');
const cluster = require('cluster');
const os = require('os');

dotenv.config();

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

const numCPUs = os.cpus().length;

async function startServer() {
  try {
    await prisma.$connect();
    console.log('Connected to database');

    if (cluster.isMaster) {
      console.log(`Master process started on PID: ${ process.pid }`);

      // Fork workers
      for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
      }

      cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${ worker.process.pid } died`);
        cluster.fork();
      });
    } else {
      app.listen(PORT, () => {
        console.log(`Server running on port ${ PORT } with PID ${ process.pid }`);
    });
  }
  } catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
}

startServer();
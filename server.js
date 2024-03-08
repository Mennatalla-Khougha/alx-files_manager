const express = require('express');

const app = express();
const routes = require('./routes/index');

app.use('/', routes);

app.listen(process.env.DB_PORT || 5000);

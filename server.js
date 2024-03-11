const express = require('express');
// import bodyParser from 'body-parser';

const app = express();
// app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.json());

const routes = require('./routes/index');

const port = process.env.PORT || 5000;

app.use('/', routes);
// app.use(bodyParser.urlencoded({ limit: '10mb' }));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export default app;

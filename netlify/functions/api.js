const express = require("express");
const serverless = require("serverless-http");
const app = express();
const router = express.Router();

app.get("/", (req, res) => res.send("Hello World!"));
app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello from Netlify functions!' });
  });
app.use('/netlify/functions/api', router);
module.exports.handler = serverless(app);
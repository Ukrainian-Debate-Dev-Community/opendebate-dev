# Soslo API

## Remarks:

- **Pasha gay**

- _I will work on this README_

## Install and run

Git clone repo and branch

You also need a .env file that should looks like

```bash
PORT = 322
DB_SERVER = Server_name
DB_USER = Pasha
DB_PASSWORD = Gay
DB_DATABASE = DB_name
NODE_ENV = development
```

In the root type

```bash
npm install
npm run dev
```

_The server will run on `http://localhost:3000` by default_

> **Note on DB creation:** After the first run you have to delete the params of {force:true} at line 36 in src/app.js. Otherwise you will drop the table after each server start.

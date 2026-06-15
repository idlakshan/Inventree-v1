# InvenTree Docker Deployment & Testing Guide

This guide explains how to build the custom Docker image, spin up the containerized stack, initialize the environment, and troubleshoot common issues.

---

## 📋 Prerequisites
Make sure you have the following installed on your machine:
- **Docker Desktop** (running and configured)
- **Git**

---

## 🛠️ Step 1: Configuration (.env)
The environment variables are managed via the `.env` file located in `contrib/container/.env` (and replicated in the project root). 

> [!IMPORTANT]
> If you do not have any custom plugins, ensure **`INVENTREE_PLUGINS_ENABLED=False`** is set in your `.env` file. Leaving it enabled without custom plugin files in Python paths will trigger a `ModuleNotFoundError: No module named 'plugins'`.

---

## 📦 Step 2: Build the Custom Docker Image
To package your customizations (including custom descending sorting settings for Sales Orders and Shipment tables), you need to build the Docker image locally.

Run the following command from the `contrib/container` directory:
```bash
docker compose build inventree-server
```
*Note: This runs a multi-stage Docker build that installs Node.js, compiles the React frontend assets via Vite, installs Python requirements, and copies the backend files into the target production image.*

---

## 🚀 Step 3: Run the Containers
Once built, start the entire container stack (database, cache, server, background worker, and Caddy proxy) in detached mode:
```bash
docker compose up -d
```
To verify that all containers are up and running, check the container status:
```bash
docker compose ps
```
You should see all 5 services (`inventree-db`, `inventree-cache`, `inventree-server`, `inventree-worker`, and `inventree-proxy`) showing a `running` or `Up` status.

---

## 💾 Step 4: Initialize the Database
If you are running this for the first time or recreated the postgres database volume, you must initialize the schema:

1. **Run Database Migrations:**
   ```bash
   docker compose exec inventree-server invoke migrate
   ```
   *This populates the database schema, including crucial tables like `django_session`.*

2. **Collect Static Files:**
   ```bash
   docker compose exec inventree-server invoke static
   ```
   *This copies all built frontend assets (such as JS, CSS, and SVG icons) into the mounted static volume so the Caddy proxy can serve them.*

3. **Create an Admin Superuser:**
   You can create a superuser using the interactive shell or run this python snippet inside the container to quickly set up a default administrator account:
   ```bash
   docker compose exec inventree-server python3 src/backend/InvenTree/manage.py shell -c "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.filter(username='admin').exists() or User.objects.create_superuser('admin', 'admin@example.com', 'admin1234')"
   ```
   * Default Username: `admin`
   * Default Password: `admin1234`

---

## 🌐 Step 5: Access the System
Open your web browser and navigate to:
* **http://localhost** (port 80 proxy)

You should see the login screen. Log in with:
- **Username:** `admin`
- **Password:** `admin1234`

---

## 🔍 Troubleshooting

### 1. `ModuleNotFoundError: No module named 'plugins'`
* **Cause:** Custom plugins are enabled in `.env` but no `plugins` module exists in python search paths.
* **Solution:** Open `.env` and `contrib/container/.env`, locate `INVENTREE_PLUGINS_ENABLED` and set it to `False`. Recreate containers with `docker compose down` and `docker compose up -d`.

### 2. `relation "django_session" does not exist` (500 Internal Server Error)
* **Cause:** The database was not migrated after container creation.
* **Solution:** Run the migration command inside the server container:
  ```bash
  docker compose exec inventree-server invoke migrate
  ```

### 3. Login fails or returns `400 Bad Request` in UI
* **Cause:** The browser's `localStorage` has cached a legacy server host URL from previous local development runs (e.g. `http://localhost:8000`). Because port 8000 is not exposed outside the Docker network, requests fail.
* **Solution:**
  1. On the login screen, click the **Server** selector label at the bottom.
  2. Change the server host URL to **`http://localhost`** (without port `8000`).
  3. Alternatively, clear your browser's local storage and cookies for `localhost`, or open the page in an Incognito window to log in.

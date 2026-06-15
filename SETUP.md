# InvenTree Local Development Setup Guide

This guide provides a step-by-step walkthrough to get InvenTree running on your local machine after cloning the repository.

## Prerequisites

Ensure you have the following installed on your system:

- **Python**: Version 3.9 or higher.
- **Node.js**: Version 18 or higher (for the frontend).Python: Version 3.9 or higher.
Node.js: Version 18 or higher (for the frontend).
PostgreSQL: A running instance (or another supported database like SQLite/MySQL).
Git: To clone and manage the repository.
- **PostgreSQL**: A running instance (or another supported database like SQLite/MySQL).
- **Git**: To clone and manage the repository.

---

## 1. Clone the Repository & create database in local PostgreSQL (database name : inventree)

```bash
git clone https://github.com/Gihan42/inventree.git
cd inventree

```

---

## 2. Backend Setup (Django)

### Create a Virtual Environment

It is highly recommended to use a virtual environment to keep dependencies isolated.

```bash
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate
```

### Install Python Dependencies

```bash
cd src/backend
pip install -r requirements.txt
pip install -r requirements_stripped.txt
```

### Configuration File

InvenTree requires a `config.yaml` file for database and site settings.

1. Go to the `config/` directory in the project root.
2. Ensure `config.yaml` exists. If not, you can create one based on the `src/backend/InvenTree/config_template.yaml`.

**Example `config/config.yaml` for local PostgreSQL:**

```yaml
database:
  engine: postgresql
  name: inventree
  user: postgres
  password: "your_password"
  host: localhost
  port: 5432

debug: True
site_url: "http://localhost:8000"
media_root: "./inventree-data/media"
static_root: "./inventree-data/static"
```

### Run Migrations and Setup

Navigate to the directory containing `manage.py`:

```bash
cd src/backend/InvenTree
#install postgresql in your computer first
pip install psycopg2-binary
python manage.py migrate
python manage.py createsuperuser
```

_Follow the prompts to create your admin account._

---

## 3. Frontend Setup (React/Vite)

The modern InvenTree UI is built with React. You need to install the dependencies and start the dev server.

```bash
cd src/frontend
npm install
npm run compile
```

---

## 4. Running the Application

To run the full application, you need to have two terminals open (or run them in the background).

### Terminal 1: Backend Server

```bash
cd src/backend/InvenTree
python manage.py runserver
```

The backend will be available at [http://localhost:8000](http://localhost:8000).

### Terminal 2: Frontend Server

```bash
cd src/frontend
npm run dev
```

The frontend will be available at [http://localhost:5173](http://localhost:5173).

---

## 5. Accessing InvenTree

1. Open your browser and go to [http://localhost:5173](http://localhost:5173).
2. Log in using the superuser credentials you created earlier.
3. You are now ready to use InvenTree!

---
## Enable PDF Features

1. Download the latest `gtk3-runtime-x.x.x-x-x-x-ts-win64.exe` installer from this GitHub repository: [GTK for Windows Runtime Environment Installer](https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases).
2. Run the downloaded installer.
3. **Crucial Step:** During the installation, make sure you check the box that says **"Set up PATH environment variable to include GTK+"**.

> **Note:** If you missed the checkbox during installation, you can configure the PATH manually:
> 
> - **Find where GTK was installed:** 
>   Open your File Explorer and look for the GTK3 `bin` folder. It is usually located at: `C:\Program Files\GTK3-Runtime Win64\bin` *(Verify this folder exists and contains `.dll` files like `libcairo-2.dll`)*.
> 
> - **Open Environment Variables:**
>   - Press the **Windows Key** on your keyboard.
>   - Type **"Environment Variables"** in the search bar.
>   - Click on **"Edit the system environment variables"** (this opens the System Properties window).
>   - Click the **"Environment Variables..."** button near the bottom right.
> 
> - **Edit the PATH:**
>   - In the bottom section titled **"System variables"**, scroll down until you find the variable named **`Path`**.
>   - Click on **`Path`** to highlight it, then click the **"Edit..."** button.
>   - Click the **"New"** button on the right side.
>   - Paste the path to the bin folder: `C:\Program Files\GTK3-Runtime Win64\bin`
>   - Click **OK** on all three windows to save your changes.

4. **Restart your Terminal:** After installation or manual path changes, restart your terminal and run `python manage.py runserver` again!

## Troubleshooting

- **Database Connection**: Ensure your PostgreSQL service is running and the credentials in `config.yaml` are correct.
- **Missing Dependencies**: If you encounter errors about missing Python packages, try running `pip install -r requirements.txt` again.
- **Frontend Issues**: Ensure you have run `npm install` in the `src/frontend` directory.


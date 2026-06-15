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

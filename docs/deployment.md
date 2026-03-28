# Guía de Despliegue — FitAI Assistant

## Requisitos del Servidor

### VPS Mínima

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| vCPU | 2 | 4 |
| RAM | 4 GB | 8 GB |
| Almacenamiento | 40 GB SSD | 80 GB SSD |
| SO | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Ancho de banda | 1 TB/mes | 2 TB/mes |

### Proveedores Recomendados

- DigitalOcean (Droplets)
- Hetzner Cloud
- Vultr
- Linode/Akamai

Un VPS de ~$20-30 USD/mes es suficiente para los primeros 100-200 usuarios activos.

---

## 1. Preparación del Servidor

### Actualizar el Sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw
```

### Crear Usuario No-Root

```bash
sudo adduser fitai
sudo usermod -aG sudo fitai
su - fitai
```

### Configurar UFW (Firewall)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

**Puertos abiertos**:
- 22 (SSH)
- 80 (HTTP → redirige a HTTPS)
- 443 (HTTPS)

**Puertos cerrados** (solo accesibles dentro de Docker network):
- 5432 (PostgreSQL)
- 6379 (Redis)
- 6333 (Qdrant)
- 5678 (n8n)
- 3000 (Admin panel)

---

## 2. Instalación de Docker y Docker Compose

### Instalar Docker

```bash
# Instalar dependencias
sudo apt install -y apt-transport-https ca-certificates gnupg lsb-release

# Agregar repositorio oficial de Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Agregar usuario al grupo docker (evita necesitar sudo)
sudo usermod -aG docker fitai
newgrp docker

# Verificar
docker --version
docker compose version
```

---

## 3. Clonar el Proyecto

```bash
cd /opt
sudo mkdir fitai
sudo chown fitai:fitai fitai
cd fitai

git clone <repo-url> .
```

---

## 4. Configurar Variables de Entorno

```bash
cp .env.example .env
nano .env
```

Llenar TODOS los valores requeridos:

```bash
# Generar secrets seguros
openssl rand -hex 32  # Para N8N_ENCRYPTION_KEY
openssl rand -hex 32  # Para ADMIN_PANEL_SECRET_KEY
openssl rand -hex 16  # Para TELEGRAM_WEBHOOK_SECRET
```

**Valores críticos que DEBEN cambiarse**:
- `POSTGRES_PASSWORD` — contraseña fuerte para PostgreSQL
- `N8N_ENCRYPTION_KEY` — clave de encriptación de credenciales de n8n
- `ADMIN_PANEL_SECRET_KEY` — secret para sesiones del panel admin
- `TELEGRAM_WEBHOOK_SECRET` — secret para verificar webhooks
- `OPENAI_API_KEY` — tu API key de OpenAI
- `TELEGRAM_BOT_TOKEN` — token de tu bot de Telegram

**Actualizar para producción**:
- `NODE_ENV=production`
- `N8N_BASE_URL=https://tudominio.com/n8n`
- `DOMAIN=tudominio.com`

---

## 5. Configurar Nginx para Producción

Editar `infra/nginx.conf`:

1. Cambiar `server_name localhost` por tu dominio real
2. Descomentar el bloque de redirección HTTP → HTTPS
3. Descomentar las líneas de SSL

```bash
nano infra/nginx.conf
# Reemplazar "localhost" con "tudominio.com"
# Reemplazar "fitai.tudominio.com" con tu dominio real
```

---

## 6. Primer Deploy

### Levantar los Servicios Base

```bash
# Primero levantar solo la base de datos para que se inicialice
docker compose up -d postgres
sleep 10

# Verificar que PostgreSQL está listo
docker compose exec postgres pg_isready -U fitai

# Levantar el resto de servicios
docker compose up -d
```

### Verificar Estado

```bash
docker compose ps
# Todos los servicios deben estar en estado "Up" o "healthy"

docker compose logs --tail=20
# Verificar que no hay errores
```

### Crear Tablas en la Base de Datos

```bash
# Ejecutar el schema inicial
docker compose exec -T postgres psql -U fitai -d fitai_db < migrations/001_initial_schema.sql
```

### Crear Primer Admin

```bash
docker compose exec admin-panel node scripts/create-admin.js \
  --email admin@tudominio.com \
  --password "contraseña-segura-de-admin" \
  --name "Administrador"
```

---

## 7. Configurar SSL con Certbot

### Instalar Certbot

```bash
sudo apt install -y certbot
```

### Obtener Certificado

```bash
# Detener nginx temporalmente
docker compose stop nginx

# Obtener certificado
sudo certbot certonly --standalone -d tudominio.com --agree-tos --email tu@email.com

# Copiar certificados al volumen de Docker
sudo cp -rL /etc/letsencrypt /opt/fitai/certbot_certs/
# O actualizar docker-compose.yml para montar /etc/letsencrypt directamente
```

### Activar SSL en Nginx

1. Editar `infra/nginx.conf` — descomentar las líneas de SSL
2. Descomentar el bloque de redirección HTTP → HTTPS
3. Actualizar las rutas de los certificados

```bash
docker compose restart nginx
```

### Renovación Automática

```bash
# Agregar cron para renovación automática
sudo crontab -e
# Agregar:
0 3 * * * certbot renew --quiet && docker compose -f /opt/fitai/docker-compose.yml restart nginx
```

---

## 8. Configurar Webhook de Telegram

```bash
# Configurar el webhook apuntando a tu servidor
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tudominio.com/webhook/fitai-telegram",
    "secret_token": "tu-webhook-secret",
    "allowed_updates": ["message", "callback_query"]
  }'

# Verificar que el webhook se configuró correctamente
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

---

## 9. Importar Workflows en n8n

### Acceder a n8n

1. Abrir `https://tudominio.com/n8n/` en el navegador
2. Crear cuenta de n8n (primera vez)
3. Configurar credenciales (OpenAI, Telegram, PostgreSQL, Redis, Qdrant)

### Importar Workflows

1. Ir a **Workflows** → **Import from File**
2. Importar en el orden especificado en `n8n/workflows/README.md`:
   - Primero: Meal Plan Generator, Workout Plan Generator, Progress Calculator, RAG Personal Indexer
   - Segundo: Onboarding Flow, Main AI Agent
   - Tercero: Telegram Webhook Handler
   - Último: Meal Reminder Scheduler, Weight Update Requester, Membership Alert
3. Asignar credenciales a cada nodo que las requiera
4. Activar los workflows uno por uno, probando cada uno

### Crear Colecciones en Qdrant

```bash
# Crear colección para RAG de conocimiento
curl -X PUT "http://localhost:6333/collections/knowledge_rag" \
  -H "Content-Type: application/json" \
  -d '{ "vectors": { "size": 1536, "distance": "Cosine" } }'

# Crear colección para RAG personal
curl -X PUT "http://localhost:6333/collections/user_rag" \
  -H "Content-Type: application/json" \
  -d '{ "vectors": { "size": 1536, "distance": "Cosine" } }'
```

---

## 10. Backups Automáticos de PostgreSQL

### Script de Backup

Crear `/opt/fitai/scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/opt/fitai/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p $BACKUP_DIR

# Crear backup comprimido
docker compose -f /opt/fitai/docker-compose.yml exec -T postgres \
  pg_dump -U fitai -d fitai_db --format=custom \
  > "$BACKUP_DIR/fitai_db_$TIMESTAMP.dump"

# Verificar que el backup se creó correctamente
if [ $? -eq 0 ]; then
  echo "Backup creado: fitai_db_$TIMESTAMP.dump"
else
  echo "ERROR: Backup falló" >&2
  exit 1
fi

# Eliminar backups antiguos
find $BACKUP_DIR -name "fitai_db_*.dump" -mtime +$RETENTION_DAYS -delete
echo "Backups antiguos (>$RETENTION_DAYS días) eliminados"
```

```bash
chmod +x /opt/fitai/scripts/backup.sh
```

### Programar Backup Diario

```bash
crontab -e
# Agregar:
0 2 * * * /opt/fitai/scripts/backup.sh >> /opt/fitai/logs/backup.log 2>&1
```

### Restaurar un Backup

```bash
# Restaurar desde un archivo de backup
docker compose exec -T postgres pg_restore -U fitai -d fitai_db --clean < backups/fitai_db_20260326_020000.dump
```

---

## 11. Monitoreo Básico

### Logs

```bash
# Ver logs de todos los servicios
docker compose logs --tail=100 -f

# Ver logs de un servicio específico
docker compose logs --tail=50 -f n8n
docker compose logs --tail=50 -f admin-panel
docker compose logs --tail=50 -f postgres
```

### Health Checks

```bash
# Verificar salud de todos los servicios
docker compose ps

# Health check de nginx
curl -s https://tudominio.com/health

# Health check del panel admin
curl -s http://localhost:3000/health
```

### Script de Monitoreo Simple

Crear `/opt/fitai/scripts/health-check.sh`:

```bash
#!/bin/bash
SERVICES=("postgres" "redis" "qdrant" "n8n" "admin-panel" "nginx")

for SERVICE in "${SERVICES[@]}"; do
  STATUS=$(docker compose -f /opt/fitai/docker-compose.yml ps --format json $SERVICE 2>/dev/null | grep -o '"Status":"[^"]*"' | head -1)
  if echo "$STATUS" | grep -q "running"; then
    echo "✓ $SERVICE: OK"
  else
    echo "✗ $SERVICE: DOWN"
    # Opcional: enviar alerta
    # curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    #   -d "chat_id=${ADMIN_CHAT_ID}&text=⚠️ FitAI: El servicio $SERVICE está caído"
  fi
done
```

```bash
chmod +x /opt/fitai/scripts/health-check.sh

# Programar cada 5 minutos
crontab -e
# Agregar:
*/5 * * * * /opt/fitai/scripts/health-check.sh >> /opt/fitai/logs/health.log 2>&1
```

### Espacio en Disco

```bash
# Verificar uso de volúmenes Docker
docker system df

# Limpieza de recursos no usados (imágenes, contenedores parados, etc.)
docker system prune -f
```

---

## 12. Actualización sin Downtime

### Proceso de Actualización

```bash
cd /opt/fitai

# 1. Pull de cambios
git pull origin main

# 2. Backup antes de actualizar
./scripts/backup.sh

# 3. Rebuild solo los servicios que cambiaron
docker compose build admin-panel  # Si cambió el panel admin

# 4. Rolling restart (un servicio a la vez)
docker compose up -d --no-deps admin-panel
# Esperar a que esté healthy
docker compose up -d --no-deps n8n
# Esperar a que esté healthy

# 5. Verificar estado
docker compose ps
curl -s https://tudominio.com/health

# 6. Ejecutar migraciones pendientes (si hay)
docker compose exec -T postgres psql -U fitai -d fitai_db < migrations/XXX_new_migration.sql
```

### Rollback

```bash
# Si algo sale mal, volver a la versión anterior
git checkout HEAD~1

# Rebuild y restart
docker compose build
docker compose up -d

# Restaurar backup si es necesario
docker compose exec -T postgres pg_restore -U fitai -d fitai_db --clean < backups/latest.dump
```

---

## Checklist de Deploy

- [ ] VPS provisionado con Ubuntu 22.04
- [ ] Docker y Docker Compose instalados
- [ ] Proyecto clonado en `/opt/fitai`
- [ ] `.env` configurado con todos los valores reales
- [ ] `infra/nginx.conf` actualizado con dominio real
- [ ] PostgreSQL levantado y schema inicial ejecutado
- [ ] Primer usuario admin creado
- [ ] SSL configurado con Certbot
- [ ] Webhook de Telegram configurado
- [ ] Colecciones de Qdrant creadas
- [ ] Workflows importados y credenciales asignadas en n8n
- [ ] Workflows activados y probados
- [ ] Backup automático programado
- [ ] Health check programado
- [ ] Firewall (UFW) configurado
- [ ] Primer mensaje de prueba enviado al bot
